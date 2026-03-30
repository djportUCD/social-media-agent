import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { traceable } from "langsmith/traceable";
import { parseStringPromise } from "xml2js";
import {
  BUSINESS_STORY_CACHE_ONLY,
  BUSINESS_STORY_LIMIT,
  BUSINESS_STORY_LOOKBACK_HOURS,
} from "../../generate-post/constants.js";
import {
  listBusinessPluginIds,
  loadBusinessPlugin,
  loadBusinessPluginById,
} from "../../../plugins/runtime.js";
import {
  BusinessStoryDiscovery,
} from "../../../plugins/types.js";
import { createDirIfNotExists } from "../../../utils/create-dir.js";
import {
  buildStoryFeedbackProfile,
  getAcceptedStoryPriorityUrls,
  readStoryFeedbackMemory,
  StoryFeedbackMemory,
  StoryFeedbackProfile,
} from "./story-feedback.js";

const DEFAULT_STORY_LOOKBACK_HOURS = 2160;

type RSSItem = {
  title?: string[];
  link?: string[];
  pubDate?: string[];
  description?: string[];
  content?: string[];
};

type RSSFeed = {
  rss?: {
    channel?: Array<{
      item?: RSSItem[];
    }>;
  };
  feed?: {
    entry?: Array<{
      title?: Array<string | { _: string }>;
      link?: Array<{ $?: { href?: string } }>;
      updated?: string[];
      published?: string[];
      summary?: Array<string | { _: string }>;
    }>;
  };
};

export type BusinessStoryCandidate = {
  title: string;
  link: string;
  description: string;
  publishedAt?: string;
  matchedKeywords: string[];
  sourceFeed: string;
  score: number;
};

export type BusinessStoryCache = {
  businessId: string;
  generatedAt: string;
  links: string[];
  stories: BusinessStoryCandidate[];
};

type RefreshBusinessStoriesOptions = {
  businessId?: string;
  config?: LangGraphRunnableConfig;
};

type PrioritizeStoryCacheOptions = {
  now?: Date;
  prioritizedAcceptedStoriesLimit?: number;
};

function getRepoRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../..");
}

function getStoriesCacheDir(): string {
  return path.join(getRepoRoot(), "stories", "cache");
}

function getStoryCachePath(businessId: string): string {
  return path.join(getStoriesCacheDir(), `${businessId}.json`);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getUrlDomain(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getStringArrayValue(value: Array<string | { _: string }> | undefined): string {
  return value
    ?.map((item) => (typeof item === "string" ? item : item._ || ""))
    .join(" ")
    .trim() || "";
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function getNumberConfig(
  config: LangGraphRunnableConfig | undefined,
  key: string,
  envKey: string,
  fallback: number,
): number {
  const configuredValue = config?.configurable?.[key];
  if (typeof configuredValue === "number" && Number.isFinite(configuredValue)) {
    return configuredValue;
  }

  const envValue = process.env[envKey];
  if (typeof envValue === "string") {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function getBooleanConfig(
  config: LangGraphRunnableConfig | undefined,
  key: string,
  envKey: string,
): boolean {
  const configuredValue = config?.configurable?.[key];
  if (typeof configuredValue === "boolean") {
    return configuredValue;
  }

  return process.env[envKey] === "true";
}

export function getCachedStories(
  businessId: string,
): BusinessStoryCache | undefined {
  const cachePath = getStoryCachePath(businessId);
  if (!fs.existsSync(cachePath)) {
    return undefined;
  }

  const raw = fs.readFileSync(cachePath, "utf8");
  return prioritizeAcceptedStoriesInCache(
    JSON.parse(raw) as BusinessStoryCache,
    readStoryFeedbackMemory(businessId),
  );
}

function writeCachedStories(cache: BusinessStoryCache): void {
  createDirIfNotExists(getStoriesCacheDir());
  fs.writeFileSync(getStoryCachePath(cache.businessId), JSON.stringify(cache, null, 2));
}

export function prioritizeAcceptedStoriesInCache(
  cache: BusinessStoryCache,
  feedbackMemory: StoryFeedbackMemory,
  options?: PrioritizeStoryCacheOptions,
): BusinessStoryCache {
  const prioritizedUrls = getAcceptedStoryPriorityUrls(feedbackMemory, {
    now: options?.now,
    limit: options?.prioritizedAcceptedStoriesLimit ?? 5,
  });

  if (!prioritizedUrls.length) {
    return cache;
  }

  const prioritizedUrlSet = new Set(prioritizedUrls);
  const storyByUrl = new Map(cache.stories.map((story) => [story.link, story]));
  const prioritizedStories = prioritizedUrls
    .map((url) => storyByUrl.get(url))
    .filter(isDefined);
  const remainingStories = cache.stories.filter(
    (story) => !prioritizedUrlSet.has(story.link),
  );
  const orderedStories = [...prioritizedStories, ...remainingStories];

  return {
    ...cache,
    links: orderedStories.map((story) => story.link),
    stories: orderedStories,
  };
}

async function fetchFeedCandidates(feedUrl: string): Promise<BusinessStoryCandidate[]> {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed '${feedUrl}': ${response.status} ${response.statusText}`);
  }

  const xmlContent = await response.text();
  const parsedFeed = (await parseStringPromise(xmlContent)) as RSSFeed;
  const rssItems = parsedFeed.rss?.channel?.[0]?.item ?? [];
  const atomEntries = parsedFeed.feed?.entry ?? [];

  const rssCandidates = rssItems
    .map<BusinessStoryCandidate | undefined>((item) => {
      const title = item.title?.[0]?.trim() || "";
      const link = item.link?.[0]?.trim() || "";
      const description = (item.description?.[0] || item.content?.[0] || "").trim();
      const publishedAt = item.pubDate?.[0];
      if (!title || !link) {
        return undefined;
      }

      return {
        title,
        link,
        description,
        publishedAt,
        matchedKeywords: [],
        sourceFeed: feedUrl,
        score: 0,
      } satisfies BusinessStoryCandidate;
    })
    .filter(isDefined);

  const atomCandidates = atomEntries
    .map<BusinessStoryCandidate | undefined>((entry) => {
      const title = getStringArrayValue(entry.title);
      const link = entry.link?.[0]?.$?.href?.trim() || "";
      const description = getStringArrayValue(entry.summary);
      const publishedAt = entry.updated?.[0] || entry.published?.[0];
      if (!title || !link) {
        return undefined;
      }

      return {
        title,
        link,
        description,
        publishedAt,
        matchedKeywords: [],
        sourceFeed: feedUrl,
        score: 0,
      } satisfies BusinessStoryCandidate;
    })
    .filter(isDefined);

  return [...rssCandidates, ...atomCandidates];
}

export function selectBusinessStoryCandidates(
  candidates: BusinessStoryCandidate[],
  discovery: BusinessStoryDiscovery,
  options?: {
    lookbackHours?: number;
    storyLimit?: number;
    now?: Date;
    feedbackProfile?: StoryFeedbackProfile;
  },
): BusinessStoryCandidate[] {
  const now = options?.now ?? new Date();
  const lookbackHours = options?.lookbackHours ?? DEFAULT_STORY_LOOKBACK_HOURS;
  const storyLimit = options?.storyLimit ?? discovery.maxStories;
  const feedbackProfile = options?.feedbackProfile;
  const requiredKeywords = discovery.keywords.map(normalizeText);
  const excludedKeywords = discovery.excludedKeywords.map(normalizeText);
  const excludedDomains = discovery.excludedDomains.map((domain) =>
    normalizeText(domain),
  );
  const preferredDomains = discovery.preferredDomains.map((domain) =>
    normalizeText(domain),
  );

  return candidates
    .map<BusinessStoryCandidate | undefined>((candidate) => {
      const haystack = normalizeText(
        `${candidate.title} ${candidate.description} ${candidate.link}`,
      );
      if (
        excludedKeywords.some((keyword) => keyword && haystack.includes(keyword))
      ) {
        return undefined;
      }

      if (
        excludedDomains.some(
          (domain) => domain && candidate.link.toLowerCase().includes(domain),
        )
      ) {
        return undefined;
      }

      const matchedKeywords = requiredKeywords.filter(
        (keyword) => keyword && haystack.includes(keyword),
      );

      if (requiredKeywords.length && matchedKeywords.length === 0) {
        return undefined;
      }

      const publishedDate = candidate.publishedAt
        ? new Date(candidate.publishedAt)
        : undefined;
      if (
        publishedDate &&
        !Number.isNaN(publishedDate.getTime()) &&
        now.getTime() - publishedDate.getTime() > lookbackHours * 60 * 60 * 1000
      ) {
        return undefined;
      }

      const preferredDomainBonus = preferredDomains.some(
        (domain) => domain && candidate.link.toLowerCase().includes(domain),
      )
        ? 2
        : 0;
      const recencyBonus = publishedDate
        ? Math.max(0, 2 - (now.getTime() - publishedDate.getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      const normalizedDomain = normalizeText(getUrlDomain(candidate.link));
      if (feedbackProfile?.rejectedUrls.has(candidate.link)) {
        return undefined;
      }

      let learnedScore = 0;
      learnedScore += (feedbackProfile?.acceptedDomains.get(normalizedDomain) || 0) * 1.5;
      learnedScore -= (feedbackProfile?.rejectedDomains.get(normalizedDomain) || 0) * 2;

      for (const keyword of matchedKeywords) {
        const normalizedKeyword = normalizeText(keyword);
        learnedScore +=
          (feedbackProfile?.acceptedKeywords.get(normalizedKeyword) || 0) * 1.25;
        learnedScore -=
          (feedbackProfile?.rejectedKeywords.get(normalizedKeyword) || 0) * 1.5;
      }

      for (const [term, count] of feedbackProfile?.rejectedReasonTerms || []) {
        if (haystack.includes(term)) {
          learnedScore -= count;
        }
      }

      for (const [term, count] of feedbackProfile?.acceptedReasonTerms || []) {
        if (haystack.includes(term)) {
          learnedScore += count * 0.75;
        }
      }

      if (feedbackProfile?.acceptedUrls.has(candidate.link)) {
        learnedScore += 4;
      }

      return {
        ...candidate,
        matchedKeywords,
        score:
          matchedKeywords.length * 3 +
          preferredDomainBonus +
          recencyBonus +
          learnedScore,
      } satisfies BusinessStoryCandidate;
    })
    .filter(isDefined)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightDate = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
      const leftDate = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
      return rightDate - leftDate;
    })
    .filter(
      (candidate, index, allCandidates) =>
        allCandidates.findIndex((value) => value.link === candidate.link) === index,
    )
    .slice(0, storyLimit);
}

async function refreshBusinessStoriesFunc(
  options?: RefreshBusinessStoriesOptions,
): Promise<BusinessStoryCache> {
  const business = options?.businessId
    ? loadBusinessPluginById(options.businessId)
    : loadBusinessPlugin(options?.config);
  const discovery = business.storyDiscovery;
  const lookbackHours = getNumberConfig(
    options?.config,
    BUSINESS_STORY_LOOKBACK_HOURS,
    "BUSINESS_STORY_LOOKBACK_HOURS",
    discovery.lookbackHours ?? DEFAULT_STORY_LOOKBACK_HOURS,
  );
  const storyLimit = getNumberConfig(
    options?.config,
    BUSINESS_STORY_LIMIT,
    "BUSINESS_STORY_LIMIT",
    discovery.maxStories,
  );
  const feedbackProfile = buildStoryFeedbackProfile(
    readStoryFeedbackMemory(business.id),
  );

  if (!discovery.rssFeeds.length) {
    const emptyCache = {
      businessId: business.id,
      generatedAt: new Date().toISOString(),
      links: [],
      stories: [],
    } satisfies BusinessStoryCache;
    writeCachedStories(emptyCache);
    return emptyCache;
  }

  const allCandidates = (
    await Promise.all(
      discovery.rssFeeds.map(async (feedUrl) => {
        try {
          return await fetchFeedCandidates(feedUrl);
        } catch (error) {
          console.warn(
            `Failed to refresh business story feed '${feedUrl}' for ${business.id}:`,
            error,
          );
          return [] as BusinessStoryCandidate[];
        }
      }),
    )
  ).flat();
  const stories = selectBusinessStoryCandidates(allCandidates, discovery, {
    lookbackHours,
    storyLimit,
    feedbackProfile,
  });
  const cache = prioritizeAcceptedStoriesInCache(
    {
    businessId: business.id,
    generatedAt: new Date().toISOString(),
    links: stories.map((story) => story.link),
    stories,
    } satisfies BusinessStoryCache,
    readStoryFeedbackMemory(business.id),
  );
  writeCachedStories(cache);
  return cache;
}

export const refreshBusinessStories = traceable(refreshBusinessStoriesFunc, {
  name: "refresh-business-stories",
});

async function loadBusinessStoryLinksFunc(
  config?: LangGraphRunnableConfig,
): Promise<string[]> {
  const business = loadBusinessPlugin(config);
  const cacheOnly = getBooleanConfig(
    config,
    BUSINESS_STORY_CACHE_ONLY,
    "BUSINESS_STORY_CACHE_ONLY",
  );

  if (cacheOnly) {
    return getCachedStories(business.id)?.links || [];
  }

  try {
    const refreshed = await refreshBusinessStories({ config });
    if (refreshed.links.length) {
      return refreshed.links;
    }
  } catch (error) {
    console.warn(`Failed to refresh business stories for ${business.id}:`, error);
  }

  return getCachedStories(business.id)?.links || [];
}

export const businessStoriesLoader = traceable(loadBusinessStoryLinksFunc, {
  name: "business-stories-loader",
});

export function buildGoogleNewsRssUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export function buildGoogleNewsPhraseQuery(phrases: string[]): string {
  const includedPhrases = phrases
    .filter((phrase) => phrase.trim().length)
    .map((phrase) => `\"${escapeXml(phrase.trim())}\"`);
  return includedPhrases.join(" OR ");
}

export function getAllConfiguredBusinessIds(): string[] {
  return listBusinessPluginIds();
}
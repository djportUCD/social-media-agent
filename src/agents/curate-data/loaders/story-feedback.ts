import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDirIfNotExists } from "../../../utils/create-dir.js";

export type StoryFeedbackDecision = "accept" | "reject";

export type StoryFeedbackEntry = {
  url: string;
  title: string;
  businessId: string;
  decision: StoryFeedbackDecision;
  reason?: string;
  recordedAt: string;
  sourceFeed?: string;
  matchedKeywords?: string[];
  domain: string;
};

export type StoryFeedbackMemory = {
  businessId: string;
  entries: StoryFeedbackEntry[];
};

export type StoryFeedbackProfile = {
  acceptedUrls: Set<string>;
  rejectedUrls: Set<string>;
  acceptedDomains: Map<string, number>;
  rejectedDomains: Map<string, number>;
  acceptedKeywords: Map<string, number>;
  rejectedKeywords: Map<string, number>;
  acceptedReasonTerms: Map<string, number>;
  rejectedReasonTerms: Map<string, number>;
};

const DEFAULT_ACCEPTED_STORY_PRIORITY_DAYS = 30;

type RecordStoryFeedbackArgs = {
  businessId: string;
  url: string;
  title: string;
  decision: StoryFeedbackDecision;
  reason?: string;
  sourceFeed?: string;
  matchedKeywords?: string[];
};

function getRepoRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../../..");
}

function getStoriesFeedbackDir(): string {
  return path.join(getRepoRoot(), "stories", "feedback");
}

function getStoriesFeedbackPath(businessId: string): string {
  return path.join(getStoriesFeedbackDir(), `${businessId}.json`);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getDomain(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) || 0) + 1);
}

function tokenizeReason(reason: string | undefined): string[] {
  if (!reason) {
    return [];
  }

  return normalizeText(reason)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

export function readStoryFeedbackMemory(businessId: string): StoryFeedbackMemory {
  const feedbackPath = getStoriesFeedbackPath(businessId);
  if (!fs.existsSync(feedbackPath)) {
    return {
      businessId,
      entries: [],
    };
  }

  const raw = fs.readFileSync(feedbackPath, "utf8");
  return JSON.parse(raw) as StoryFeedbackMemory;
}

function writeStoryFeedbackMemory(memory: StoryFeedbackMemory): void {
  createDirIfNotExists(getStoriesFeedbackDir());
  fs.writeFileSync(
    getStoriesFeedbackPath(memory.businessId),
    JSON.stringify(memory, null, 2),
  );
}

export function recordStoryFeedback(
  args: RecordStoryFeedbackArgs,
): StoryFeedbackEntry {
  const memory = readStoryFeedbackMemory(args.businessId);
  const entry: StoryFeedbackEntry = {
    businessId: args.businessId,
    url: args.url,
    title: args.title,
    decision: args.decision,
    reason: args.reason?.trim() || undefined,
    recordedAt: new Date().toISOString(),
    sourceFeed: args.sourceFeed,
    matchedKeywords: args.matchedKeywords || [],
    domain: getDomain(args.url),
  };

  const filteredEntries = memory.entries.filter((item) => item.url !== entry.url);
  filteredEntries.push(entry);
  writeStoryFeedbackMemory({
    businessId: args.businessId,
    entries: filteredEntries.sort((left, right) =>
      left.recordedAt.localeCompare(right.recordedAt),
    ),
  });

  return entry;
}

export function getStoryFeedbackForUrl(
  businessId: string,
  url: string,
): StoryFeedbackEntry | undefined {
  return readStoryFeedbackMemory(businessId).entries.find((entry) => entry.url === url);
}

export function buildAcceptedStorySourceContext(
  entry: StoryFeedbackEntry,
  businessDisplayName?: string,
): string {
  const reviewDate = entry.recordedAt.slice(0, 10);
  const businessText = businessDisplayName || entry.businessId;
  const reasonText = entry.reason?.trim()
    ? ` Accepted because: ${entry.reason.trim()}`
    : "";
  return `Manually accepted from the ${businessText} story review queue on ${reviewDate}: ${entry.title}.${reasonText}`;
}

export function getAcceptedStorySourceContext(
  businessId: string,
  url: string,
  options?: {
    businessDisplayName?: string;
  },
): string | undefined {
  const entry = readStoryFeedbackMemory(businessId).entries.find(
    (item) => item.url === url && item.decision === "accept",
  );
  if (!entry) {
    return undefined;
  }

  return buildAcceptedStorySourceContext(entry, options?.businessDisplayName);
}

export function buildStoryFeedbackProfile(
  memory: StoryFeedbackMemory,
): StoryFeedbackProfile {
  const profile: StoryFeedbackProfile = {
    acceptedUrls: new Set<string>(),
    rejectedUrls: new Set<string>(),
    acceptedDomains: new Map<string, number>(),
    rejectedDomains: new Map<string, number>(),
    acceptedKeywords: new Map<string, number>(),
    rejectedKeywords: new Map<string, number>(),
    acceptedReasonTerms: new Map<string, number>(),
    rejectedReasonTerms: new Map<string, number>(),
  };

  for (const entry of memory.entries) {
    const keywordMap =
      entry.decision === "accept"
        ? profile.acceptedKeywords
        : profile.rejectedKeywords;
    const domainMap =
      entry.decision === "accept"
        ? profile.acceptedDomains
        : profile.rejectedDomains;

    if (entry.decision === "accept") {
      profile.acceptedUrls.add(entry.url);
    } else {
      profile.rejectedUrls.add(entry.url);
    }

    incrementCount(domainMap, normalizeText(entry.domain));

    for (const keyword of entry.matchedKeywords || []) {
      incrementCount(keywordMap, normalizeText(keyword));
    }

    if (entry.decision === "accept") {
      for (const token of tokenizeReason(entry.reason)) {
        incrementCount(profile.acceptedReasonTerms, token);
      }
    }

    if (entry.decision === "reject") {
      for (const token of tokenizeReason(entry.reason)) {
        incrementCount(profile.rejectedReasonTerms, token);
      }
    }
  }

  return profile;
}

export function getAcceptedStoryPriorityUrls(
  memory: StoryFeedbackMemory,
  options?: {
    now?: Date;
    withinDays?: number;
    limit?: number;
  },
): string[] {
  const now = options?.now ?? new Date();
  const withinDays =
    options?.withinDays ?? DEFAULT_ACCEPTED_STORY_PRIORITY_DAYS;
  const limit = options?.limit ?? Number.POSITIVE_INFINITY;
  const cutoff = now.getTime() - withinDays * 24 * 60 * 60 * 1000;

  return memory.entries
    .filter((entry) => entry.decision === "accept")
    .filter((entry) => {
      const recordedAt = new Date(entry.recordedAt).getTime();
      return Number.isFinite(recordedAt) && recordedAt >= cutoff;
    })
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .map((entry) => entry.url)
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, limit);
}
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  BUSINESS_PLUGIN_ID,
  PLATFORM_PLUGIN_ID,
  SOCIAL_MODEL_NAME,
  SOCIAL_MODEL_PROVIDER,
  SOCIAL_OLLAMA_BASE_URL,
} from "../agents/generate-post/constants.js";
import {
  BusinessPlugin,
  BusinessPluginSchema,
  PlatformAnalytics,
  PlatformProfile,
  PlatformProfileSchema,
  SocialModelProvider,
} from "./types.js";

const DEFAULT_BUSINESS_PLUGIN_ID = "default";
const DEFAULT_PLATFORM_PLUGIN_ID = "crosspost";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

type RuntimeSocialConfig = {
  businessPluginId: string;
  platformPluginId: string;
  modelProvider: SocialModelProvider;
  modelName?: string;
  ollamaBaseUrl: string;
};

function getRepoRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../..");
}

function getPluginsRoot(): string {
  return path.join(getRepoRoot(), "plugins");
}

function getPluginIds(directory: string): string[] {
  const pluginDirectory = path.join(getPluginsRoot(), directory);
  return fs
    .readdirSync(pluginDirectory)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => fileName.replace(/\.json$/i, ""))
    .sort();
}

function getConfigString(
  config: LangGraphRunnableConfig | undefined,
  key: string,
  envKey: string,
): string | undefined {
  const configuredValue = config?.configurable?.[key];
  if (typeof configuredValue === "string" && configuredValue.trim().length) {
    return configuredValue.trim();
  }

  const envValue = process.env[envKey];
  if (typeof envValue === "string" && envValue.trim().length) {
    return envValue.trim();
  }

  return undefined;
}

function parsePluginFile<T>(
  directory: string,
  id: string,
  parse: (value: unknown) => T,
  fallbackId?: string,
): T {
  const filePath = path.join(getPluginsRoot(), directory, `${id}.json`);

  try {
    const rawContent = fs.readFileSync(filePath, "utf8");
    return parse(JSON.parse(rawContent));
  } catch (error) {
    if (fallbackId && fallbackId !== id) {
      return parsePluginFile(directory, fallbackId, parse);
    }

    if (error instanceof Error) {
      throw new Error(
        `Failed to load plugin '${id}' from ${directory}: ${error.message}`,
      );
    }

    throw error;
  }
}

function inferProvider(
  provider: string | undefined,
  modelName: string | undefined,
): SocialModelProvider {
  if (provider === "anthropic" || provider === "openai" || provider === "ollama") {
    return provider;
  }

  if (modelName?.startsWith("ollama:")) {
    return "ollama";
  }

  if (process.env.OLLAMA_MODEL || process.env.OLLAMA_HOST) {
    return "ollama";
  }

  return "anthropic";
}

function formatList(items: string[], emptyText = "None provided."): string {
  if (!items.length) {
    return `- ${emptyText}`;
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTrendResearchExcerpts(
  urls: string[],
): Promise<string[]> {
  if (process.env.ENABLE_PLATFORM_TREND_FETCH !== "true") {
    return [];
  }

  const excerpts = await Promise.all(
    urls.slice(0, 2).map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
        });

        if (!response.ok) {
          return undefined;
        }

        const text = stripHtml(await response.text());
        if (!text.length) {
          return undefined;
        }

        return `Source: ${url}\n${text.slice(0, 1200)}`;
      } catch (error) {
        console.warn(`Failed to fetch trend research from ${url}:`, error);
        return undefined;
      }
    }),
  );

  return excerpts.filter((excerpt): excerpt is string => !!excerpt);
}

export function resolveSocialRuntimeConfig(
  config?: LangGraphRunnableConfig,
): RuntimeSocialConfig {
  const businessPluginId =
    getConfigString(config, BUSINESS_PLUGIN_ID, "SOCIAL_BUSINESS_ID") ||
    DEFAULT_BUSINESS_PLUGIN_ID;
  const platformPluginId =
    getConfigString(config, PLATFORM_PLUGIN_ID, "SOCIAL_PLATFORM_PROFILE_ID") ||
    DEFAULT_PLATFORM_PLUGIN_ID;
  const configuredProvider = getConfigString(
    config,
    SOCIAL_MODEL_PROVIDER,
    "SOCIAL_MODEL_PROVIDER",
  );
  const modelName =
    getConfigString(config, SOCIAL_MODEL_NAME, "SOCIAL_MODEL_NAME") ||
    process.env.OLLAMA_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    process.env.OPENAI_MODEL;

  return {
    businessPluginId,
    platformPluginId,
    modelProvider: inferProvider(configuredProvider, modelName),
    modelName,
    ollamaBaseUrl:
      getConfigString(
        config,
        SOCIAL_OLLAMA_BASE_URL,
        "SOCIAL_OLLAMA_BASE_URL",
      ) ||
      process.env.OLLAMA_HOST ||
      DEFAULT_OLLAMA_BASE_URL,
  };
}

export function loadBusinessPlugin(
  config?: LangGraphRunnableConfig,
): BusinessPlugin {
  const { businessPluginId } = resolveSocialRuntimeConfig(config);
  return loadBusinessPluginById(businessPluginId);
}

export function loadBusinessPluginById(
  businessPluginId: string,
): BusinessPlugin {
  return parsePluginFile(
    "businesses",
    businessPluginId,
    (value) => BusinessPluginSchema.parse(value),
    DEFAULT_BUSINESS_PLUGIN_ID,
  );
}

export function listBusinessPluginIds(): string[] {
  return getPluginIds("businesses");
}

export function loadPlatformProfile(
  config?: LangGraphRunnableConfig,
): PlatformProfile {
  const { platformPluginId } = resolveSocialRuntimeConfig(config);
  return parsePluginFile(
    "platforms",
    platformPluginId,
    (value) => PlatformProfileSchema.parse(value),
    DEFAULT_PLATFORM_PLUGIN_ID,
  );
}

export function getBusinessDisplayName(
  config?: LangGraphRunnableConfig,
): string {
  return loadBusinessPlugin(config).displayName;
}

export function getAnalyticsForPlatform(
  business: BusinessPlugin,
  platform: PlatformProfile,
): PlatformAnalytics | undefined {
  const lookupKeys = [platform.id, ...platform.aliases];

  for (const key of lookupKeys) {
    const analytics = business.analyticsByPlatform[key];
    if (analytics) {
      return analytics;
    }
  }

  return undefined;
}

export async function buildPluginPromptContext(
  config?: LangGraphRunnableConfig,
): Promise<string> {
  const business = loadBusinessPlugin(config);
  const platform = loadPlatformProfile(config);
  const analytics = getAnalyticsForPlatform(business, platform);
  const trendResearch = await fetchTrendResearchExcerpts(
    platform.trendResearchUrls,
  );

  const limitText =
    platform.hardCharacterLimit != null
      ? String(platform.hardCharacterLimit)
      : "No hard limit provided";

  const analyticsSection = analytics
    ? `<performance-signals>
Top-performing patterns:
${formatList(analytics.topPerformingPatterns)}

Weak signals:
${formatList(analytics.weakSignals)}

Correlations between trends and your analytics:
${formatList(analytics.correlations)}
${analytics.notes ? `\nNotes:\n${analytics.notes}` : ""}
</performance-signals>`
    : `<performance-signals>
- No platform analytics plugin data provided for this run.
</performance-signals>`;

  const trendResearchSection = trendResearch.length
    ? `<live-trend-research>
${trendResearch.join("\n\n")}
</live-trend-research>`
    : "";

  return `Use the following plugin context for this run.

<business-profile>
Business: ${business.displayName}
Summary: ${business.summary}

Audience:
${formatList(business.audience)}

Voice:
${formatList(business.voice)}

Goals:
${formatList(business.goals)}

Key themes:
${formatList(business.keyThemes)}

CTA guidance:
${business.ctaStyle || "Use a direct CTA aligned to the business goal."}
</business-profile>

<platform-profile>
Platform profile: ${platform.displayName}
Hard character limit: ${limitText}
Preferred length: ${platform.preferredLength}
Tone guidance: ${platform.tone}

Structure tips:
${formatList(platform.structureTips)}

Current trend signals:
${formatList(platform.trendSignals)}

Avoid:
${formatList(platform.avoid)}
</platform-profile>

${analyticsSection}
${trendResearchSection}`;
}
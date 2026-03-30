import { z } from "zod";

export const PlatformAnalyticsSchema = z.object({
  topPerformingPatterns: z.array(z.string()).default([]),
  weakSignals: z.array(z.string()).default([]),
  correlations: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const BusinessStoryDiscoverySchema = z.object({
  keywords: z.array(z.string()).default([]),
  excludedKeywords: z.array(z.string()).default([]),
  excludedDomains: z.array(z.string()).default([]),
  rssFeeds: z.array(z.string().url()).default([]),
  preferredDomains: z.array(z.string()).default([]),
  maxStories: z.number().int().positive().default(8),
  lookbackHours: z.number().int().positive().optional(),
});

const DEFAULT_BUSINESS_STORY_DISCOVERY: z.infer<
  typeof BusinessStoryDiscoverySchema
> = {
  keywords: [],
  excludedKeywords: [],
  excludedDomains: [],
  rssFeeds: [],
  preferredDomains: [],
  maxStories: 8,
  lookbackHours: undefined,
};

export const BusinessPluginSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  summary: z.string(),
  audience: z.array(z.string()).default([]),
  voice: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  keyThemes: z.array(z.string()).default([]),
  ctaStyle: z.string().optional(),
  analyticsByPlatform: z
    .record(z.string(), PlatformAnalyticsSchema)
    .default({}),
  storyDiscovery: BusinessStoryDiscoverySchema.default(
    DEFAULT_BUSINESS_STORY_DISCOVERY,
  ),
});

export const PlatformProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  aliases: z.array(z.string()).default([]),
  hardCharacterLimit: z.number().int().positive().optional(),
  preferredLength: z.string(),
  tone: z.string(),
  structureTips: z.array(z.string()).default([]),
  trendSignals: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  trendResearchUrls: z.array(z.string().url()).default([]),
});

export type PlatformAnalytics = z.infer<typeof PlatformAnalyticsSchema>;
export type BusinessStoryDiscovery = z.infer<
  typeof BusinessStoryDiscoverySchema
>;
export type BusinessPlugin = z.infer<typeof BusinessPluginSchema>;
export type PlatformProfile = z.infer<typeof PlatformProfileSchema>;

export type SocialModelProvider = "anthropic" | "openai" | "ollama";
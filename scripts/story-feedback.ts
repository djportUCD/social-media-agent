import "dotenv/config";
import {
  getCachedStories,
  refreshBusinessStories,
} from "../src/agents/curate-data/loaders/business-stories.js";
import { recordStoryFeedback } from "../src/agents/curate-data/loaders/story-feedback.js";

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function getRequiredArgValue(flag: string): string {
  const value = getArgValue(flag);
  if (!value) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return value;
}

async function main(): Promise<void> {
  const businessId =
    getArgValue("--business") ||
    process.env.SOCIAL_BUSINESS_ID ||
    (() => {
      throw new Error("Provide --business or set SOCIAL_BUSINESS_ID.");
    })();
  const decision = getRequiredArgValue("--decision");
  if (decision !== "accept" && decision !== "reject") {
    throw new Error("--decision must be either accept or reject.");
  }

  const cache = getCachedStories(businessId);
  const explicitUrl = getArgValue("--url");
  const explicitIndex = getArgValue("--index");
  const genericReason = getArgValue("--reason");
  const reason =
    decision === "accept"
      ? getArgValue("--accept-reason") || genericReason
      : getArgValue("--reject-reason") || genericReason;

  let story = cache?.stories.find((item) => item.link === explicitUrl);
  if (!story && explicitIndex && cache?.stories?.length) {
    const index = Number(explicitIndex) - 1;
    if (Number.isInteger(index) && index >= 0 && index < cache.stories.length) {
      story = cache.stories[index];
    }
  }

  if (!story) {
    throw new Error(
      "Could not resolve a story. Use --index with a cached list entry or --url with a cached story URL.",
    );
  }

  const entry = recordStoryFeedback({
    businessId,
    url: story.link,
    title: story.title,
    decision,
    reason,
    sourceFeed: story.sourceFeed,
    matchedKeywords: story.matchedKeywords,
  });

  const refreshed = await refreshBusinessStories({ businessId });

  console.log(
    `Saved ${entry.decision} feedback for ${businessId}: ${entry.title}`,
  );
  if (entry.reason) {
    console.log(`Reason: ${entry.reason}`);
  }
  console.log(
    `Refreshed cache with ${refreshed.stories.length} story/stories after learning update.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
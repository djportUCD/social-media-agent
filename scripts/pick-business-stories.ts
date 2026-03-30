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

function parseIndexList(value: string | undefined): number[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part) && part > 0);
}

async function main(): Promise<void> {
  const businessId =
    getArgValue("--business") ||
    process.env.SOCIAL_BUSINESS_ID ||
    (() => {
      throw new Error("Provide --business or set SOCIAL_BUSINESS_ID.");
    })();
  const acceptIndices = parseIndexList(getArgValue("--accept"));
  const rejectIndices = parseIndexList(getArgValue("--reject"));
  const acceptReason = getArgValue("--accept-reason");
  const rejectReason = getArgValue("--reject-reason") || getArgValue("--reason");

  if (!acceptIndices.length && !rejectIndices.length) {
    throw new Error("Provide --accept and/or --reject with a comma-separated list of story indexes.");
  }

  if (rejectIndices.length && !rejectReason) {
    throw new Error("Provide --reject-reason when using --reject for batch triage.");
  }

  const cache = getCachedStories(businessId);
  if (!cache?.stories.length) {
    throw new Error("No cached stories found. Run yarn stories:refresh first.");
  }

  const acceptIndexSet = new Set(acceptIndices);
  const rejectIndexSet = new Set(rejectIndices);
  const overlapping = acceptIndices.filter((index) => rejectIndexSet.has(index));
  if (overlapping.length) {
    throw new Error(`The same story index cannot be both accepted and rejected: ${overlapping.join(", ")}`);
  }

  const applyDecision = (index: number, decision: "accept" | "reject", reason?: string) => {
    const story = cache.stories[index - 1];
    if (!story) {
      throw new Error(`Story index ${index} is out of range for ${businessId}.`);
    }

    recordStoryFeedback({
      businessId,
      url: story.link,
      title: story.title,
      decision,
      reason,
      sourceFeed: story.sourceFeed,
      matchedKeywords: story.matchedKeywords,
    });

    console.log(`${decision === "accept" ? "Accepted" : "Rejected"} [${index}] ${story.title}`);
    if (reason) {
      console.log(`Reason: ${reason}`);
    }
  };

  [...acceptIndexSet].sort((left, right) => left - right).forEach((index) => {
    applyDecision(index, "accept", acceptReason);
  });
  [...rejectIndexSet].sort((left, right) => left - right).forEach((index) => {
    applyDecision(index, "reject", rejectReason);
  });

  const refreshed = await refreshBusinessStories({ businessId });
  console.log(
    `Refreshed ${businessId}. ${refreshed.stories.length} story/stories remain after batch feedback.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
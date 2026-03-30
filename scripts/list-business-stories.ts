import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getAllConfiguredBusinessIds } from "../src/agents/curate-data/loaders/business-stories.js";
import { getCachedStories } from "../src/agents/curate-data/loaders/business-stories.js";
import { refreshBusinessStories } from "../src/agents/curate-data/loaders/business-stories.js";
import { getStoryFeedbackForUrl } from "../src/agents/curate-data/loaders/story-feedback.js";
import { recordStoryFeedback } from "../src/agents/curate-data/loaders/story-feedback.js";

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function getBusinessIds(): string[] {
  const explicitBusiness = getArgValue("--business") || process.env.SOCIAL_BUSINESS_ID;
  if (explicitBusiness) {
    return [explicitBusiness];
  }

  return getAllConfiguredBusinessIds();
}

function getLimit(): number {
  const explicitLimit = getArgValue("--limit");
  if (!explicitLimit) {
    return 10;
  }

  const parsed = Number(explicitLimit);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function isInteractive(): boolean {
  return process.argv.includes("--interactive");
}

function printStory(
  businessId: string,
  story: NonNullable<ReturnType<typeof getCachedStories>>["stories"][number],
  index: number,
): void {
  const feedback = getStoryFeedbackForUrl(businessId, story.link);
  console.log(`\n[${index + 1}] ${story.title}`);
  console.log(`URL: ${story.link}`);
  console.log(`Score: ${story.score.toFixed(2)}`);
  console.log(`Keywords: ${story.matchedKeywords.join(", ") || "none"}`);
  if (feedback) {
    console.log(`Feedback: ${feedback.decision}`);
    if (feedback.reason) {
      console.log(`Why: ${feedback.reason}`);
    }
  }
}

async function reviewBusinessStories(
  businessId: string,
  stories: NonNullable<ReturnType<typeof getCachedStories>>["stories"],
): Promise<void> {
  const rl = createInterface({ input, output });
  let updated = false;

  try {
    for (const [index, story] of stories.entries()) {
      printStory(businessId, story, index);
      const action = (
        await rl.question("Action: [a]ccept, [r]eject, [s]kip, [q]uit: ")
      )
        .trim()
        .toLowerCase();

      if (action === "q") {
        break;
      }

      if (!action || action === "s") {
        continue;
      }

      if (action !== "a" && action !== "r") {
        console.log("Skipped. Use a, r, s, or q.");
        continue;
      }

      let reason: string | undefined;
      if (action === "a") {
        reason = (
          await rl.question("Why is this a good fit? (optional) ")
        ).trim();
      }

      if (action === "r") {
        reason = (await rl.question("Why is this not relevant? ")).trim();
      }

      recordStoryFeedback({
        businessId,
        url: story.link,
        title: story.title,
        decision: action === "a" ? "accept" : "reject",
        reason,
        sourceFeed: story.sourceFeed,
        matchedKeywords: story.matchedKeywords,
      });
      updated = true;
      console.log(`Saved ${action === "a" ? "accept" : "reject"} feedback.`);
    }
  } finally {
    rl.close();
  }

  if (updated) {
    const refreshed = await refreshBusinessStories({ businessId });
    console.log(
      `Refreshed ${businessId}. ${refreshed.stories.length} story/stories remain in priority order.`,
    );
  }
}

async function main(): Promise<void> {
  const businessIds = getBusinessIds();
  const limit = getLimit();
  const interactive = isInteractive();

  for (const businessId of businessIds) {
    const cache = getCachedStories(businessId);
    console.log(`\n=== ${businessId} ===`);

    if (!cache || !cache.stories.length) {
      console.log("No cached stories. Run yarn stories:refresh first.");
      continue;
    }

    console.log(`Generated at: ${cache.generatedAt}`);
    const visibleStories = cache.stories.slice(0, limit);
    if (interactive) {
      console.log(`Interactive review for ${visibleStories.length} story/stories.`);
      await reviewBusinessStories(businessId, visibleStories);
      continue;
    }

    visibleStories.forEach((story, index) => {
      printStory(businessId, story, index);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
import "dotenv/config";
import {
  getAllConfiguredBusinessIds,
  refreshBusinessStories,
} from "../src/agents/curate-data/loaders/business-stories.js";

function getRequestedBusinessIds(): string[] {
  const configuredIds = process.env.SOCIAL_BUSINESS_IDS;
  if (!configuredIds) {
    return getAllConfiguredBusinessIds();
  }

  return configuredIds
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function main(): Promise<void> {
  const businessIds = getRequestedBusinessIds();
  if (!businessIds.length) {
    throw new Error("No business plugins found to refresh.");
  }

  for (const businessId of businessIds) {
    const result = await refreshBusinessStories({ businessId });
    console.log(
      `${businessId}: cached ${result.links.length} business story link(s) at ${result.generatedAt}`,
    );
    result.stories.slice(0, 5).forEach((story, index) => {
      console.log(`  ${index + 1}. ${story.title}`);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
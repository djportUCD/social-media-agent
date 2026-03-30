import "dotenv/config";
import { Client } from "@langchain/langgraph-sdk";
import {
  BUSINESS_PLUGIN_ID,
  PLATFORM_PLUGIN_ID,
  SOCIAL_MODEL_NAME,
  SOCIAL_MODEL_PROVIDER,
  TEXT_ONLY_MODE,
} from "../src/agents/generate-post/constants.js";

async function main(): Promise<void> {
  const client = new Client({
    apiUrl: process.env.LANGGRAPH_API_URL || "http://localhost:54367",
  });
  const graphId = process.env.BUSINESS_STORY_GRAPH_ID || "supervisor";
  const { thread_id } = await client.threads.create();
  const run = await client.runs.create(thread_id, graphId, {
    input: {},
    config: {
      configurable: {
        sources: ["business_stories"],
        [BUSINESS_PLUGIN_ID]: process.env.SOCIAL_BUSINESS_ID,
        [PLATFORM_PLUGIN_ID]: process.env.SOCIAL_PLATFORM_PROFILE_ID,
        [SOCIAL_MODEL_PROVIDER]: process.env.SOCIAL_MODEL_PROVIDER,
        [SOCIAL_MODEL_NAME]: process.env.SOCIAL_MODEL_NAME,
        [TEXT_ONLY_MODE]: process.env.TEXT_ONLY_MODE === "true",
      },
    },
  });

  console.log(
    `Started ${graphId} run for business stories. thread_id=${thread_id} run_id=${run.run_id}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
import "dotenv/config";
import { Client } from "@langchain/langgraph-sdk";
import {
  BUSINESS_PLUGIN_ID,
  PLATFORM_PLUGIN_ID,
  SKIP_CONTENT_RELEVANCY_CHECK,
  SKIP_USED_URLS_CHECK,
  SOCIAL_MODEL_NAME,
  SOCIAL_MODEL_PROVIDER,
  TEXT_ONLY_MODE,
} from "../src/agents/generate-post/constants.js";

/**
 * Generate a post based on a LangChain blog post.
 * This may be modified to generate posts for other content.
 */
async function invokeGraph() {
  const link = "https://github.com/rguthaa/genai-usecases/tree/main";
  const modelProvider = process.env.SOCIAL_MODEL_PROVIDER;

  const client = new Client({
    apiUrl: process.env.LANGGRAPH_API_URL || "http://localhost:54367",
  });

  const { thread_id } = await client.threads.create();
  await client.runs.create(thread_id, "generate_post", {
    input: {
      links: [link],
    },
    config: {
      configurable: {
        // By default, the graph will read these values from the environment
        // [TWITTER_USER_ID]: process.env.TWITTER_USER_ID,
        // [LINKEDIN_USER_ID]: process.env.LINKEDIN_USER_ID,
        // This ensures the graph runs in a basic text only mode.
        // If you followed the full setup instructions, you may remove this line.
        [TEXT_ONLY_MODE]:
          process.env.TEXT_ONLY_MODE === "true" || modelProvider === "ollama",
        // These will skip content relevancy checks and used URLs checks
        [SKIP_CONTENT_RELEVANCY_CHECK]: true,
        [SKIP_USED_URLS_CHECK]: true,
        [BUSINESS_PLUGIN_ID]: process.env.SOCIAL_BUSINESS_ID,
        [PLATFORM_PLUGIN_ID]: process.env.SOCIAL_PLATFORM_PROFILE_ID,
        [SOCIAL_MODEL_PROVIDER]: modelProvider,
        [SOCIAL_MODEL_NAME]: process.env.SOCIAL_MODEL_NAME,
      },
    },
  });
}

invokeGraph().catch(console.error);

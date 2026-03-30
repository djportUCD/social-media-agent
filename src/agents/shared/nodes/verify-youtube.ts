import { z } from "zod";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { GeneratePostAnnotation } from "../../generate-post/generate-post-state.js";
import { getPrompts } from "../../generate-post/prompts/index.js";
import { VerifyContentAnnotation } from "../shared-state.js";
import { getVideoSummary } from "../youtube/video-summary.js";
import { skipContentRelevancyCheck } from "../../utils.js";
import { verifyContentIsRelevant } from "./verify-content.js";

type VerifyYouTubeContentReturn = {
  relevantLinks: (typeof GeneratePostAnnotation.State)["relevantLinks"];
  pageContents: (typeof GeneratePostAnnotation.State)["pageContents"];
};

const VERIFY_RELEVANT_CONTENT_PROMPT = `You are a highly regarded marketing employee.
You're given a summary/report on some content a third party submitted to you in hopes of having it promoted by you.
You need to verify if the content is relevant to the following context before approving or denying the request.

${getPrompts().contentValidationPrompt}

Given this context, examine the summary/report closely, and determine if the content is relevant to your company's products.
You should provide reasoning as to why or why not the content is relevant to your company's products, then a simple true or false for whether or not it's relevant.
`;

const RELEVANCY_SCHEMA = z
  .object({
    reasoning: z
      .string()
      .describe(
        "Reasoning for why the content is or isn't relevant to your company's products.",
      ),
    relevant: z
      .boolean()
      .describe(
        "Whether or not the content is relevant to your company's products.",
      ),
  })
  .describe("The relevancy of the content to your company's products.");

/**
 * Verifies the content provided is relevant to your company's products.
 */
export async function verifyYouTubeContent(
  state: typeof VerifyContentAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<VerifyYouTubeContentReturn> {
  const { summary, thumbnail } = await getVideoSummary(state.link);

  const returnValue = {
    relevantLinks: [state.link],
    pageContents: [summary as string],
    ...(thumbnail ? { imageOptions: [thumbnail] } : {}),
  };

  if (await skipContentRelevancyCheck(config.configurable)) {
    return returnValue;
  }

  if (
    await verifyContentIsRelevant(summary, {
      systemPrompt: VERIFY_RELEVANT_CONTENT_PROMPT,
      schema: RELEVANCY_SCHEMA,
      config,
    })
  ) {
    return returnValue;
  }

  // Not relevant, return empty arrays so this URL is not included.
  return {
    relevantLinks: [],
    pageContents: [],
  };
}

import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { FireCrawlLoader } from "@langchain/community/document_loaders/web/firecrawl";
import { getPrompts } from "../../generate-post/prompts/index.js";
import { VerifyContentAnnotation } from "../shared-state.js";
import { getPageText, skipContentRelevancyCheck } from "../../utils.js";
import { getImagesFromFireCrawlMetadata } from "../../../utils/firecrawl.js";
import { CurateDataState } from "../../curate-data/state.js";
import { shouldExcludeGeneralContent } from "../../should-exclude.js";
import { traceable } from "langsmith/traceable";
import { verifyContentIsRelevant } from "./verify-content.js";

const RELEVANCY_SCHEMA = z
  .object({
    reasoning: z
      .string()
      .describe(
        "Reasoning for why the event is or isn't relevant to your company.",
      ),
    relevant: z
      .boolean()
      .describe("Whether or not the event is relevant to your company."),
  })
  .describe("The relevancy of the event to your company.");

const VERIFY_LUMA_RELEVANT_CONTENT_PROMPT = `You are a highly regarded marketing employee.
You're provided with the contents of an event promotion page.
Your task is to carefully read over the entire event details, and determine whether or not the event is actually relevant to your company.

${getPrompts().contentValidationPrompt}

Given this context, examine the event details closely, and determine if the event is relevant to your company.
Keep in mind, event descriptions are often sparse with details, so if you're not sure, err on the side of relevance.
You should provide reasoning as to why or why not the event is relevant to your company, then a simple true or false for whether or not it is relevant.`;

type UrlContents = {
  content: string;
  imageUrls?: string[];
};

async function getUrlContentsFunc(url: string): Promise<UrlContents> {
  try {
    const loader = new FireCrawlLoader({
      url,
      mode: "scrape",
      params: {
        formats: ["markdown", "screenshot"],
      },
    });
    const docs = await loader.load();

    const docsText = docs.map((d) => d.pageContent).join("\n");
    if (docsText.length) {
      return {
        content: docsText,
        imageUrls: docs.flatMap(
          (d) => getImagesFromFireCrawlMetadata(d.metadata) || [],
        ),
      };
    }
  } catch (e) {
    console.error(`Failed to fetch content from ${url}\nError:\n`, e);
  }

  const text = await getPageText(url);
  if (text) {
    return {
      content: text,
    };
  }
  throw new Error(`Failed to fetch content from ${url}.`);
}

export const getUrlContents = traceable(getUrlContentsFunc, {
  name: "get-url-contents",
});

/**
 * Verifies if the Luma event is relevant to your company's products.
 *
 * @param state - The current state containing the link to verify.
 * @param _config - Configuration for the LangGraph runtime (unused in this function).
 * @returns An object containing relevant links and page contents if the event is relevant;
 * otherwise, returns empty arrays.
 */
export async function verifyLumaEvent(
  state: typeof VerifyContentAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<Partial<CurateDataState>> {
  const shouldExclude = shouldExcludeGeneralContent(state.link);
  if (shouldExclude) {
    return {};
  }

  const urlContents = await getUrlContents(state.link);

  const returnValue = {
    relevantLinks: [state.link],
    pageContents: [urlContents.content],
    ...(urlContents.imageUrls?.length
      ? { imageOptions: urlContents.imageUrls }
      : {}),
  };

  if (await skipContentRelevancyCheck(config.configurable)) {
    return returnValue;
  }

  if (
    await verifyContentIsRelevant(urlContents.content, {
      systemPrompt: VERIFY_LUMA_RELEVANT_CONTENT_PROMPT,
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

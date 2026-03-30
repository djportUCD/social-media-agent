import { Annotation, END } from "@langchain/langgraph";
import { IngestDataAnnotation } from "../ingest-data/ingest-data-state.js";
import {
  BUSINESS_PLUGIN_ID,
  PLATFORM_PLUGIN_ID,
  POST_TO_LINKEDIN_ORGANIZATION,
  SKIP_CONTENT_RELEVANCY_CHECK,
  SKIP_USED_URLS_CHECK,
  SOCIAL_MODEL_NAME,
  SOCIAL_MODEL_PROVIDER,
  SOCIAL_OLLAMA_BASE_URL,
  TEXT_ONLY_MODE,
} from "./constants.js";
import { DateType } from "../types.js";
import { VerifyLinksResultAnnotation } from "../verify-links/verify-links-state.js";
import { ComplexPost } from "../shared/nodes/generate-post/types.js";

export type LangChainProduct = "langchain" | "langgraph" | "langsmith";

export type YouTubeVideoSummary = {
  /**
   * The link to the YouTube video the summary is for.
   */
  link: string;
  /**
   * The summary of the video.
   */
  summary: string;
};

export const GeneratePostAnnotation = Annotation.Root({
  /**
   * The links to use to generate a post.
   */
  links: Annotation<string[]>({
    reducer: (_state, update) => update,
    default: () => [],
  }),
  /**
   * The report generated on the content of the message. Used
   * as context for generating the post.
   */
  report: IngestDataAnnotation.spec.report,
  ...VerifyLinksResultAnnotation.spec,
  /**
   * The generated post for LinkedIn/Twitter.
   */
  post: Annotation<string>({
    reducer: (_state, update) => update,
    default: () => "",
  }),
  /**
   * The complex post, if the user decides to split the URL from the main body.
   *
   * TODO: Refactor the post/complexPost state interfaces to use a single shared interface
   * which includes images too.
   * Tracking issue: https://github.com/langchain-ai/social-media-agent/issues/144
   */
  complexPost: Annotation<ComplexPost | undefined>({
    reducer: (_state, update) => update,
    default: () => undefined,
  }),
  /**
   * The date to schedule the post for.
   */
  scheduleDate: Annotation<DateType>({
    reducer: (_state, update) => update,
  }),
  /**
   * Response from the user for the post. Typically used to request
   * changes to be made to the post.
   */
  userResponse: Annotation<string | undefined>({
    reducer: (_state, update) => update,
    default: () => undefined,
  }),
  /**
   * The node to execute next.
   */
  next: Annotation<
    | "schedulePost"
    | "rewritePost"
    | "updateScheduleDate"
    | "unknownResponse"
    | "rewriteWithSplitUrl"
    | typeof END
    | undefined
  >({
    reducer: (_state, update) => update,
    default: () => undefined,
  }),
  /**
   * The image to attach to the post, and the MIME type.
   */
  image: Annotation<
    | {
        imageUrl: string;
        mimeType: string;
      }
    | undefined
  >({
    reducer: (_state, update) => update,
    default: () => undefined,
  }),
  /**
   * The number of times the post has been condensed. We should stop condensing after
   * 3 times to prevent an infinite loop.
   */
  condenseCount: Annotation<number>({
    reducer: (_state, update) => update,
    default: () => 0,
  }),
});

export type GeneratePostState = typeof GeneratePostAnnotation.State;
export type GeneratePostUpdate = typeof GeneratePostAnnotation.Update;

export const GeneratePostConfigurableAnnotation = Annotation.Root({
  /**
   * Whether to post to the LinkedIn organization or the user's profile.
   * If true, [LINKEDIN_ORGANIZATION_ID] is required.
   */
  [POST_TO_LINKEDIN_ORGANIZATION]: Annotation<boolean | undefined>,
  /**
   * Whether or not to use text only mode throughout the graph.
   * If true, it will not try to extract, validate, or upload images.
   * Additionally, it will not be able to handle validating YouTube videos.
   * @default false
   */
  [TEXT_ONLY_MODE]: Annotation<boolean | undefined>({
    reducer: (_state, update) => update,
    default: () => false,
  }),
  /**
   * Business plugin profile to use for prompts and analytics guidance.
   */
  [BUSINESS_PLUGIN_ID]: Annotation<string | undefined>(),
  /**
   * Platform strategy plugin to use for prompts and analytics guidance.
   */
  [PLATFORM_PLUGIN_ID]: Annotation<string | undefined>(),
  /**
   * Text model provider used by the main post generation path.
   */
  [SOCIAL_MODEL_PROVIDER]: Annotation<string | undefined>(),
  /**
   * Override model name for the selected provider.
   */
  [SOCIAL_MODEL_NAME]: Annotation<string | undefined>(),
  /**
   * Override base URL for local Ollama usage.
   */
  [SOCIAL_OLLAMA_BASE_URL]: Annotation<string | undefined>(),
  /**
   * The original graph that started the "generate-post" graph
   * run. Undefined if the graph was started directly.
   */
  origin: Annotation<string | undefined>,
  /**
   * Whether or not to skip the content relevancy check.
   */
  [SKIP_CONTENT_RELEVANCY_CHECK]: Annotation<boolean | undefined>(),
  /**
   * Whether or not to skip the used URLs check. This will also
   * skip saving the URLs in the store.
   */
  [SKIP_USED_URLS_CHECK]: Annotation<boolean | undefined>(),
});

export const BASE_GENERATE_POST_CONFIG: typeof GeneratePostConfigurableAnnotation.State =
  {
    [POST_TO_LINKEDIN_ORGANIZATION]: undefined,
    [TEXT_ONLY_MODE]: false,
    [BUSINESS_PLUGIN_ID]: undefined,
    [PLATFORM_PLUGIN_ID]: undefined,
    [SOCIAL_MODEL_PROVIDER]: undefined,
    [SOCIAL_MODEL_NAME]: undefined,
    [SOCIAL_OLLAMA_BASE_URL]: undefined,
    origin: undefined,
    [SKIP_CONTENT_RELEVANCY_CHECK]: undefined,
    [SKIP_USED_URLS_CHECK]: undefined,
  };

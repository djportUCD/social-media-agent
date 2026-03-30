import { Annotation } from "@langchain/langgraph";
import { Source } from "./types.js";
import { CuratedData } from "../curate-data/types.js";
import {
  BUSINESS_PLUGIN_ID,
  BUSINESS_STORY_CACHE_ONLY,
  BUSINESS_STORY_LIMIT,
  BUSINESS_STORY_LOOKBACK_HOURS,
  PLATFORM_PLUGIN_ID,
  SOCIAL_MODEL_NAME,
  SOCIAL_MODEL_PROVIDER,
  SOCIAL_OLLAMA_BASE_URL,
} from "../generate-post/constants.js";

export const SupervisorAnnotation = Annotation.Root({
  /**
   * The final data object from ingesting all sources.
   */
  curatedData: Annotation<CuratedData>,
  /**
   * A list of reports, each containing a report & key details on a given data source/data group.
   * The report is used for generating a post, and key details are used for identifying reports on the same topic.
   */
  reports: Annotation<
    Array<{
      report: string;
      keyDetails: string;
      sourceContext?: string;
    }>
  >({
    reducer: (state, update) => state.concat(update),
    default: () => [],
  }),
  /**
   * The list of reports after they have been grouped.
   */
  groupedReports: Annotation<
    Array<{
      reports: string[];
      keyDetails: string[];
      sourceContext: Array<string | undefined>;
    }>
  >,
  /**
   * The report and type of post to generate.
   */
  reportAndPostType: Annotation<
    Array<{
      reports: string[];
      keyDetails: string[];
      sourceContext: Array<string | undefined>;
      reason: string;
      type: "thread" | "post";
    }>
  >,
  /**
   * Thread and run IDs, along with the type of post to generate.
   */
  idsAndTypes: Annotation<
    Array<{
      type: "thread" | "post";
      thread_id: string;
      run_id: string;
      sourceContext?: string;
    }>
  >({
    reducer: (state, update) => state.concat(update),
    default: () => [],
  }),
});

export const SupervisorConfigurableAnnotation = Annotation.Root({
  /**
   * The sources to ingest from.
   */
  sources: Annotation<Source[]>({
    reducer: (_state, update) => update,
    default: () => ["business_stories"],
  }),
  [BUSINESS_PLUGIN_ID]: Annotation<string | undefined>(),
  [PLATFORM_PLUGIN_ID]: Annotation<string | undefined>(),
  [SOCIAL_MODEL_PROVIDER]: Annotation<string | undefined>(),
  [SOCIAL_MODEL_NAME]: Annotation<string | undefined>(),
  [SOCIAL_OLLAMA_BASE_URL]: Annotation<string | undefined>(),
  [BUSINESS_STORY_LIMIT]: Annotation<number | undefined>(),
  [BUSINESS_STORY_LOOKBACK_HOURS]: Annotation<number | undefined>(),
  [BUSINESS_STORY_CACHE_ONLY]: Annotation<boolean | undefined>(),
});

export type SupervisorState = typeof SupervisorAnnotation.State;

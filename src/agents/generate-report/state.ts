import { Annotation } from "@langchain/langgraph";
import { TweetsGroupedByContent } from "../curate-data/types.js";
import { VerifyLinksResultAnnotation } from "../verify-links/verify-links-state.js";

export const GenerateReportAnnotation = Annotation.Root({
  ...VerifyLinksResultAnnotation.spec,
  tweetGroup: Annotation<TweetsGroupedByContent>,
  keyReportDetails: Annotation<string>,
  sourceContext: Annotation<string | undefined>(),
  /**
   * Must be an array even though it will only contain a single report.
   * This is due to its usage in a subgraph, and the shared key is `reports`.
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
});

export type GenerateReportState = typeof GenerateReportAnnotation.State;

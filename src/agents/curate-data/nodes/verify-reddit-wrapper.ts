import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { CurateDataState } from "../state.js";
import { verifyRedditPostGraph } from "../../verify-reddit-post/verify-reddit-post-graph.js";
import { RedditPostsWithExternalData } from "../../verify-reddit-post/types.js";

export async function verifyRedditWrapper(
  state: CurateDataState,
  config: LangGraphRunnableConfig,
): Promise<Partial<CurateDataState>> {
  const verifiedRedditPosts: RedditPostsWithExternalData[] = [];

  for (const post of state.rawRedditPosts) {
    try {
      const result = await verifyRedditPostGraph.invoke(
        {
          redditPost: post,
        },
        config as any,
      );

      if (
        result.relevantLinks &&
        result.relevantLinks.length > 0 &&
        result.pageContents &&
        result.pageContents.length > 0
      ) {
        verifiedRedditPosts.push({
          ...post,
          externalData: result.pageContents.map((pageContent, idx) => ({
            pageContent,
            url: result.relevantLinks?.[idx] || "",
          })),
        });
      }
    } catch (e) {
      console.error("Failed to verify Reddit post", e);
    }
  }

  return {
    redditPosts: verifiedRedditPosts,
  };
}

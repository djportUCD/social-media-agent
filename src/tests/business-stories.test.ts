import {
  prioritizeAcceptedStoriesInCache,
  selectBusinessStoryCandidates,
} from "../agents/curate-data/loaders/business-stories.js";
import {
  buildAcceptedStorySourceContext,
  buildStoryFeedbackProfile,
} from "../agents/curate-data/loaders/story-feedback.js";

test("selectBusinessStoryCandidates filters and ranks matching stories", () => {
  const stories = selectBusinessStoryCandidates(
    [
      {
        title: "UC Davis expands mouse model phenotyping support",
        link: "https://www.ucdavis.edu/example-story",
        description: "A new translational research effort around mouse models.",
        publishedAt: "2026-03-29T12:00:00.000Z",
        matchedKeywords: [],
        sourceFeed: "feed-1",
        score: 0,
      },
      {
        title: "New gaming mouse launches for esports players",
        link: "https://example.com/gaming-mouse",
        description: "A hardware launch unrelated to biomedical research.",
        publishedAt: "2026-03-29T12:00:00.000Z",
        matchedKeywords: [],
        sourceFeed: "feed-1",
        score: 0,
      },
    ],
    {
      keywords: ["mouse model", "phenotyping"],
      excludedKeywords: ["gaming mouse"],
      excludedDomains: [],
      rssFeeds: [],
      preferredDomains: ["ucdavis.edu"],
      maxStories: 5,
    },
    {
      now: new Date("2026-03-30T12:00:00.000Z"),
      lookbackHours: 72,
      storyLimit: 5,
    },
  );

  expect(stories).toHaveLength(1);
  expect(stories[0].link).toBe("https://www.ucdavis.edu/example-story");
  expect(stories[0].matchedKeywords).toEqual(["mouse model", "phenotyping"]);
});

test("selectBusinessStoryCandidates excludes self-authored domains", () => {
  const stories = selectBusinessStoryCandidates(
    [
      {
        title: "Mouse model repository expands resources",
        link: "https://external-journal.org/story",
        description: "A genetics update on mutant mouse resources.",
        publishedAt: "2026-03-29T12:00:00.000Z",
        matchedKeywords: [],
        sourceFeed: "feed-1",
        score: 0,
      },
      {
        title: "Our latest center update",
        link: "https://namtesting.org/news/update",
        description: "An internal update from the center.",
        publishedAt: "2026-03-29T12:00:00.000Z",
        matchedKeywords: [],
        sourceFeed: "feed-1",
        score: 0,
      },
    ],
    {
      keywords: ["mouse", "resource"],
      excludedKeywords: [],
      excludedDomains: ["namtesting.org"],
      rssFeeds: [],
      preferredDomains: [],
      maxStories: 5,
    },
    {
      now: new Date("2026-03-30T12:00:00.000Z"),
      lookbackHours: 72,
      storyLimit: 5,
    },
  );

  expect(stories).toHaveLength(1);
  expect(stories[0].link).toBe("https://external-journal.org/story");
});

test("selectBusinessStoryCandidates learns from accepted and rejected feedback", () => {
  const feedbackProfile = buildStoryFeedbackProfile({
    businessId: "mmrrc",
    entries: [
      {
        businessId: "mmrrc",
        url: "https://example.org/accepted",
        title: "Accepted genetics story",
        decision: "accept",
        reason: "strong external genetics relevance",
        recordedAt: "2026-03-29T12:00:00.000Z",
        matchedKeywords: ["genetics"],
        domain: "preferred-journal.org",
      },
      {
        businessId: "mmrrc",
        url: "https://example.org/rejected",
        title: "Rejected internal update",
        decision: "reject",
        reason: "not relevant internal operations update",
        recordedAt: "2026-03-29T13:00:00.000Z",
        matchedKeywords: ["genetics"],
        domain: "internal.org",
      },
    ],
  });

  const stories = selectBusinessStoryCandidates(
    [
      {
        title: "Genetics discovery with strong external relevance",
        link: "https://preferred-journal.org/story",
        description: "A genetics report for model organism research.",
        publishedAt: "2026-03-30T12:00:00.000Z",
        matchedKeywords: [],
        sourceFeed: "feed-1",
        score: 0,
      },
      {
        title: "Internal operations update for repository staff",
        link: "https://external.org/internal-update",
        description: "An internal operations note with little research value.",
        publishedAt: "2026-03-30T12:00:00.000Z",
        matchedKeywords: [],
        sourceFeed: "feed-1",
        score: 0,
      },
    ],
    {
      keywords: ["genetics", "internal"],
      excludedKeywords: [],
      excludedDomains: [],
      rssFeeds: [],
      preferredDomains: [],
      maxStories: 5,
    },
    {
      now: new Date("2026-03-30T12:00:00.000Z"),
      lookbackHours: 72,
      storyLimit: 5,
      feedbackProfile,
    },
  );

  expect(stories).toHaveLength(2);
  expect(stories[0].link).toBe("https://preferred-journal.org/story");
  expect(stories[0].score).toBeGreaterThan(stories[1].score);
});

test("prioritizeAcceptedStoriesInCache pins recently accepted stories to the front", () => {
  const cache = prioritizeAcceptedStoriesInCache(
    {
      businessId: "default",
      generatedAt: "2026-03-30T12:00:00.000Z",
      links: [
        "https://second-story.org/post",
        "https://accepted-story.org/post",
      ],
      stories: [
        {
          title: "Second story",
          link: "https://second-story.org/post",
          description: "Another valid story.",
          publishedAt: "2026-03-30T11:00:00.000Z",
          matchedKeywords: ["biology"],
          sourceFeed: "feed-1",
          score: 9,
        },
        {
          title: "Accepted story",
          link: "https://accepted-story.org/post",
          description: "Chosen by the user.",
          publishedAt: "2026-03-30T10:00:00.000Z",
          matchedKeywords: ["biology"],
          sourceFeed: "feed-1",
          score: 8,
        },
      ],
    },
    {
      businessId: "default",
      entries: [
        {
          businessId: "default",
          url: "https://accepted-story.org/post",
          title: "Accepted story",
          decision: "accept",
          recordedAt: "2026-03-30T11:30:00.000Z",
          matchedKeywords: ["biology"],
          domain: "accepted-story.org",
        },
      ],
    },
    {
      now: new Date("2026-03-30T12:00:00.000Z"),
    },
  );

  expect(cache.links[0]).toBe("https://accepted-story.org/post");
  expect(cache.stories[0].link).toBe("https://accepted-story.org/post");
});

test("buildAcceptedStorySourceContext exposes accepted story provenance", () => {
  expect(
    buildAcceptedStorySourceContext(
      {
        businessId: "default",
        url: "https://accepted-story.org/post",
        title: "Accepted story",
        decision: "accept",
        reason: "excellent fit for our biology audience",
        recordedAt: "2026-03-30T11:30:00.000Z",
        matchedKeywords: ["biology"],
        domain: "accepted-story.org",
      },
      "UC Davis Mouse Biology Program",
    ),
  ).toContain("Accepted because: excellent fit for our biology audience");
});
# Plugin Layer

This folder is intended to hold your local customization layer so upstream updates are easier to merge.

## Structure

- `businesses/*.json`: one file per business.
- `platforms/*.json`: one file per platform strategy.

## Business plugins

Each business plugin can define:

- `displayName`
- `summary`
- `audience`
- `voice`
- `goals`
- `keyThemes`
- `ctaStyle`
- `analyticsByPlatform`
- `storyDiscovery`

Use `analyticsByPlatform` to encode what your own post history says is working on each platform. This is where you capture the correlation between your analytics and the platform trends you care about.

Use `storyDiscovery` to define how the startup story collector should find relevant articles for that business. Each business can set:

- `keywords`
- `excludedKeywords`
- `excludedDomains`
- `rssFeeds`
- `preferredDomains`
- `maxStories`
- `lookbackHours`

## Platform plugins

Each platform plugin can define:

- `displayName`
- `hardCharacterLimit`
- `preferredLength`
- `tone`
- `structureTips`
- `trendSignals`
- `avoid`
- `trendResearchUrls`

If `ENABLE_PLATFORM_TREND_FETCH=true`, the runtime will attempt to fetch and summarize the URLs listed in `trendResearchUrls` and append them to the prompt context.

## Recommended workflow

1. Create one business JSON file per business you operate.
2. Keep platform strategy files separate from business files.
3. Update analytics and trend fields over time instead of editing core graph code.
4. Select the active combination with `SOCIAL_BUSINESS_ID` and `SOCIAL_PLATFORM_PROFILE_ID`.
5. For local inference, set `SOCIAL_MODEL_PROVIDER=ollama` and point `SOCIAL_MODEL_NAME` at a model that supports tool calling and structured output.
6. Run `yarn stories:refresh` or just start with `yarn dev` to refresh each business story cache before the local LangGraph server starts.
7. Run `yarn stories:run` to push the `business_stories` source through the graph without hand-building a LangGraph run payload.

## Ollama example

```bash
ollama pull qwen2.5:14b

set SOCIAL_MODEL_PROVIDER=ollama
set SOCIAL_MODEL_NAME=qwen2.5:14b
set SOCIAL_OLLAMA_BASE_URL=http://127.0.0.1:11434
set TEXT_ONLY_MODE=true
```

`TEXT_ONLY_MODE=true` is still the safest mode when running fully local, because image generation and some multimodal parts of the upstream project still rely on external services.

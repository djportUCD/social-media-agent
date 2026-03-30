import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { ZodTypeAny } from "zod";
import { resolveSocialRuntimeConfig } from "./runtime.js";

export type SocialTextPurpose =
  | "generate-post"
  | "generate-report"
  | "condense-post"
  | "rewrite-post"
  | "verify-content"
  | "route-response"
  | "schedule-date"
  | "split-url";

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4.1-mini",
  ollama: "qwen2.5:14b",
} as const;

type CreateSocialTextModelArgs = {
  config?: LangGraphRunnableConfig;
  purpose: SocialTextPurpose;
  temperature: number;
};

export function createSocialTextModel({
  config,
  temperature,
}: CreateSocialTextModelArgs): BaseChatModel {
  const runtime = resolveSocialRuntimeConfig(config);

  if (runtime.modelProvider === "openai") {
    return new ChatOpenAI({
      model: runtime.modelName || DEFAULT_MODELS.openai,
      temperature,
    });
  }

  if (runtime.modelProvider === "ollama") {
    return new ChatOllama({
      model: runtime.modelName || DEFAULT_MODELS.ollama,
      temperature,
      baseUrl: runtime.ollamaBaseUrl,
    });
  }

  return new ChatAnthropic({
    model: runtime.modelName || DEFAULT_MODELS.anthropic,
    temperature,
  });
}

type CreateStructuredModelArgs<TSchema extends ZodTypeAny> = {
  config?: LangGraphRunnableConfig;
  purpose: SocialTextPurpose;
  temperature: number;
  schema: TSchema;
  name: string;
};

export function createSocialStructuredOutputModel<TSchema extends ZodTypeAny>({
  config,
  purpose,
  temperature,
  schema,
  name,
}: CreateStructuredModelArgs<TSchema>) {
  const runtime = resolveSocialRuntimeConfig(config);
  const model = createSocialTextModel({
    config,
    purpose,
    temperature,
  });

  if (runtime.modelProvider === "ollama") {
    return model.withStructuredOutput(schema, {
      name,
      method: "functionCalling",
    } as any);
  }

  return model.withStructuredOutput(schema, { name } as any);
}
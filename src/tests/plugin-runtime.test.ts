import {
  BUSINESS_PLUGIN_ID,
  PLATFORM_PLUGIN_ID,
  SOCIAL_MODEL_PROVIDER,
} from "../agents/generate-post/constants.js";
import {
  buildPluginPromptContext,
  loadBusinessPlugin,
  loadPlatformProfile,
  resolveSocialRuntimeConfig,
} from "../plugins/runtime.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("loads business and platform plugins from graph config", async () => {
  const config = {
    configurable: {
      [BUSINESS_PLUGIN_ID]: "mmrrc",
      [PLATFORM_PLUGIN_ID]: "x",
    },
  } as any;

  const business = loadBusinessPlugin(config);
  const platform = loadPlatformProfile(config);
  const promptContext = await buildPluginPromptContext(config);

  expect(business.displayName).toBe(
    "Mutant Mouse Resource and Research Centers (MMRRC)",
  );
  expect(platform.displayName).toBe("X");
  expect(promptContext).toContain(
    "Mutant Mouse Resource and Research Centers (MMRRC)",
  );
  expect(promptContext).toContain("Short, punchy framing tends to outperform long setup");
});

test("infers ollama provider and model name from environment", () => {
  process.env.OLLAMA_MODEL = "qwen2.5:14b";

  const runtime = resolveSocialRuntimeConfig();

  expect(runtime.modelProvider).toBe("ollama");
  expect(runtime.modelName).toBe("qwen2.5:14b");
});

test("honors explicit provider selection from graph config", () => {
  const config = {
    configurable: {
      [SOCIAL_MODEL_PROVIDER]: "anthropic",
    },
  } as any;

  const runtime = resolveSocialRuntimeConfig(config);

  expect(runtime.modelProvider).toBe("anthropic");
  expect(runtime.businessPluginId).toBe("default");
});
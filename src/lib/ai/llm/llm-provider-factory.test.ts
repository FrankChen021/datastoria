import { describe, expect, it } from "vitest";
import {
  LanguageModelProviderFactory,
  MODELS,
  resolveModelReasoningLevels,
  resolveModelSupportsReasoning,
} from "./llm-provider-factory";
import { PROVIDER_NEBIUS, PROVIDER_OPENAI_CODEX } from "./provider-ids";

function getModel(provider: string, modelId: string) {
  return MODELS.find((model) => model.provider === provider && model.modelId === modelId);
}

describe("MODELS supportsImageInput", () => {
  it("marks vision-capable models explicitly", () => {
    expect(getModel("OpenAI", "gpt-4o")?.supportsImageInput).toBe(true);
    expect(getModel("Google", "gemini-2.5-flash")?.supportsImageInput).toBe(true);
    expect(getModel("Anthropic", "claude-sonnet-4-5")?.supportsImageInput).toBe(true);
    expect(getModel("Nebius", "moonshotai/Kimi-K2.5")?.supportsImageInput).toBe(true);
  });

  it("marks text-only models explicitly", () => {
    expect(getModel("OpenRouter", "openai/gpt-oss-120b:free")?.supportsImageInput).toBe(false);
    expect(getModel("Groq", "openai/gpt-oss-20b")?.supportsImageInput).toBe(false);
    expect(getModel("Cerebras", "gpt-oss-120b")?.supportsImageInput).toBe(false);
  });
});

describe("MODELS OpenAI Codex catalog", () => {
  it("lists Codex models as static provider models", () => {
    const codexModels = MODELS.filter((model) => model.provider === PROVIDER_OPENAI_CODEX);

    expect(codexModels.map((model) => model.modelId)).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
      "gpt-5.2",
    ]);
    expect(getModel(PROVIDER_OPENAI_CODEX, "gpt-5.3-codex-spark")?.supportsImageInput).toBe(false);
    expect(getModel(PROVIDER_OPENAI_CODEX, "gpt-5.4-mini")?.supportedEndpoints).toEqual([
      "responses",
    ]);
  });
});

describe("MODELS reasoning capabilities", () => {
  it("exposes configurable reasoning levels for reasoning-capable OpenAI models", () => {
    expect(resolveModelReasoningLevels({ provider: "OpenAI", modelId: "gpt-5" })).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(resolveModelSupportsReasoning({ provider: "OpenAI", modelId: "gpt-5.2" })).toBe(true);
    expect(resolveModelReasoningLevels({ provider: "OpenAI", modelId: "gpt-5.2" })).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
  });

  it("exposes extra high for Codex reasoning models", () => {
    expect(
      resolveModelReasoningLevels({ provider: PROVIDER_OPENAI_CODEX, modelId: "gpt-5.4" })
    ).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("separates built-in reasoning support from configurable effort levels", () => {
    expect(
      resolveModelSupportsReasoning({
        provider: PROVIDER_NEBIUS,
        modelId: "deepseek-ai/DeepSeek-R1-0528",
      })
    ).toBe(true);
    expect(
      resolveModelReasoningLevels({
        provider: PROVIDER_NEBIUS,
        modelId: "deepseek-ai/DeepSeek-R1-0528",
      })
    ).toEqual([]);
  });

  it("exposes configurable effort for Claude Opus 4.5", () => {
    expect(
      resolveModelSupportsReasoning({ provider: "Anthropic", modelId: "claude-opus-4-5" })
    ).toBe(true);
    expect(
      resolveModelReasoningLevels({ provider: "Anthropic", modelId: "claude-opus-4-5" })
    ).toEqual(["low", "medium", "high"]);
  });

  it("marks Claude 4.5 non-Opus models as reasoning-capable without adaptive effort levels", () => {
    for (const modelId of ["claude-sonnet-4-5", "claude-haiku-4-5"]) {
      expect(resolveModelSupportsReasoning({ provider: "Anthropic", modelId })).toBe(true);
      expect(resolveModelReasoningLevels({ provider: "Anthropic", modelId })).toEqual([]);
    }
  });

  it("uses model-specific Gemini reasoning levels", () => {
    expect(
      resolveModelReasoningLevels({ provider: "Google", modelId: "gemini-3-pro-preview" })
    ).toEqual(["low", "high"]);
    expect(
      resolveModelReasoningLevels({ provider: "Google", modelId: "gemini-3-flash-preview" })
    ).toEqual(["minimal", "low", "medium", "high"]);
  });

  it("exposes configurable effort for provider paths that can send it", () => {
    expect(
      resolveModelReasoningLevels({ provider: "Groq", modelId: "openai/gpt-oss-20b" })
    ).toEqual(["low", "medium", "high"]);
    expect(resolveModelReasoningLevels({ provider: "Cerebras", modelId: "gpt-oss-120b" })).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(
      resolveModelReasoningLevels({
        provider: PROVIDER_NEBIUS,
        modelId: "openai/gpt-oss-120b",
      })
    ).toEqual(["low", "medium", "high"]);
  });

  it("does not infer reasoning from matching model IDs on unrelated providers", () => {
    expect(resolveModelSupportsReasoning({ provider: "GitHub Copilot", modelId: "gpt-5.2" })).toBe(
      false
    );
    expect(resolveModelReasoningLevels({ provider: "GitHub Copilot", modelId: "gpt-5.2" })).toEqual(
      []
    );
  });

  it("builds provider options from model configuration", () => {
    expect(
      LanguageModelProviderFactory.buildProviderOptions({
        modelConfig: { provider: "Google", modelId: "gemini-3-pro-preview" },
        outputReasoning: true,
        reasoningLevel: "medium",
        instructions: "ignored",
      })?.google?.thinkingConfig?.thinkingLevel
    ).toBe("low");

    expect(
      LanguageModelProviderFactory.buildProviderOptions({
        modelConfig: { provider: "Anthropic", modelId: "claude-opus-4-5" },
        outputReasoning: false,
        reasoningLevel: "medium",
        instructions: "ignored",
      })?.anthropic
    ).toEqual({ effort: "medium" });
  });
});

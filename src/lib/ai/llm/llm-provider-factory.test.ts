import { describe, expect, it } from "vitest";
import { MODELS } from "./llm-provider-factory";
import { PROVIDER_OPENAI_CODEX } from "./provider-ids";

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

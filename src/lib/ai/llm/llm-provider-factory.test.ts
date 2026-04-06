import { describe, expect, it } from "vitest";
import { MODELS } from "./llm-provider-factory";

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

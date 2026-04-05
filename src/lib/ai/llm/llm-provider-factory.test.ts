import { describe, expect, it } from "vitest";
import { supportsImageInput } from "./llm-provider-factory";

describe("supportsImageInput", () => {
  it("recognizes vision-capable frontier models", () => {
    expect(supportsImageInput({ provider: "OpenAI", modelId: "gpt-4o" })).toBe(true);
    expect(supportsImageInput({ provider: "Google", modelId: "gemini-2.5-flash" })).toBe(true);
    expect(supportsImageInput({ provider: "Anthropic", modelId: "claude-sonnet-4-5" })).toBe(true);
  });

  it("keeps non-vision models opt-in", () => {
    expect(
      supportsImageInput({ provider: "OpenRouter", modelId: "openai/gpt-oss-120b:free" })
    ).toBe(false);
    expect(supportsImageInput({ provider: "Groq", modelId: "openai/gpt-oss-20b" })).toBe(false);
  });
});

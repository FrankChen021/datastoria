import type { InputModel } from "@/lib/ai/agent/plan/sub-agent-registry";
import { SessionTitleGenerator } from "@/lib/ai/agent/session-title-generator";
import { describe, expect, it } from "vitest";

function createModel(provider: string, modelId: string): InputModel {
  return {
    provider,
    modelId,
    apiKey: "test-key",
  };
}

describe("SessionTitleGenerator.resolveTitleModel", () => {
  it("uses gpt-5-mini for OpenAI title generation", () => {
    expect(SessionTitleGenerator.resolveModel(createModel("OpenAI", "gpt-5"))).toEqual(
      createModel("OpenAI", "gpt-5-mini")
    );
  });

  it("uses claude-haiku-4-5 for Anthropic title generation", () => {
    expect(SessionTitleGenerator.resolveModel(createModel("Anthropic", "claude-opus-4-6"))).toEqual(
      createModel("Anthropic", "claude-haiku-4-5")
    );
  });

  it("uses gemini-2.5-flash for Google title generation", () => {
    expect(SessionTitleGenerator.resolveModel(createModel("Google", "gemini-2.5-pro"))).toEqual(
      createModel("Google", "gemini-2.5-flash")
    );
  });

  it("keeps the chat model for other providers", () => {
    expect(
      SessionTitleGenerator.resolveModel(createModel("OpenRouter", "x-ai/grok-code-fast-1"))
    ).toEqual(createModel("OpenRouter", "x-ai/grok-code-fast-1"));
  });
});

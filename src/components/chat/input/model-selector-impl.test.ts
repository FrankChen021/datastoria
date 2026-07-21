import { describe, expect, it } from "vitest";
import { groupModelsByProvider } from "./model-selector-order";

describe("groupModelsByProvider", () => {
  it("keeps catalog order within alphabetically ordered provider groups", () => {
    const models = [
      { provider: "OpenAI", modelId: "gpt-5.6-sol" },
      { provider: "Anthropic", modelId: "claude-fable-5" },
      { provider: "OpenAI", modelId: "gpt-5.5" },
      { provider: "Anthropic", modelId: "claude-sonnet-5" },
    ] as const;

    expect(groupModelsByProvider(models)).toEqual([
      ["Anthropic", [models[1], models[3]]],
      ["OpenAI", [models[0], models[2]]],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeGitHubCopilotModels } from "./github-copilot-models";

describe("normalizeGitHubCopilotModels", () => {
  it("inherits image-input support for known multimodal models", () => {
    const models = normalizeGitHubCopilotModels([
      {
        id: "gpt-4o",
        name: "gpt-4o",
        model_picker_enabled: true,
      },
    ]);

    expect(models).toEqual([
      expect.objectContaining({
        provider: "GitHub Copilot",
        modelId: "gpt-4o",
        supportsImageInput: true,
      }),
    ]);
  });
});

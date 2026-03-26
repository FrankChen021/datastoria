import { afterEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn();
const createModelMock = vi.fn();
const resolveModelConfigMock = vi.fn();
const getDefaultTemperatureMock = vi.fn();

vi.mock("ai", () => ({
  generateText: generateTextMock,
  Output: {
    object: ({ schema }: { schema: unknown }) => ({ schema }),
  },
}));

vi.mock("@/lib/ai/llm/llm-provider-factory", () => ({
  LanguageModelProviderFactory: {
    createModel: createModelMock,
    getDefaultTemperature: getDefaultTemperatureMock,
  },
  resolveModelConfig: resolveModelConfigMock,
}));

vi.mock("@/auth", () => ({
  getAuthenticatedUserEmail: vi.fn(() => "editor@example.com"),
}));

vi.mock("@/lib/ai/skills/skill-permission-manager", () => ({
  SkillPermissionManager: {
    canUserEditSkill: vi.fn(() => true),
  },
}));

describe("POST /api/ai/skills/review", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid file review requests", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/ai/skills/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "file",
          skillId: "diagnose-clickhouse-errors",
          target: {
            primaryPath: "references/115.md",
            files: [],
          },
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Too small: expected array to have >=1 items",
    });
  });

  it("returns structured review JSON for a selected file", async () => {
    resolveModelConfigMock.mockReturnValue({
      provider: "OpenAI",
      modelId: "gpt-5",
      apiKey: "secret",
    });
    createModelMock.mockReturnValue({ model: "fake" });
    getDefaultTemperatureMock.mockReturnValue(0.1);
    generateTextMock.mockResolvedValue({
      output: {
        findings:
          "## Findings\n\n- The remediation section does not explain how to verify the setting name.",
        proposals: [
          {
            path: "references/115.md",
            reason: "Add concrete verification and remediation steps.",
            updatedContent: "# Code 115\n\nRevised content",
          },
        ],
      },
    });

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/ai/skills/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "file",
          skillId: "diagnose-clickhouse-errors",
          model: {
            provider: "OpenAI",
            modelId: "gpt-5",
          },
          target: {
            primaryPath: "references/115.md",
            files: [
              {
                path: "references/115.md",
                content: "# Code 115\n\nCurrent content",
              },
            ],
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(resolveModelConfigMock).toHaveBeenCalledWith({
      provider: "OpenAI",
      modelId: "gpt-5",
    });
    expect(createModelMock).toHaveBeenCalledWith("OpenAI", "gpt-5", "secret");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { model: "fake" },
        temperature: 0.1,
        prompt: expect.stringContaining("Current file content"),
      })
    );
    await expect(response.json()).resolves.toEqual({
      findings:
        "## Findings\n\n- The remediation section does not explain how to verify the setting name.",
      proposals: [
        {
          path: "references/115.md",
          reason: "Add concrete verification and remediation steps.",
          updatedContent: "# Code 115\n\nRevised content",
        },
      ],
    });
  });

  it("normalizes partially invalid model output before returning the response", async () => {
    resolveModelConfigMock.mockReturnValue({
      provider: "GitHub Copilot",
      modelId: "gpt-4o",
      apiKey: "secret",
    });
    createModelMock.mockReturnValue({ model: "fake" });
    getDefaultTemperatureMock.mockReturnValue(0.1);
    generateTextMock.mockResolvedValue({
      output: {
        proposals: [],
      },
    });

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/ai/skills/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "file",
          skillId: "diagnose-clickhouse-errors",
          model: {
            provider: "GitHub Copilot",
            modelId: "gpt-4o",
          },
          target: {
            primaryPath: "references/115.md",
            files: [
              {
                path: "references/115.md",
                content: "# Code 115\n\nCurrent content",
              },
            ],
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      findings: "## Review Notes\n\nNo major issues found in this file.",
      proposals: [],
    });
  });
});

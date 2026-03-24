import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const getAvailableSystemModelsMock = vi.fn();

vi.mock("@/lib/ai/llm/llm-provider-factory", () => ({
  getAvailableSystemModels: () => getAvailableSystemModelsMock(),
}));

describe("POST /api/ai/models/available", () => {
  beforeEach(() => {
    getAvailableSystemModelsMock.mockReset();
    getAvailableSystemModelsMock.mockReturnValue([
      {
        provider: "OpenAI",
        modelId: "gpt-5",
        source: "system",
      },
    ]);
    vi.restoreAllMocks();
  });

  it("returns system models when no GitHub token is provided", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/models/available", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }) as never
    );
    const body = await response.json();

    expect(body).toEqual({
      systemModels: [
        {
          provider: "OpenAI",
          modelId: "gpt-5",
          source: "system",
        },
      ],
      githubModels: [],
    });
  });

  it("returns GitHub models when a GitHub token is present in the request body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "gpt-5",
          name: "GPT-5",
          model_picker_enabled: true,
          vendor: "OpenAI",
          supported_endpoints: ["chat"],
        },
      ],
    } as Response);

    const response = await POST(
      new Request("http://localhost/api/ai/models/available", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          github: {
            token: "copilot-token",
          },
        }),
      }) as never
    );
    const body = await response.json();

    expect(body.systemModels).toHaveLength(1);
    expect(body.githubModels).toEqual([
      expect.objectContaining({
        provider: "GitHub Copilot",
        modelId: "gpt-5",
        source: "user",
      }),
    ]);
  });

  it("treats invalid JSON as no optional providers", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/models/available", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{",
      }) as never
    );
    const body = await response.json();

    expect(body).toEqual({
      systemModels: [
        {
          provider: "OpenAI",
          modelId: "gpt-5",
          source: "system",
        },
      ],
      githubModels: [],
    });
  });
});

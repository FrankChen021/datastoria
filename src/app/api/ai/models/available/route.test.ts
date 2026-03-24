import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const getAvailableSystemModelsMock = vi.fn();

vi.mock("@/lib/ai/llm/llm-provider-factory", () => ({
  getAvailableSystemModels: () => getAvailableSystemModelsMock(),
}));

describe("GET /api/ai/models/available", () => {
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
    const response = await GET(new Request("http://localhost/api/ai/models/available") as never);
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

  it("returns GitHub models when an authorization header is present", async () => {
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

    const response = await GET(
      new Request("http://localhost/api/ai/models/available", {
        headers: {
          Authorization: "Bearer copilot-token",
        },
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
});

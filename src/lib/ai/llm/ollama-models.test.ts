import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchOllamaModels,
  getOllamaHost,
  getOllamaOpenAiBaseUrl,
  getOllamaTagsUrl,
  isOllamaConfigured,
  normalizeOllamaModels,
} from "./ollama-models";
import { PROVIDER_OLLAMA } from "./provider-ids";

const ORIGINAL_BASE_URL = process.env.OLLAMA_BASE_URL;

afterEach(() => {
  if (ORIGINAL_BASE_URL === undefined) {
    delete process.env.OLLAMA_BASE_URL;
  } else {
    process.env.OLLAMA_BASE_URL = ORIGINAL_BASE_URL;
  }
  vi.restoreAllMocks();
});

describe("normalizeOllamaModels", () => {
  it("maps the /api/tags payload into sorted model entries", () => {
    const models = normalizeOllamaModels({
      models: [
        {
          name: "qwen2.5-coder:7b",
          model: "qwen2.5-coder:7b",
          details: { parameter_size: "7.6B", quantization_level: "Q4_K_M" },
        },
        { name: "llama3.1:latest", model: "llama3.1:latest" },
      ],
    });

    expect(models.map((model) => model.modelId)).toEqual(["llama3.1:latest", "qwen2.5-coder:7b"]);
    expect(models.every((model) => model.provider === PROVIDER_OLLAMA)).toBe(true);
    expect(models.every((model) => model.source === "system")).toBe(true);
    expect(models[1].description).toContain("7.6B");
    expect(models[1].description).toContain("Q4_K_M");
  });

  it("dedupes and ignores empty entries", () => {
    const models = normalizeOllamaModels({
      models: [{ model: "llama3.1" }, { model: "llama3.1" }, { model: "" }, { name: "  " }],
    });

    expect(models.map((model) => model.modelId)).toEqual(["llama3.1"]);
  });

  it("returns an empty list for unexpected payloads", () => {
    expect(normalizeOllamaModels(undefined)).toEqual([]);
    expect(normalizeOllamaModels({})).toEqual([]);
    expect(normalizeOllamaModels({ models: "nope" })).toEqual([]);
  });
});

describe("Ollama URL helpers", () => {
  it("is disabled when OLLAMA_BASE_URL is unset", () => {
    delete process.env.OLLAMA_BASE_URL;
    expect(isOllamaConfigured()).toBe(false);
    expect(getOllamaHost()).toBe("http://localhost:11434");
    expect(getOllamaOpenAiBaseUrl()).toBe("http://localhost:11434/v1");
    expect(getOllamaTagsUrl()).toBe("http://localhost:11434/api/tags");
  });

  it("normalizes a configured host with a trailing slash", () => {
    process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434/";
    expect(isOllamaConfigured()).toBe(true);
    expect(getOllamaHost()).toBe("http://ollama.internal:11434");
    expect(getOllamaOpenAiBaseUrl()).toBe("http://ollama.internal:11434/v1");
  });

  it("normalizes a configured host that already includes /v1", () => {
    process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434/v1";
    expect(getOllamaHost()).toBe("http://ollama.internal:11434");
    expect(getOllamaOpenAiBaseUrl()).toBe("http://ollama.internal:11434/v1");
    expect(getOllamaTagsUrl()).toBe("http://ollama.internal:11434/api/tags");
  });
});

describe("fetchOllamaModels", () => {
  beforeEach(() => {
    delete process.env.OLLAMA_BASE_URL;
  });

  it("returns an empty list without fetching when Ollama is not configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(fetchOllamaModels()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and normalizes tags when configured", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ model: "llama3.1" }] }),
    } as Response);

    const models = await fetchOllamaModels();
    expect(models).toEqual([
      expect.objectContaining({ provider: PROVIDER_OLLAMA, modelId: "llama3.1" }),
    ]);
  });

  it("returns an empty list when the request fails", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));

    await expect(fetchOllamaModels()).resolves.toEqual([]);
  });
});

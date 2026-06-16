import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { PROVIDER_OLLAMA } from "@/lib/ai/llm/provider-ids";

/**
 * Default Ollama host. Ollama listens on this address out of the box.
 * Override with the `OLLAMA_BASE_URL` environment variable to point at a
 * remote or containerized Ollama server.
 */
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

/**
 * Ollama does not require an API key. The OpenAI-compatible client still
 * expects a non-empty key, so we send a harmless placeholder unless the
 * deployment configures a bearer token (e.g. behind an auth proxy).
 */
export const OLLAMA_PLACEHOLDER_API_KEY = "ollama";

/**
 * Strip a trailing slash and an optional `/v1` suffix so callers can configure
 * either the bare host (`http://localhost:11434`) or the OpenAI-compatible base
 * (`http://localhost:11434/v1`) and still get correct native/OpenAI endpoints.
 */
function normalizeOllamaHost(rawBaseUrl: string): string {
  let host = rawBaseUrl.trim().replace(/\/+$/, "");
  if (host.toLowerCase().endsWith("/v1")) {
    host = host.slice(0, -"/v1".length);
  }
  return host;
}

/** Returns true when the deployment has opted in to the Ollama provider. */
export function isOllamaConfigured(): boolean {
  return Boolean(process.env.OLLAMA_BASE_URL?.trim());
}

/** Normalized Ollama host root (no trailing slash, no `/v1`). */
export function getOllamaHost(): string {
  return normalizeOllamaHost(process.env.OLLAMA_BASE_URL?.trim() || OLLAMA_DEFAULT_BASE_URL);
}

/** OpenAI-compatible base URL used by the chat/completions client. */
export function getOllamaOpenAiBaseUrl(): string {
  return `${getOllamaHost()}/v1`;
}

/** Native Ollama endpoint used to discover locally available models. */
export function getOllamaTagsUrl(): string {
  return `${getOllamaHost()}/api/tags`;
}

/** API key forwarded to the OpenAI-compatible client (placeholder by default). */
export function getOllamaApiKey(): string {
  return process.env.OLLAMA_API_KEY?.trim() || OLLAMA_PLACEHOLDER_API_KEY;
}

interface OllamaTag {
  name?: string;
  model?: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

/**
 * Convert the payload returned by Ollama's `GET /api/tags` into the model
 * catalog shape used throughout the app. Models discovered this way are
 * surfaced as system-backed entries because the server holds the connection.
 */
export function normalizeOllamaModels(payload: unknown): ModelProps[] {
  const tags: OllamaTag[] = Array.isArray((payload as { models?: unknown })?.models)
    ? ((payload as { models: OllamaTag[] }).models ?? [])
    : [];

  const seen = new Set<string>();
  return tags
    .map((tag) => (tag.model ?? tag.name ?? "").trim())
    .filter((modelId) => {
      if (!modelId || seen.has(modelId)) {
        return false;
      }
      seen.add(modelId);
      return true;
    })
    .map((modelId): ModelProps => {
      const tag = tags.find((candidate) => (candidate.model ?? candidate.name) === modelId);
      const descriptionParts: string[] = [];
      if (tag?.details?.parameter_size) {
        descriptionParts.push(`- **Parameters**: ${tag.details.parameter_size}\n\n`);
      }
      if (tag?.details?.quantization_level) {
        descriptionParts.push(`- **Quantization**: ${tag.details.quantization_level}\n\n`);
      }
      descriptionParts.push("- **Runs locally via Ollama**\n\n");

      return {
        provider: PROVIDER_OLLAMA,
        modelId,
        description: descriptionParts.join(""),
        free: true,
        supportsImageInput: false,
        source: "system" as const,
      };
    })
    .sort((a, b) => a.modelId.localeCompare(b.modelId));
}

/**
 * Fetch the list of locally available Ollama models. Returns an empty list
 * (never throws) when Ollama is not configured or unreachable so the rest of
 * the model catalog continues to load.
 */
export async function fetchOllamaModels(timeoutMs = 1500): Promise<ModelProps[]> {
  if (!isOllamaConfigured()) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(getOllamaTagsUrl(), {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }
    return normalizeOllamaModels(await response.json());
  } catch (error) {
    console.error("Failed to fetch Ollama models:", error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

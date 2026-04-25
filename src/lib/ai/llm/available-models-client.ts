import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { BasePath } from "@/lib/base-path";

export interface AvailableModelsResponse {
  systemModels: ModelProps[];
  githubModels: ModelProps[];
}

const inFlightRequests = new Map<string, Promise<AvailableModelsResponse>>();

export async function fetchAvailableModels(tokens?: {
  githubToken?: string;
}): Promise<AvailableModelsResponse> {
  const requestBody = tokens
    ? {
        ...(tokens.githubToken
          ? {
              github: {
                token: tokens.githubToken,
              },
            }
          : {}),
      }
    : {};
  const requestKey = JSON.stringify(requestBody);
  const existing = inFlightRequests.get(requestKey);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    const response = await fetch(BasePath.getURL("/api/ai/models/available"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to load available models: ${response.status}`);
    }

    return (await response.json()) as AvailableModelsResponse;
  })().finally(() => {
    inFlightRequests.delete(requestKey);
  });

  inFlightRequests.set(requestKey, request);
  return request;
}

import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { BasePath } from "@/lib/base-path";

export interface AvailableModelsResponse {
  systemModels: ModelProps[];
  githubModels: ModelProps[];
}

export async function fetchAvailableModels(accessToken?: string): Promise<AvailableModelsResponse> {
  const response = await fetch(BasePath.getURL("/api/ai/models/available"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      accessToken
        ? {
            github: {
              token: accessToken,
            },
          }
        : {}
    ),
  });

  if (!response.ok) {
    throw new Error(`Failed to load available models: ${response.status}`);
  }

  return (await response.json()) as AvailableModelsResponse;
}

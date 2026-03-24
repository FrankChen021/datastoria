import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { BasePath } from "@/lib/base-path";

export interface AvailableModelsResponse {
  systemModels: ModelProps[];
  githubModels: ModelProps[];
}

export async function fetchAvailableModels(accessToken?: string): Promise<AvailableModelsResponse> {
  const response = await fetch(BasePath.getURL("/api/ai/models/available"), {
    headers: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to load available models: ${response.status}`);
  }

  return (await response.json()) as AvailableModelsResponse;
}

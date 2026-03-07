import type { LanguageModel } from "ai";
import type { ModelProps } from "./llm-provider-factory";

type ModelCreator = (modelId: string, apiKey: string) => LanguageModel;

export const PRIVATE_CREATORS: Record<string, ModelCreator> = {};

export const PRIVATE_MODELS: ModelProps[] = [];

export const PRIVATE_PROVIDER_CONFIGS: Array<{ provider: string; apiKey: string | undefined }> = [];

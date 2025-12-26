import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { mockModel } from "./models.mock";

/**
 * Check if mock mode is enabled
 * Set USE_MOCK_LLM=true in your .env file to enable mock mode
 */
export const isMockMode = process.env.USE_MOCK_LLM === "true";

type ModelCreator = (modelId: string, apiKey: string) => LanguageModel;

export interface ModelProps {
  provider: string;
  modelId: string;
  free?: boolean;
  autoSelectable?: boolean;
  disabled?: boolean;
}

/**
 * Provider creator functions map
 * Key: provider name (e.g., "OpenAI", "Google", "Anthropic", "OpenRouter", "Groq")
 * Value: creator function that takes modelId and apiKey and returns a LanguageModel
 */
export const CREATORS: Record<string, ModelCreator> = {
  OpenAI: (modelId, apiKey) =>
    createOpenAI({
      apiKey,
    }).chat(modelId),
  Google: (modelId, apiKey) =>
    createGoogleGenerativeAI({
      apiKey,
    }).chat(modelId),
  Anthropic: (modelId, apiKey) =>
    createAnthropic({
      apiKey,
    }).chat(modelId),
  OpenRouter: (modelId, apiKey) =>
    createOpenRouter({
      apiKey,
    }).chat(modelId),
  Groq: (modelId, apiKey) =>
    createGroq({
      apiKey,
    })(modelId),
};

/**
 * Flattened array of all models with their properties
 * Each model includes provider, modelId, and metadata (free, autoSelectable)
 */
export const MODELS: ModelProps[] = [
  // OpenAI models
  { provider: "OpenAI", modelId: "gpt-4o", free: false, autoSelectable: true },
  { provider: "OpenAI", modelId: "gpt-4o-mini", free: false },
  { provider: "OpenAI", modelId: "gpt-4-turbo", free: false },
  { provider: "OpenAI", modelId: "gpt-4", free: false },
  { provider: "OpenAI", modelId: "gpt-3.5-turbo", free: false },
  { provider: "OpenAI", modelId: "o1-preview", free: false },
  { provider: "OpenAI", modelId: "o1-mini", free: false },
  { provider: "OpenAI", modelId: "o3-mini", free: false },

  // Google models
  { provider: "Google", modelId: "gemini-2.5-pro", free: false, autoSelectable: true },
  { provider: "Google", modelId: "gemini-2.0-flash-exp", free: false },
  { provider: "Google", modelId: "gemini-1.5-pro", free: false },
  { provider: "Google", modelId: "gemini-1.5-flash", free: false },
  { provider: "Google", modelId: "gemini-pro", free: false },

  // Anthropic models
  { provider: "Anthropic", modelId: "claude-sonnet-4-20250514", free: false, autoSelectable: true },
  { provider: "Anthropic", modelId: "claude-3-5-sonnet-20241022", free: false },
  { provider: "Anthropic", modelId: "claude-3-opus-20240229", free: false },
  { provider: "Anthropic", modelId: "claude-3-sonnet-20240229", free: false },
  { provider: "Anthropic", modelId: "claude-3-haiku-20240307", free: false },

  // OpenRouter models
  { provider: "OpenRouter", modelId: "x-ai/grok-code-fast-1", free: false },
  { provider: "OpenRouter", modelId: "qwen/qwen3-coder:free", free: true, autoSelectable: true },

  // Groq models
  // https://console.groq.com/home
  { provider: "Groq", modelId: "openai/gpt-oss-20b", free: false, autoSelectable: true },
  // qwen is DISABLE 'cause it internally does NOT handle tool call correctly
  { provider: "Groq", modelId: "qwen/qwen3-32b", free: false, disabled: true, autoSelectable: true },
];


/**
 * Language Model Provider Factory
 * Factory for creating and configuring language models from various providers
 */
export class LanguageModelProviderFactory {
  /**
   * Auto-select a provider model based on available API keys
   * Priority: OpenAI > Google > Anthropic > OpenRouter > Groq
   * Randomly selects from auto-selectable models if multiple are available
   * Excludes disabled models from selection
   * @returns An object with provider name, model ID, and API key
   * @throws Error if no API key is configured
   */
  static autoSelectModel(): { provider: string; modelId: string; apiKey: string } {
    // Priority order: OpenAI > Google > Anthropic > OpenRouter > Groq
    const providerConfigs = [
      { provider: "OpenAI", apiKey: process.env.OPENAI_API_KEY },
      { provider: "Google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY },
      { provider: "Anthropic", apiKey: process.env.ANTHROPIC_API_KEY },
      { provider: "OpenRouter", apiKey: process.env.OPENROUTER_API_KEY },
      { provider: "Groq", apiKey: process.env.GROQ_API_KEY },
    ];

    // Find the first provider with an available API key
    for (const { provider, apiKey } of providerConfigs) {
      if (apiKey) {
        // Get all auto-selectable models for this provider
        const autoSelectableModels = MODELS.filter((model) => {
          if (model.provider !== provider || model.autoSelectable !== true) {
            return false;
          }

          // Check if model is disabled in the model definition itself
          if (model.disabled === true) {
            return false;
          }

          return true;
        });

        if (autoSelectableModels.length > 0) {
          // Randomly select one model from auto-selectable models
          const randomModel = autoSelectableModels[Math.floor(Math.random() * autoSelectableModels.length)];
          return {
            provider: randomModel.provider,
            modelId: randomModel.modelId,
            apiKey: apiKey,
          };
        }
      }
    }

    throw new Error(
      "No AI API key configured. Set OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY"
    );
  }

  /**
   * Create a language model with the provided parameters
   *
   * Priority:
   * 1. If USE_MOCK_LLM=true, returns mock models
   * 2. Otherwise, creates a model with the provided provider, modelId, and apiKey
   *
   * @param provider - Provider name (e.g., "OpenAI", "Google", "Anthropic", "OpenRouter", "Groq")
   * @param modelId - Model ID to use
   * @param apiKey - API key to use
   * @returns A tuple containing [LanguageModel, ModelProps] where ModelProps contains metadata like the 'free' flag
   * @throws Error if provider, modelId, or apiKey are missing, or if the model/provider is not supported
   */
  static createModel(provider: string, modelId: string, apiKey: string): [LanguageModel, ModelProps] {
    if (isMockMode) {
      console.log("🤖 Using MOCK LLM models (no API costs)");
      // Return mock model with a default ModelProps object
      return [
        mockModel,
        {
          provider: "Mock",
          modelId: "mock-model",
          free: false,
        },
      ];
    }

    if (!provider || !modelId || !apiKey) {
      throw new Error("Provider, modelId, and apiKey are required to create a model");
    }

    // Look up model in the flattened models array
    const modelProps = MODELS.find((m) => m.provider === provider && m.modelId === modelId);
    if (!modelProps) {
      throw new Error(`Model ${modelId} is not supported for provider ${provider}`);
    }

    // Get the creator function for this provider
    const creator = CREATORS[provider];
    if (!creator) {
      throw new Error(`Provider ${provider} is not supported`);
    }

    return [creator(modelId, apiKey), modelProps];
  }
}

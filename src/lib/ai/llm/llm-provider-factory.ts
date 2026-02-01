import { createAnthropic } from "@ai-sdk/anthropic";
import { createCerebras } from "@ai-sdk/cerebras";
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
  description?: string;
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
    })(modelId),
  Google: (modelId, apiKey) =>
    createGoogleGenerativeAI({
      apiKey,
    })(modelId),
  Anthropic: (modelId, apiKey) =>
    createAnthropic({
      apiKey,
    })(modelId),
  OpenRouter: (modelId, apiKey) =>
    createOpenRouter({
      apiKey,
    })(modelId),
  Groq: (modelId, apiKey) =>
    createGroq({
      apiKey,
    })(modelId),
  Cerebras: (modelId, apiKey) =>
    createCerebras({
      apiKey,
    })(modelId),
};

/**
 * Flattened array of all models with their properties
 * Each model includes provider, modelId, and metadata (free, autoSelectable)
 */
export const MODELS: ModelProps[] = [
  // OpenAI models
  // https://platform.openai.com/chat/edit
  {
    provider: "OpenAI",
    modelId: "gpt-5",
    free: false,
    autoSelectable: false,
    description: "Next-generation frontier model from OpenAI.",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.2",
    free: false,
    autoSelectable: false,
    description: "Enhanced version of GPT-5 with improved reasoning capabilities.",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4.1",
    free: false,
    description: "Updated GPT-4 model with improved performance and accuracy.",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4o",
    free: false,
    description: "Omni model from OpenAI, designed for speed and multimodal interaction.",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4o-mini",
    free: false,
    description: "Lighter version of GPT-4o for faster, cost-effective tasks.",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4",
    free: false,
    description: "Robust high-capability model for complex reasoning and tasks.",
  },
  {
    provider: "OpenAI",
    modelId: "o1",
    free: false,
    description: "OpenAI's latest reasoning model, optimized for chain-of-thought.",
  },
  {
    provider: "OpenAI",
    modelId: "o3-mini",
    free: false,
    description: "Optimized version of OpenAI's reasoning models for fast responses.",
  },

  // Google models
  // https://ai.google.dev/gemini-api/docs/models
  {
    provider: "Google",
    modelId: "gemini-3-pro-preview",
    free: false,
    autoSelectable: false,
    description: "Google's most capable model for complex tasks and multimodal inputs.",
  },
  {
    provider: "Google",
    modelId: "gemini-3-flash-preview",
    free: false,
    autoSelectable: false,
    description: "Fast and efficient model from Google for rapid interactions.",
  },
  {
    provider: "Google",
    modelId: "gemini-2.5-flash",
    free: false,
    description: "Google's flash model optimized for speed and large context windows.",
  },
  {
    provider: "Google",
    modelId: "gemini-2.5-pro",
    free: false,
    description: "Google's pro model with high intelligence and broad knowledge.",
  },
  {
    provider: "Google",
    modelId: "gemini-2.0-flash",
    free: false,
    description: "Legacy flash model from Google, efficient for simple tasks.",
  },

  // Anthropic models
  // https://platform.claude.com/docs/en/about-claude/models/overview
  {
    provider: "Anthropic",
    modelId: "claude-sonnet-4-5",
    free: false,
    autoSelectable: false,
    description: "Anthropic's latest Sonnet model with extreme intelligence and reliability.",
  },
  {
    provider: "Anthropic",
    modelId: "claude-haiku-4-5",
    free: false,
    description: "Anthropic's fast and lightweight model for near-instant responses.",
  },
  {
    provider: "Anthropic",
    modelId: "claude-opus-4-5",
    free: false,
    description: "Anthropic's most powerful model for highly complex analysis.",
  },

  // OpenRouter models
  {
    provider: "OpenRouter",
    modelId: "x-ai/grok-code-fast-1",
    free: false,
    description: "Grok code model optimized for fast and accurate code generation.",
  },
  {
    provider: "OpenRouter",
    modelId: "qwen/qwen3-coder:free",
    free: true,
    autoSelectable: true,
    description: "Qwen 3 coder model, highly capable at writing and explaining SQL.",
  },
  {
    provider: "OpenRouter",
    modelId: "openai/gpt-oss-20b:free",
    free: true,
    autoSelectable: true,
    description: "Open-source GPT model with large parameter count for general tasks.",
  },
  {
    provider: "OpenRouter",
    modelId: "openai/gpt-oss-120b:free",
    free: true,
    autoSelectable: true,
    description: "Open-source GPT model with large parameter count for general tasks.",
  },

  // Groq models
  // https://console.groq.com/docs/models
  {
    provider: "Groq",
    modelId: "openai/gpt-oss-20b",
    free: false,
    autoSelectable: true,
    description: "Fast-inference open-source model running on Groq hardware.",
  },
  // qwen is DISABLE 'cause it internally does NOT handle tool call correctly
  {
    provider: "Groq",
    modelId: "qwen/qwen3-32b",
    free: false,
    disabled: true,
    autoSelectable: false,
    description: "High-performance Qwen 3 model, currently disabled due to tool call issues.",
  },

  // Cerebras models
  // https://cloud.cerebras.ai/platform
  {
    provider: "Cerebras",
    modelId: "gpt-oss-120b",
    free: false,
    autoSelectable: true,
    description: "Cerebras's latest model with extreme intelligence and reliability.",
  },
];

/**
 * Language Model Provider Factory
 * Factory for creating and configuring language models from various providers
 */
export class LanguageModelProviderFactory {
  /**
   * Get the default temperature for a given model
   * Different models have different default and supported temperature ranges
   *
   * @param modelId - The model ID to get default temperature for
   * @returns The default temperature value for the model
   */
  static getDefaultTemperature(modelId: string): number {
    // Models that require temperature = 1
    if (modelId.includes("gpt-5-nano") || modelId.includes("gpt-5-mini")) {
      return 1;
    }

    return 0.1;
  }

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
      { provider: "Cerebras", apiKey: process.env.CEREBRAS_API_KEY },
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
          const randomModel =
            autoSelectableModels[Math.floor(Math.random() * autoSelectableModels.length)];
          return {
            provider: randomModel.provider,
            modelId: randomModel.modelId,
            apiKey: apiKey,
          };
        }
      }
    }

    throw new Error(
      "The server currently does not provide any models. Please configure models in the settings to use your own."
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
  static createModel(
    provider: string,
    modelId: string,
    apiKey: string
  ): [LanguageModel, ModelProps] {
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

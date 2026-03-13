import { createAnthropic } from "@ai-sdk/anthropic";
import { createCerebras } from "@ai-sdk/cerebras";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGitHubCopilotOpenAICompatible } from "@opeoginni/github-copilot-openai-compatible";
import type { LanguageModel } from "ai";
import { PRIVATE_MODELS, PRIVATE_PROVIDERS } from "./llm-provider-factory-private";
import { mockModel } from "./models.mock";
import { PROVIDER_GITHUB_COPILOT, PROVIDER_NEBIUS } from "./provider-ids";

/**
 * Check if mock mode is enabled
 * Set USE_MOCK_LLM=true in your .env file to enable mock mode
 */
export const isMockMode = process.env.USE_MOCK_LLM === "true";

type ModelCreator = (modelId: string, apiKey: string) => LanguageModel;
type RequestedModelConfig = { provider: string; modelId: string; apiKey?: string };
type ResolvedModelConfig = { provider: string; modelId: string; apiKey: string };
export type ModelSource = "user" | "system";
export interface ProviderDefinition {
  create: ModelCreator;
  systemApiKey?: () => string | undefined;
}

export interface ModelProps {
  provider: string;
  modelId: string;
  description?: string;
  free?: boolean;
  autoSelectable?: boolean;
  disabled?: boolean;
  supportedEndpoints?: string[];
  source?: ModelSource;
}

/**
 * Provider definitions map
 * Key: provider name (e.g., "OpenAI", "Google", "Anthropic", "OpenRouter", "Groq")
 * Value: model creator plus optional server-side environment variable name
 */
export const PROVIDERS: Record<string, ProviderDefinition> = {
  ...PRIVATE_PROVIDERS,
  OpenAI: {
    create: (modelId, apiKey) =>
      createOpenAI({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.OPENAI_API_KEY,
  },
  Google: {
    create: (modelId, apiKey) =>
      createGoogleGenerativeAI({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  },
  Anthropic: {
    create: (modelId, apiKey) =>
      createAnthropic({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.ANTHROPIC_API_KEY,
  },
  OpenRouter: {
    create: (modelId, apiKey) =>
      createOpenRouter({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.OPENROUTER_API_KEY,
  },
  Groq: {
    create: (modelId, apiKey) =>
      createGroq({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.GROQ_API_KEY,
  },
  Cerebras: {
    create: (modelId, apiKey) =>
      createCerebras({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.CEREBRAS_API_KEY,
  },
  [PROVIDER_GITHUB_COPILOT]: {
    create: (modelId, apiKey) => {
      console.log(`${PROVIDER_GITHUB_COPILOT} modelId:`, modelId);
      return createGitHubCopilotOpenAICompatible({
        apiKey: apiKey,
        headers: {
          "Copilot-Integration-Id": "vscode-chat",
          "User-Agent": "GitHubCopilotChat/0.26.7",
          "Editor-Version": "vscode/1.104.1",
          "Editor-Plugin-Version": "copilot-chat/0.26.7",
        },
      })(modelId);
    },
  },
  [PROVIDER_NEBIUS]: {
    create: (modelId, apiKey) =>
      createOpenAICompatible({
        name: "nebius",
        apiKey,
        baseURL: "https://api.tokenfactory.nebius.com/v1/",
      })(modelId),
    systemApiKey: () => process.env.NEBIUS_API_KEY,
  },
};

export const MODELS: ModelProps[] = [
  ...PRIVATE_MODELS,

  // OpenAI models
  // https://platform.openai.com/chat/edit
  {
    provider: "OpenAI",
    modelId: "gpt-5",
    free: false,
    autoSelectable: false,
    description: "Next-generation frontier model from OpenAI.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.2",
    free: false,
    autoSelectable: false,
    description: "Enhanced version of GPT-5 with improved reasoning capabilities.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4.1",
    free: false,
    description: "Updated GPT-4 model with improved performance and accuracy.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4o",
    free: false,
    description: "Omni model from OpenAI, designed for speed and multimodal interaction.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4o-mini",
    free: false,
    description: "Lighter version of GPT-4o for faster, cost-effective tasks.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4",
    free: false,
    description: "Robust high-capability model for complex reasoning and tasks.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "o1",
    free: false,
    description: "OpenAI's latest reasoning model, optimized for chain-of-thought.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "o3-mini",
    free: false,
    description: "Optimized version of OpenAI's reasoning models for fast responses.",
    source: "user",
  },

  // Google models
  // https://ai.google.dev/gemini-api/docs/models
  {
    provider: "Google",
    modelId: "gemini-3-pro-preview",
    free: false,
    autoSelectable: false,
    description: "Google's most capable model for complex tasks and multimodal inputs.",
    source: "user",
  },
  {
    provider: "Google",
    modelId: "gemini-3-flash-preview",
    free: false,
    autoSelectable: false,
    description: "Fast and efficient model from Google for rapid interactions.",
    source: "user",
  },
  {
    provider: "Google",
    modelId: "gemini-2.5-flash",
    free: false,
    description: "Google's flash model optimized for speed and large context windows.",
    source: "user",
  },
  {
    provider: "Google",
    modelId: "gemini-2.5-pro",
    free: false,
    description: "Google's pro model with high intelligence and broad knowledge.",
    source: "user",
  },
  {
    provider: "Google",
    modelId: "gemini-2.0-flash",
    free: false,
    description: "Legacy flash model from Google, efficient for simple tasks.",
    source: "user",
  },

  // Anthropic models
  // https://platform.claude.com/docs/en/about-claude/models/overview
  {
    provider: "Anthropic",
    modelId: "claude-opus-4-6",
    free: false,
    autoSelectable: false,
    description: "Anthropic's most intelligent model for building agents and coding.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-opus-4-5",
    free: false,
    description: "Anthropic's most powerful model for highly complex analysis.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-sonnet-4-5",
    free: false,
    autoSelectable: false,
    description: "Anthropic's best combination of speed and intelligence.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-haiku-4-5",
    free: false,
    description: "Anthropic's fastest model with near-frontier intelligence.",
    source: "user",
  },

  // OpenRouter models
  {
    provider: "OpenRouter",
    modelId: "x-ai/grok-code-fast-1",
    free: false,
    description: "Grok code model optimized for fast and accurate code generation.",
    source: "user",
  },
  {
    provider: "OpenRouter",
    modelId: "qwen/qwen3-coder:free",
    free: true,
    autoSelectable: true,
    description: "Qwen 3 coder model, highly capable at writing and explaining SQL.",
    source: "user",
  },
  {
    provider: "OpenRouter",
    modelId: "openai/gpt-oss-20b:free",
    free: true,
    autoSelectable: true,
    description: "Open-source GPT model with large parameter count for general tasks.",
    source: "user",
  },
  {
    provider: "OpenRouter",
    modelId: "openai/gpt-oss-120b:free",
    free: true,
    autoSelectable: true,
    description: "Open-source GPT model with large parameter count for general tasks.",
    source: "user",
  },

  // Groq models
  // https://console.groq.com/docs/models
  {
    provider: "Groq",
    modelId: "openai/gpt-oss-20b",
    free: false,
    autoSelectable: true,
    description: "Fast-inference open-source model running on Groq hardware.",
    source: "user",
  },
  // qwen is DISABLE 'cause it internally does NOT handle tool call correctly
  {
    provider: "Groq",
    modelId: "qwen/qwen3-32b",
    free: false,
    disabled: true,
    autoSelectable: false,
    description: "High-performance Qwen 3 model, currently disabled due to tool call issues.",
    source: "user",
  },

  // Cerebras models
  // https://cloud.cerebras.ai/platform
  {
    provider: "Cerebras",
    modelId: "gpt-oss-120b",
    free: false,
    autoSelectable: true,
    description: "Cerebras's latest model with extreme intelligence and reliability.",
    source: "user",
  },

  // Nebius models
  // https://studio.nebius.ai/
  {
    provider: PROVIDER_NEBIUS,
    modelId: "deepseek-ai/DeepSeek-V3-0324",
    free: false,
    autoSelectable: true,
    description: "DeepSeek V3, powerful open-source model with strong reasoning.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "deepseek-ai/DeepSeek-R1-0528",
    free: false,
    autoSelectable: true,
    description: "DeepSeek R1, advanced reasoning model with chain-of-thought.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "Qwen/Qwen3-235B-A22B",
    free: false,
    autoSelectable: true,
    description: "Qwen 3 235B, largest Qwen model for complex tasks.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "Qwen/Qwen3-Next-80B-A3B-Thinking",
    free: false,
    autoSelectable: true,
    description: "Qwen3-Next-80B-A3B-Thinking, efficient reasoning model.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "zai-org/GLM-4.7-FP8",
    free: false,
    autoSelectable: true,
    description:
      "Flagship GLM model with strong multilingual reasoning, long context, and robust tool use.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "moonshotai/Kimi-K2.5",
    free: false,
    autoSelectable: true,
    description: "Kimi-K2.5, 15 trillion mixed visual and text tokens atop Kimi-K2-Base",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "openai/gpt-oss-120b",
    free: false,
    autoSelectable: true,
    description: "GPT-OSS 120B, open-source GPT model with strong general capabilities.",
    source: "user",
  },
];

function getSystemProviderApiKey(provider: string): string | undefined {
  return PROVIDERS[provider]?.systemApiKey?.();
}

/**
 * Catalog models whose provider is backed by a server-side API key.
 * These entries are projected as system models so the client can surface them
 * without requiring local provider credentials.
 */
export const SYSTEM_MODELS: ModelProps[] = MODELS.filter((model) =>
  Boolean(getSystemProviderApiKey(model.provider))
).map((model) => ({
  ...model,
  source: "system",
}));

export function getAvailableSystemModels(): ModelProps[] {
  return SYSTEM_MODELS.filter(
    (model) => getSystemProviderApiKey(model.provider) && model.autoSelectable !== true
  );
}

export function resolveModelConfig(model?: RequestedModelConfig): ResolvedModelConfig {
  if (!model?.provider || !model.modelId) {
    return LanguageModelProviderFactory.autoSelectModel();
  }

  if (model.apiKey) {
    return {
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.apiKey,
    };
  }

  const systemApiKey = getSystemProviderApiKey(model.provider);
  if (systemApiKey) {
    return {
      provider: model.provider,
      modelId: model.modelId,
      apiKey: systemApiKey,
    };
  }

  throw new Error(
    `Invalid model config: provider ${model.provider} requires a client API key or system backing`
  );
}

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
    // Priority order: private providers first, then the built-in providers below
    const providerOrder = [
      ...Object.keys(PRIVATE_PROVIDERS),
      "OpenAI",
      "Google",
      "Anthropic",
      "OpenRouter",
      "Groq",
      "Cerebras",
      PROVIDER_NEBIUS,
    ];

    // Find the first provider with an available API key
    for (const provider of providerOrder) {
      const apiKey = getSystemProviderApiKey(provider);
      if (apiKey) {
        // Get all auto-selectable models for this provider
        const autoSelectableModels = SYSTEM_MODELS.filter((model) => {
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
   * @returns The created LanguageModel instance
   * @throws Error if provider, modelId, or apiKey are missing, or if the provider is not supported
   */
  static createModel(
    provider: string,
    modelId: string,
    apiKey: string,
    verifyModelId: boolean = true
  ): LanguageModel {
    if (isMockMode) {
      console.log("🤖 Using MOCK LLM models (no API costs)");
      return mockModel;
    }

    if (!provider || !modelId || !apiKey) {
      throw new Error("Provider, modelId, and apiKey are required to create a model");
    }

    // Look up model in the flattened models array
    if (provider !== PROVIDER_GITHUB_COPILOT && verifyModelId) {
      const modelProps = MODELS.find((m) => m.provider === provider && m.modelId === modelId);
      if (!modelProps) {
        throw new Error(`Model ${modelId} is not supported for provider ${provider}`);
      }
    }

    // Get the creator function for this provider
    const providerDefinition = PROVIDERS[provider];
    if (!providerDefinition) {
      throw new Error(`Provider ${provider} is not supported`);
    }

    return providerDefinition.create(modelId, apiKey);
  }
}

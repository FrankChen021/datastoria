import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { createCerebras } from "@ai-sdk/cerebras";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { createGroq, type GroqLanguageModelOptions } from "@ai-sdk/groq";
import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import {
  createOpenAICompatible,
  type OpenAICompatibleLanguageModelChatOptions,
} from "@ai-sdk/openai-compatible";
import { createOpenRouter, type OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";
import { createGitHubCopilotOpenAICompatible } from "@opeoginni/github-copilot-openai-compatible";
import type { LanguageModel } from "ai";
import {
  DEFAULT_REASONING_LEVEL,
  getDefaultReasoningLevel,
  isReasoningLevel,
  type ReasoningLevel,
} from "../reasoning-levels";
import { ANTHROPIC_PROVIDER } from "./llm-provider-anthropic";
import { PRIVATE_MODELS, PRIVATE_PROVIDERS } from "./llm-provider-factory-private";
import { GOOGLE_PROVIDER } from "./llm-provider-google";
import { OPENAI_CODEX_PROVIDER } from "./llm-provider-openai-codex";
import { withVisibleReasoningLanguageInstruction } from "./llm-provider-openai-options";
import { mockModel } from "./models.mock";
import { PROVIDER_GITHUB_COPILOT, PROVIDER_NEBIUS, PROVIDER_OPENAI_CODEX } from "./provider-ids";

/**
 * Check if mock mode is enabled
 * Set USE_MOCK_LLM=true in your .env file to enable mock mode
 */
export const isMockMode = process.env.USE_MOCK_LLM === "true";

type ModelCreator = (modelId: string, apiKey: string) => LanguageModel;
type RequestedModelConfig = { provider: string; modelId: string; apiKey?: string };
type ResolvedModelConfig = { provider: string; modelId: string; apiKey: string };
export type ModelSource = "user" | "system";

type ProviderOptionsModelConfig = {
  provider: string;
  modelId: string;
  reasoningLevels?: readonly ReasoningLevel[];
};

type ProviderOptionsInput = {
  modelConfig: ProviderOptionsModelConfig;
  outputReasoning: boolean;
  reasoningLevel?: ReasoningLevel;
  instructions: string;
  responseLanguage?: string;
};

type ProviderOptionsRequestInput = Omit<ProviderOptionsInput, "reasoningLevel"> & {
  reasoningLevel?: unknown;
};

export type LanguageModelProviderOptions = {
  openai?: OpenAIResponsesProviderOptions;
  anthropic?: AnthropicProviderOptions;
  cerebras?: OpenAICompatibleLanguageModelChatOptions;
  google?: GoogleGenerativeAIProviderOptions;
  groq?: GroqLanguageModelOptions;
  nebius?: OpenAICompatibleLanguageModelChatOptions;
  openrouter?: OpenRouterProviderOptions;
};

export interface ProviderDefinition {
  create: ModelCreator;
  systemApiKey?: () => string | undefined;
  logo?: string;
  buildProviderOptions?: (input: ProviderOptionsInput) => LanguageModelProviderOptions | undefined;
}

export interface ModelProps {
  provider: string;
  modelId: string;
  description?: string;
  free?: boolean;
  autoSelectable?: boolean;
  disabled?: boolean;
  supportedEndpoints?: string[];
  supportsImageInput?: boolean;
  supportsTemperature?: boolean;
  supportsReasoning?: boolean;
  reasoningLevels?: readonly ReasoningLevel[];
  source?: ModelSource;
}

export function resolveModelSupportsImageInput(
  model?: Pick<ModelProps, "provider" | "modelId" | "supportsImageInput"> | null
): boolean {
  if (!model) {
    return true;
  }

  if (model.provider === "System" && model.modelId === "Auto") {
    return true;
  }

  if (typeof model.supportsImageInput === "boolean") {
    return model.supportsImageInput;
  }

  const exactMatch =
    SYSTEM_MODELS.find(
      (candidate) => candidate.provider === model.provider && candidate.modelId === model.modelId
    ) ??
    MODELS.find(
      (candidate) => candidate.provider === model.provider && candidate.modelId === model.modelId
    );
  if (typeof exactMatch?.supportsImageInput === "boolean") {
    return exactMatch.supportsImageInput;
  }

  const modelIdMatches = [...SYSTEM_MODELS, ...MODELS].filter(
    (candidate) =>
      candidate.modelId === model.modelId && typeof candidate.supportsImageInput === "boolean"
  );
  if (modelIdMatches.length === 0) {
    return false;
  }

  const distinctSupportStates = new Set(
    modelIdMatches.map((candidate) => candidate.supportsImageInput)
  );
  if (distinctSupportStates.size === 1) {
    return modelIdMatches[0].supportsImageInput === true;
  }

  return false;
}

function findExactModel(model: Pick<ModelProps, "provider" | "modelId">): ModelProps | undefined {
  return (
    SYSTEM_MODELS.find(
      (candidate) => candidate.provider === model.provider && candidate.modelId === model.modelId
    ) ??
    MODELS.find(
      (candidate) => candidate.provider === model.provider && candidate.modelId === model.modelId
    )
  );
}

export function resolveModelSupportsReasoning(
  model?: Pick<ModelProps, "provider" | "modelId" | "supportsReasoning" | "reasoningLevels"> | null
): boolean {
  if (!model) {
    return false;
  }

  if (typeof model.supportsReasoning === "boolean") {
    return model.supportsReasoning;
  }

  if (model.reasoningLevels && model.reasoningLevels.length > 0) {
    return true;
  }

  const exactMatch = findExactModel(model);
  if (typeof exactMatch?.supportsReasoning === "boolean") {
    return exactMatch.supportsReasoning;
  }

  return Boolean(exactMatch?.reasoningLevels?.length);
}

export function resolveModelReasoningLevels(
  model?: Pick<ModelProps, "provider" | "modelId" | "reasoningLevels"> | null
): readonly ReasoningLevel[] {
  if (!model) {
    return [];
  }

  if (model.reasoningLevels) {
    return model.reasoningLevels;
  }

  return findExactModel(model)?.reasoningLevels ?? [];
}

function resolveReasoningLevelForModel(
  modelConfig: ProviderOptionsModelConfig,
  reasoningLevel?: unknown
): ReasoningLevel | undefined {
  const levels = resolveModelReasoningLevels(modelConfig);
  if (levels.length === 0) {
    return undefined;
  }

  const requestedLevel = isReasoningLevel(reasoningLevel) ? reasoningLevel.trim() : undefined;
  if (requestedLevel && levels.includes(requestedLevel)) {
    return requestedLevel;
  }

  if (levels.includes(DEFAULT_REASONING_LEVEL)) {
    return DEFAULT_REASONING_LEVEL;
  }

  return getDefaultReasoningLevel(levels);
}

function toStandardReasoningLevel(level: ReasoningLevel): "low" | "medium" | "high" | undefined {
  if (level === "xhigh") return "high";
  if (level === "low" || level === "medium" || level === "high") return level;
  return undefined;
}

/**
 * Provider definitions map
 * Key: provider name (e.g., "OpenAI", "Google", "Anthropic", "OpenRouter", "Groq")
 * Value: model creator plus optional server-side environment variable name
 */
export const PROVIDERS: Record<string, ProviderDefinition> = {
  ...PRIVATE_PROVIDERS,
  OpenAI: {
    logo: "openai.svg",
    create: (modelId, apiKey) =>
      createOpenAI({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.OPENAI_API_KEY,
    buildProviderOptions: ({ instructions, outputReasoning, reasoningLevel, responseLanguage }) => {
      if (!outputReasoning && !reasoningLevel) {
        return undefined;
      }

      return {
        openai: {
          instructions: withVisibleReasoningLanguageInstruction(
            instructions,
            outputReasoning,
            responseLanguage
          ),
          ...(reasoningLevel ? { reasoningEffort: reasoningLevel } : {}),
          ...(outputReasoning ? { reasoningSummary: "auto" as const } : {}),
        } satisfies OpenAIResponsesProviderOptions,
      };
    },
  },
  Google: GOOGLE_PROVIDER,
  Anthropic: ANTHROPIC_PROVIDER,
  OpenRouter: {
    logo: "openrouter.svg",
    create: (modelId, apiKey) =>
      createOpenRouter({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.OPENROUTER_API_KEY,
    buildProviderOptions: ({ reasoningLevel }) => {
      if (!reasoningLevel) {
        return undefined;
      }

      const effort = toStandardReasoningLevel(reasoningLevel);
      if (!effort) {
        return undefined;
      }

      return {
        openrouter: {
          reasoning: {
            enabled: true,
            effort,
          },
        } satisfies OpenRouterProviderOptions,
      };
    },
  },
  Groq: {
    logo: "groq.svg",
    create: (modelId, apiKey) =>
      createGroq({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.GROQ_API_KEY,
    buildProviderOptions: ({ outputReasoning, reasoningLevel }) => {
      if (!reasoningLevel) {
        return undefined;
      }

      const reasoningEffort = toStandardReasoningLevel(reasoningLevel);
      if (!reasoningEffort) {
        return undefined;
      }

      return {
        groq: {
          reasoningEffort,
          ...(outputReasoning ? { reasoningFormat: "parsed" as const } : {}),
        } satisfies GroqLanguageModelOptions,
      };
    },
  },
  Cerebras: {
    logo: "cerebras.svg",
    create: (modelId, apiKey) =>
      createCerebras({
        apiKey,
      })(modelId),
    systemApiKey: () => process.env.CEREBRAS_API_KEY,
    buildProviderOptions: ({ reasoningLevel }) => {
      if (!reasoningLevel) {
        return undefined;
      }

      const reasoningEffort = toStandardReasoningLevel(reasoningLevel);
      if (!reasoningEffort) {
        return undefined;
      }

      return {
        cerebras: {
          reasoningEffort,
        } satisfies OpenAICompatibleLanguageModelChatOptions,
      };
    },
  },
  [PROVIDER_GITHUB_COPILOT]: {
    logo: "github-copilot.svg",
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
  [PROVIDER_OPENAI_CODEX]: OPENAI_CODEX_PROVIDER,
  [PROVIDER_NEBIUS]: {
    logo: "nebius.svg",
    create: (modelId, apiKey) =>
      createOpenAICompatible({
        name: "nebius",
        apiKey,
        baseURL: "https://api.tokenfactory.nebius.com/v1/",
      })(modelId),
    systemApiKey: () => process.env.NEBIUS_API_KEY,
    buildProviderOptions: ({ reasoningLevel }) => {
      if (!reasoningLevel) {
        return undefined;
      }

      const reasoningEffort = toStandardReasoningLevel(reasoningLevel);
      if (!reasoningEffort) {
        return undefined;
      }

      return {
        nebius: {
          reasoningEffort,
        } satisfies OpenAICompatibleLanguageModelChatOptions,
      };
    },
  },
};

export const MODELS: ModelProps[] = [
  ...PRIVATE_MODELS,

  // OpenAI models
  // https://platform.openai.com/chat/edit
  {
    provider: "OpenAI",
    modelId: "gpt-5.6-sol",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh", "max"],
    description: "OpenAI's latest frontier model for complex reasoning and coding.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.6-terra",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh", "max"],
    description: "Balanced GPT-5.6 model optimized for intelligence, latency, and cost.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.6-luna",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh", "max"],
    description: "Cost-sensitive GPT-5.6 model for high-volume workloads.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.5",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "A new class of intelligence for coding and professional work.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.5-pro",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "Version of GPT-5.5 that produces smarter and more precise responses.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.4",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "A more affordable model for coding and professional work.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.4-pro",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "Version of GPT-5.4 that produces smarter and more precise responses.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.4-mini",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "OpenAI's strongest mini model yet for coding, computer use, and subagents.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.4-nano",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "OpenAI's cheapest GPT-5.4-class model for simple high-volume tasks.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["minimal", "low", "medium", "high"],
    description: "Next-generation frontier model from OpenAI.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.2",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["none", "low", "medium", "high"],
    description: "Enhanced version of GPT-5 with improved reasoning capabilities.",
    source: "user",
  },
  {
    provider: "OpenAI",
    modelId: "gpt-4o",
    free: false,
    supportsImageInput: true,
    description: "Omni model from OpenAI, designed for speed and multimodal interaction.",
    source: "user",
  },

  // Google models
  // https://ai.google.dev/gemini-api/docs/models
  {
    provider: "Google",
    modelId: "gemini-3-pro-preview",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "high"],
    description: "Google's most capable model for complex tasks and multimodal inputs.",
    source: "user",
  },
  {
    provider: "Google",
    modelId: "gemini-3-flash-preview",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["minimal", "low", "medium", "high"],
    description: "Fast and efficient model from Google for rapid interactions.",
    source: "user",
  },
  {
    provider: "Google",
    modelId: "gemini-2.5-flash",
    free: false,
    supportsImageInput: true,
    description: "Google's flash model optimized for speed and large context windows.",
    source: "user",
  },
  {
    provider: "Google",
    modelId: "gemini-2.5-pro",
    free: false,
    supportsImageInput: true,
    description: "Google's pro model with high intelligence and broad knowledge.",
    source: "user",
  },
  {
    provider: "Google",
    modelId: "gemini-2.0-flash",
    free: false,
    supportsImageInput: true,
    description: "Legacy flash model from Google, efficient for simple tasks.",
    source: "user",
  },

  // Anthropic models
  // https://platform.claude.com/docs/en/about-claude/models/overview
  {
    provider: "Anthropic",
    modelId: "claude-fable-5",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description:
      "Anthropic's most capable generally available model for demanding reasoning and agentic work.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-opus-4-8",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description:
      "Anthropic's most capable generally available model for coding and enterprise work.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-opus-4-7",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "Anthropic's latest Opus model for complex analysis, agents, and coding.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-opus-4-6",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "Anthropic's most intelligent model for building agents and coding.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-opus-4-5",
    free: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high"],
    description: "Anthropic's most powerful model for highly complex analysis.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-sonnet-5",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "Anthropic's latest Sonnet model balancing speed and intelligence.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-sonnet-4-6",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    description: "Anthropic's most capable Sonnet model for agents, coding, and computer use.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-sonnet-4-5",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsReasoning: true,
    description: "Anthropic's best combination of speed and intelligence.",
    source: "user",
  },
  {
    provider: "Anthropic",
    modelId: "claude-haiku-4-5",
    free: false,
    supportsImageInput: true,
    supportsReasoning: true,
    description: "Anthropic's fastest model with near-frontier intelligence.",
    source: "user",
  },

  // OpenRouter models
  {
    provider: "OpenRouter",
    modelId: "x-ai/grok-code-fast-1",
    free: false,
    supportsImageInput: false,
    description: "Grok code model optimized for fast and accurate code generation.",
    source: "user",
  },
  {
    provider: "OpenRouter",
    modelId: "qwen/qwen3-coder:free",
    free: true,
    autoSelectable: true,
    supportsImageInput: false,
    description: "Qwen 3 coder model, highly capable at writing and explaining SQL.",
    source: "user",
  },
  {
    provider: "OpenRouter",
    modelId: "openai/gpt-oss-20b:free",
    free: true,
    autoSelectable: true,
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high"],
    description: "Open-source GPT model with large parameter count for general tasks.",
    source: "user",
  },
  {
    provider: "OpenRouter",
    modelId: "openai/gpt-oss-120b:free",
    free: true,
    autoSelectable: true,
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high"],
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
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high"],
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
    supportsImageInput: false,
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
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high"],
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
    supportsImageInput: false,
    supportsReasoning: true,
    description: "DeepSeek V3, powerful open-source model with strong reasoning.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "deepseek-ai/DeepSeek-R1-0528",
    free: false,
    autoSelectable: true,
    supportsImageInput: false,
    supportsReasoning: true,
    description: "DeepSeek R1, advanced reasoning model with chain-of-thought.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "Qwen/Qwen3-235B-A22B",
    free: false,
    autoSelectable: true,
    supportsImageInput: false,
    supportsReasoning: true,
    description: "Qwen 3 235B, largest Qwen model for complex tasks.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "Qwen/Qwen3-Next-80B-A3B-Thinking",
    free: false,
    autoSelectable: true,
    supportsImageInput: false,
    supportsReasoning: true,
    description: "Qwen3-Next-80B-A3B-Thinking, efficient reasoning model.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "zai-org/GLM-4.7-FP8",
    free: false,
    autoSelectable: true,
    supportsImageInput: true,
    supportsReasoning: true,
    description:
      "Flagship GLM model with strong multilingual reasoning, long context, and robust tool use.",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "moonshotai/Kimi-K2.5",
    free: false,
    autoSelectable: true,
    supportsImageInput: true,
    supportsReasoning: true,
    description: "Kimi-K2.5, 15 trillion mixed visual and text tokens atop Kimi-K2-Base",
    source: "user",
  },
  {
    provider: PROVIDER_NEBIUS,
    modelId: "openai/gpt-oss-120b",
    free: false,
    autoSelectable: true,
    supportsImageInput: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high"],
    description: "GPT-OSS 120B, open-source GPT model with strong general capabilities.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.6-sol",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh", "max"],
    supportedEndpoints: ["responses"],
    description: "Latest frontier model accessed with ChatGPT/Codex subscription authentication.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.6-terra",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh", "max"],
    supportedEndpoints: ["responses"],
    description: "Balanced GPT-5.6 model accessed with ChatGPT/Codex subscription authentication.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.6-luna",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh", "max"],
    supportedEndpoints: ["responses"],
    description:
      "Cost-sensitive GPT-5.6 model accessed with ChatGPT/Codex subscription authentication.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.5",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    supportedEndpoints: ["responses"],
    description: "Codex model accessed with ChatGPT/Codex subscription authentication.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.4",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    supportedEndpoints: ["responses"],
    description: "Codex model accessed with ChatGPT/Codex subscription authentication.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.4-mini",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    supportedEndpoints: ["responses"],
    description: "Lower-cost Codex model accessed with ChatGPT/Codex subscription authentication.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.3-codex",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    supportedEndpoints: ["responses"],
    description: "Codex model accessed with ChatGPT/Codex subscription authentication.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.3-codex-spark",
    free: false,
    autoSelectable: false,
    supportsImageInput: false,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    supportedEndpoints: ["responses"],
    description: "Text-only Codex model accessed with ChatGPT/Codex subscription authentication.",
    source: "user",
  },
  {
    provider: PROVIDER_OPENAI_CODEX,
    modelId: "gpt-5.2",
    free: false,
    autoSelectable: false,
    supportsImageInput: true,
    supportsTemperature: false,
    supportsReasoning: true,
    reasoningLevels: ["low", "medium", "high", "xhigh"],
    supportedEndpoints: ["responses"],
    description: "Codex model accessed with ChatGPT/Codex subscription authentication.",
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

const MODELS_WITHOUT_STRUCTURED_OUTPUTS = new Set<string>([`${PROVIDER_GITHUB_COPILOT}:gpt-4o`]);

export function getAvailableSystemModels(): ModelProps[] {
  return SYSTEM_MODELS.filter(
    (model) => getSystemProviderApiKey(model.provider) && model.autoSelectable !== true
  );
}

export function resolveModelConfig(
  model?: RequestedModelConfig,
  requirements?: { imageInput?: boolean }
): ResolvedModelConfig {
  if (!model?.provider || !model.modelId) {
    return LanguageModelProviderFactory.autoSelectModel(requirements);
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
  static getDefaultTemperature(modelId: string, provider?: string): number | undefined {
    const modelProps = MODELS.find(
      (model) => model.modelId === modelId && (!provider || model.provider === provider)
    );
    if (modelProps?.supportsTemperature === false) {
      return undefined;
    }

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
  static autoSelectModel(requirements?: { imageInput?: boolean }): {
    provider: string;
    modelId: string;
    apiKey: string;
  } {
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

          if (requirements?.imageInput && model.supportsImageInput !== true) {
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

  static supportsStructuredOutputs(provider: string, modelId: string): boolean {
    return !MODELS_WITHOUT_STRUCTURED_OUTPUTS.has(`${provider}:${modelId}`);
  }

  static supportsReasoning(provider: string, modelId: string): boolean {
    return resolveModelSupportsReasoning({ provider, modelId });
  }

  static getReasoningLevels(provider: string, modelId: string): readonly ReasoningLevel[] {
    return resolveModelReasoningLevels({ provider, modelId });
  }

  static buildProviderOptions(
    input: ProviderOptionsRequestInput
  ): LanguageModelProviderOptions | undefined {
    const providerDefinition = PROVIDERS[input.modelConfig.provider];
    if (!providerDefinition?.buildProviderOptions) {
      return undefined;
    }

    const reasoningLevel = resolveReasoningLevelForModel(input.modelConfig, input.reasoningLevel);

    return providerDefinition.buildProviderOptions({
      ...input,
      reasoningLevel,
    });
  }
}

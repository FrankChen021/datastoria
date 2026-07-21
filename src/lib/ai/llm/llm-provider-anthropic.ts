import { createAnthropic, type AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { ReasoningLevel } from "../reasoning-levels";
import type { ProviderDefinition } from "./llm-provider-factory";

const ANTHROPIC_MANUAL_THINKING_BUDGET_TOKENS = 1024;

function toAnthropicEffort(
  level: ReasoningLevel
): NonNullable<AnthropicProviderOptions["effort"]> | undefined {
  if (
    level === "low" ||
    level === "medium" ||
    level === "high" ||
    level === "xhigh" ||
    level === "max"
  ) {
    return level;
  }
  return undefined;
}

function supportsAnthropicAdaptiveThinking(modelId: string): boolean {
  return (
    modelId.includes("claude-fable-5") ||
    modelId.includes("claude-opus-4-8") ||
    modelId.includes("claude-opus-4-7") ||
    modelId.includes("claude-opus-4-6") ||
    modelId.includes("claude-sonnet-5") ||
    modelId.includes("claude-sonnet-4-6")
  );
}

function getAnthropicThinkingOptions(
  modelId: string,
  outputReasoning: boolean
): AnthropicProviderOptions["thinking"] | undefined {
  if (supportsAnthropicAdaptiveThinking(modelId)) {
    return { type: "adaptive" };
  }

  if (outputReasoning) {
    return {
      type: "enabled",
      budgetTokens: ANTHROPIC_MANUAL_THINKING_BUDGET_TOKENS,
    };
  }

  return undefined;
}

export const ANTHROPIC_PROVIDER = {
  logo: "anthropic.svg",
  create: (modelId, apiKey) =>
    createAnthropic({
      apiKey,
    })(modelId),
  systemApiKey: () => process.env.ANTHROPIC_API_KEY,
  buildProviderOptions: ({ modelConfig, outputReasoning, reasoningLevel }) => {
    if (reasoningLevel) {
      const effort = toAnthropicEffort(reasoningLevel);
      if (!effort) {
        return undefined;
      }
      const thinking = getAnthropicThinkingOptions(modelConfig.modelId, outputReasoning);

      return {
        anthropic: {
          ...(thinking ? { thinking } : {}),
          effort,
        } satisfies AnthropicProviderOptions,
      };
    }

    if (!outputReasoning) {
      return undefined;
    }

    return {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: ANTHROPIC_MANUAL_THINKING_BUDGET_TOKENS,
        },
      } satisfies AnthropicProviderOptions,
    };
  },
} satisfies ProviderDefinition;

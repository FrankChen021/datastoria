import { createGoogleGenerativeAI, type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { ReasoningLevel } from "../reasoning-levels";
import type { ProviderDefinition } from "./llm-provider-factory";

function toGoogleThinkingLevel(
  level: ReasoningLevel
):
  | NonNullable<NonNullable<GoogleGenerativeAIProviderOptions["thinkingConfig"]>["thinkingLevel"]>
  | undefined {
  if (level === "xhigh") return "high";
  if (level === "minimal" || level === "low" || level === "medium" || level === "high") {
    return level;
  }
  return undefined;
}

export const GOOGLE_PROVIDER = {
  logo: "google.svg",
  create: (modelId, apiKey) =>
    createGoogleGenerativeAI({
      apiKey,
    })(modelId),
  systemApiKey: () => process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  buildProviderOptions: ({ outputReasoning, reasoningLevel }) => {
    if (!reasoningLevel) {
      return undefined;
    }

    const thinkingLevel = toGoogleThinkingLevel(reasoningLevel);
    if (!thinkingLevel) {
      return undefined;
    }

    return {
      google: {
        thinkingConfig: {
          thinkingLevel,
          ...(outputReasoning ? { includeThoughts: true } : {}),
        },
      } satisfies GoogleGenerativeAIProviderOptions,
    };
  },
} satisfies ProviderDefinition;

import { InputMessages } from "@/lib/ai/agent/plan/planning-input";
import { PlannerPromptBuilder, uiMessageToText } from "@/lib/ai/agent/plan/planning-prompt-builder";
import type { PlanToolOutput } from "@/lib/ai/agent/plan/planning-types";
import {
  SUB_AGENTS,
  type InputModel,
  type Intent,
  type SubAgent,
} from "@/lib/ai/agent/plan/sub-agent-registry";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";
import type { SseStreamer } from "@/lib/sse-streamer";
import { generateText, Output, type LanguageModelUsage, type UIMessage } from "ai";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

export { InputMessages } from "@/lib/ai/agent/plan/planning-input";
export { type PlanToolOutput as PlanToolResult } from "@/lib/ai/agent/plan/planning-types";

/**
 * Intent classification schema
 */
const PlannerOutputSchema = z.object({
  intent: z.enum(Object.keys(SUB_AGENTS) as [string, ...string[]]),
  reasoning: z.string().describe("Brief reasoning for the chosen intent"),
  title: z
    .string()
    .optional()
    .describe("A concise, short summary title for the session (only for the first user message)"),
});

export type PlanResult = PlanToolOutput & {
  agent: SubAgent;
};

/**
 * Planning agent: classifies user intent and selects the appropriate sub-agent.
 * Uses continuation detection, keyword/heuristic rules, and LLM classification.
 */
export class PlanningAgent {
  /**
   * Plan layer: extracts previous intent (before if-else), then either continues with
   * that intent or runs the plan agent (LLM) and returns the selected agent and message ID.
   * Uses only UI messages; converts to model messages internally when calling the plan agent.
   *
   * @param streamer - SSE streamer for tool events
   * @param messages - UI messages from the request
   * @param modelConfig - Model configuration for LLM classification
   */
  static async plan(
    streamer: SseStreamer,
    messages: UIMessage[],
    modelConfig: InputModel
  ): Promise<PlanResult & { messageId: string }> {
    const input = new InputMessages(messages);

    streamer.streamObject({ type: "start", messageId: input.messageId });

    if (input.isContinuation) {
      const agent = SUB_AGENTS[input.previousIntent ?? "general"] ?? SUB_AGENTS.general;
      const intent = input.previousIntent ?? "general";
      return {
        intent,
        title: undefined,
        usage: undefined,
        reasoning: undefined,
        agent,
        messageId: input.messageId,
      };
    }

    if (!input.lastUser) {
      const defaultResult: PlanResult = {
        intent: "general",
        reasoning: "No user message found",
        agent: SUB_AGENTS.general,
        usage: undefined,
        title: undefined,
      };
      return { ...defaultResult, messageId: input.messageId };
    }

    // For all kinds of planning, sends a toolcall to the client so it can renders this planning as a step
    const toolCallId = `router-${uuidv7().replace(/-/g, "")}`;
    streamer.streamObject({
      type: "tool-input-available",
      toolCallId,
      toolName: SERVER_TOOL_NAMES.PLAN,
      input: {},
      dynamic: true,
    });

    const result = await this.doPlan(input, toolCallId, modelConfig);

    streamer.streamObject({
      type: "tool-output-available",
      toolCallId,
      output: {
        intent: result.intent,
        title: result.title ?? undefined,
        usage: result.usage ?? undefined,
        reasoning: result.reasoning ?? undefined,
      } as PlanToolOutput,
      dynamic: true,
    });

    return {
      ...result,
      messageId: input.messageId,
    };
  }

  private static async doPlan(
    input: InputMessages,
    messageId: string,
    modelConfig: InputModel
  ): Promise<PlanResult> {
    const keywordResult = classifyByKeyword(input);
    if (keywordResult) return keywordResult;

    const heuristicResult = classifyByHeuristics(input);
    if (heuristicResult) return heuristicResult;

    return classifyByLLM(input, modelConfig);
  }
}

/**
 * Classify intent by agent keyword prefix/match. Returns a PlanResult if matched, else null.
 */
function classifyByKeyword(input: InputMessages): PlanResult | null {
  const lastUser = input.lastUser;
  if (!lastUser) return null;

  const content = uiMessageToText(lastUser);

  for (const agent of Object.values(SUB_AGENTS)) {
    if (content.startsWith(`${agent.keyword} `) || content === agent.keyword) {
      return {
        intent: agent.id as Intent,
        reasoning: "Keyword override",
        agent,
        usage: undefined,
        title: input.isFirstUserMessage
          ? generateTitleFromUIMessage(input.getFirstMessage())
          : undefined,
      };
    }
  }

  return null;
}

/**
 * Classify intent by agent heuristics (e.g. regex). Returns a PlanResult if matched, else null.
 */
function classifyByHeuristics(input: InputMessages): PlanResult | null {
  const lastUser = input.lastUser;
  if (!lastUser) return null;

  const content = uiMessageToText(lastUser);

  for (const agent of Object.values(SUB_AGENTS)) {
    if (agent.heuristics && agent.heuristics.test(content)) {
      return {
        intent: agent.id as Intent,
        reasoning: `${agent.id} heuristics detected`,
        agent,
        usage: undefined,
        title: input.isFirstUserMessage
          ? generateTitleFromUIMessage(input.getFirstMessage())
          : undefined,
      };
    }
  }

  return null;
}

//
// LLM Classification
//
async function classifyByLLM(input: InputMessages, modelConfig: InputModel): Promise<PlanResult> {
  const lastUser = input.lastUser;
  if (!lastUser) {
    return {
      intent: "general",
      reasoning: "No user message",
      agent: SUB_AGENTS.general,
      usage: undefined,
      title: undefined,
    };
  }

  const model = LanguageModelProviderFactory.createModel(
    modelConfig.provider,
    modelConfig.modelId,
    modelConfig.apiKey
  );

  const plannerPrompt = new PlannerPromptBuilder()
    .titleRequired(input.isFirstUserMessage)
    .conversations(input.messages)
    .lastIntent(input.previousIntent)
    .build();

  try {
    const { output: llmOutput, usage } = await generateText({
      model,
      output: Output.object({
        schema: PlannerOutputSchema,
      }),
      prompt: plannerPrompt,
    });

    if (!llmOutput) {
      throw new Error("No output generated from generateText");
    }

    if (input.isFirstUserMessage) {
      if (!llmOutput.title || llmOutput.title.trim() === "") {
        llmOutput.title = generateTitleFromUIMessage(lastUser);
      }
    }

    return {
      intent: llmOutput.intent as Intent,
      reasoning: llmOutput.reasoning,
      title: llmOutput.title,
      agent: SUB_AGENTS[llmOutput.intent as Intent] ?? SUB_AGENTS.general,
      usage: usage,
    };
  } catch {
    return {
      intent: "general",
      reasoning: "Classification failed",
      agent: SUB_AGENTS.general,
      usage: undefined,
      title: undefined,
    };
  }
}

/**
 * Extract title from UI message text: first 10 tokens, maximum 64 characters
 */
function generateTitleFromUIMessage(message: UIMessage): string | undefined {
  const content = uiMessageToText(message).toLowerCase();
  if (content.length === 0) return undefined;

  const tokens = content.split(/\s+/).filter((t) => t.length > 0);
  const titleTokens = tokens.slice(0, 10);
  let title = titleTokens.join(" ");

  if (title.length > 64) {
    title = title.slice(0, 64).trim();
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > 0 && lastSpace > 32) {
      title = title.slice(0, lastSpace);
    }
  }

  return title || undefined;
}

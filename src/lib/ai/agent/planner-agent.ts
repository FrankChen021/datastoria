import type { DatabaseContext } from "@/components/chat/chat-context";
import type { ServerDatabaseContext, TokenUsage } from "@/lib/ai/common-types";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";
import { createGeneralAgent } from "./general-agent";
import { streamSqlGeneration } from "./sql-generation-agent";
import { streamSqlOptimization } from "./sql-optimization-agent";
import { streamVisualization } from "./visualization-agent";

/**
 * A FAKE server tool used to show progress at client as soon as possible and track identified intent
 */
export const SERVER_TOOL_PLAN = "plan" as const;

/**
 * Model configuration for sub-agents and orchestrator
 */
export interface InputModel {
  provider: string;
  modelId: string;
  apiKey: string;
}

/**
 * Sub-Agent Registry Item
 */
export interface SubAgent {
  id: string;
  description: string;
  keyword: string;
  stream: (args: {
    messages: ModelMessage[];
    modelConfig: InputModel;
    context?: ServerDatabaseContext;
  }) => Promise<any>;
  heuristics?: RegExp;
}

/**
 * Centralized registry for all expert sub-agents.
 * Each entry defines how the dispatcher should identify and call an expert.
 */
export const SUB_AGENTS: Record<string, SubAgent> = {
  generator: {
    id: "generator",
    description:
      "Use this for requests that explicitly ask to 'write SQL', 'generate query', or 'show example SQL'.",
    keyword: "@generator",
    stream: streamSqlGeneration,
  },
  optimizer: {
    id: "optimizer",
    description:
      "Use this for analyzing slow queries, explaining SQL errors, or tuning performance. Key signals: 'slow', 'optimize', 'performance'.",
    keyword: "@optimizer",
    stream: streamSqlOptimization,
  },
  visualizer: {
    id: "visualizer",
    description:
      "Use this for ANY request to create charts, graphs, or visual representations (pie, bar, line, etc.). If the user says 'visualize', 'plot', or mentions a chart type, ALWAYS use this.",
    keyword: "@visualizer",
    stream: streamVisualization as any,
    heuristics: /\b(visualize|chart|graph|plot|pie|bar|line|histogram|scatter)\b/i,
  },
  general: {
    id: "general",
    description:
      "Use this for greetings, questions about Clickhouse concepts (MergeTree, etc.), and ANY request to 'show', 'list', 'get', 'calculate', or 'find' ACTUAL data/metadata. NOTE: If they ask to VISUALIZE that data, you MUST use 'visualizer' instead.",
    keyword: "@general",
    stream: createGeneralAgent as any,
  },
};

/**
 * Intent classification schema
 */
const IntentSchema = z.object({
  intent: z.enum(Object.keys(SUB_AGENTS) as [string, ...string[]]),
  reasoning: z.string().describe("Brief reasoning for the chosen intent"),
  title: z
    .string()
    .optional()
    .describe("A concise, short summary title for the session (only for the first user message)"),
});

export type Intent = "generator" | "optimizer" | "visualizer" | "general";

export type PlanResult = {
  intent: Intent;
  reasoning: string;
  title?: string;
  agent: SubAgent;
  usage?: TokenUsage;
};

/**
 * Summarizes and prunes message history for the intent router to save tokens and reduce noise.
 */
function summarizeMessages(messages: ModelMessage[]): string {
  // Keep only the last 6 messages for routing context
  const recentMessages = messages.slice(-6);

  return recentMessages
    .map((m) => {
      let contentString = "";

      if (typeof m.content === "string") {
        contentString = m.content;
      } else if (Array.isArray(m.content)) {
        contentString = m.content
          .filter((part) => part.type === "text")
          .map((part: any) => part.text)
          .join(" ");
      }

      // 1. Extract Execution Trace (High Value)
      const traceMatch = contentString.match(/### Execution Trace:[\s\S]*?(?=\n\n|$)/);
      const trace = traceMatch ? traceMatch[0].trim() : "";

      // 2. Strip Noise: Remove SQL blocks, tool response markers, and excessive JSON
      let prunedContent = contentString
        .replace(/```sql[\s\S]*?```/g, "[SQL Query]")
        .replace(/```json[\s\S]*?```/g, "[JSON Data]")
        .replace(/Tool call: [\s\S]*?(?=\n\n|$)/g, "[Tool Call Details]")
        .replace(/### Execution Trace:[\s\S]*?(?=\n\n|$)/g, "");

      // 3. Truncate long text
      if (prunedContent.length > 500) {
        prunedContent = prunedContent.substring(0, 500) + "... [TRUNCATED]";
      }

      const finalContent = [prunedContent.trim(), trace].filter(Boolean).join("\n");
      return `${m.role.toUpperCase()}: ${finalContent || "[Empty Message]"}`;
    })
    .join("\n---\n");
}

/**
 * Identifies the user's intent and selects the appropriate expert sub-agent.
 * Uses a tiered approach: Keywords -> Heuristics -> History Stickiness -> LLM Classification.
 *
 * @returns {PlanResult} - Contains the chosen intent, reasoning, agent metadata, and LLM usage.
 */
export async function callPlanAgent(
  messages: ModelMessage[],
  modelConfig: InputModel
): Promise<PlanResult> {
  // Target the latest user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  // 0. Tool Result Continuation: If the last message is a tool result,
  // we MUST continue with the agent that initiated the call.
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "tool") {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // 1. Try to find agentName in simulated tool results
      if (msg.role === "tool") {
        const toolMessages = Array.isArray(msg.content) ? msg.content : [msg];
        for (const toolMsg of toolMessages) {
          if ((toolMsg as any).toolName === SERVER_TOOL_PLAN) {
            const result = (toolMsg as any).result || (toolMsg as any).content;
            if (result?.agentName) {
              const lastAgentId = result.agentName.toLowerCase();
              const agent =
                Object.values(SUB_AGENTS).find((a) => lastAgentId.includes(a.id)) ||
                SUB_AGENTS.general;
              return {
                intent: agent.id as Intent,
                reasoning: "Resuming agent from plan tool result",
                agent,
                usage: undefined,
                title: undefined,
              };
            }
          }
        }
      }

      // 2. Try to find agentName in providerMetadata (Preferred)
      if (msg.role === "assistant") {
        const metadata = (msg as any).providerMetadata?.orchestrator;
        if (metadata?.agentName) {
          const lastAgentId = metadata.agentName.toLowerCase();
          const agent =
            Object.values(SUB_AGENTS).find((a) => lastAgentId.includes(a.id)) || SUB_AGENTS.general;
          return {
            intent: agent.id as Intent,
            reasoning: "Resuming agent from provider metadata",
            agent,
            usage: undefined,
            title: undefined,
          };
        }

        // 3. Fallback to regex matching in text content (Backward Compatibility)
        if (typeof msg.content === "string") {
          const traceMatch = msg.content.match(/### Execution Trace:\s*agentName:\s*([\w-]+)/);
          if (traceMatch) {
            const lastAgentId = traceMatch[1].toLowerCase();
            const agent =
              Object.values(SUB_AGENTS).find((a) => lastAgentId.includes(a.id)) ||
              SUB_AGENTS.general;
            return {
              intent: agent.id as Intent,
              reasoning: "Resuming agent from execution trace in content",
              agent,
              usage: undefined,
              title: undefined,
            };
          }
        }
      }
    }
  }

  if (!lastUserMessage) {
    return {
      intent: "general",
      reasoning: "No user message found",
      agent: SUB_AGENTS.general,
      usage: undefined,
      title: undefined,
    };
  }

  let content = "";
  if (typeof lastUserMessage.content === "string") {
    content = lastUserMessage.content.toLowerCase();
  } else if (Array.isArray(lastUserMessage.content)) {
    content = lastUserMessage.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join(" ")
      .toLowerCase();
  }

  // 1. Keyword Overrides
  for (const agent of Object.values(SUB_AGENTS)) {
    if (content.startsWith(`${agent.keyword} `) || content === agent.keyword) {
      return {
        intent: agent.id as Intent,
        reasoning: "Keyword override",
        agent,
        usage: undefined,
        title: undefined,
      };
    }
  }

  // 1.5 Generic Heuristics (e.g., Visualization)
  for (const agent of Object.values(SUB_AGENTS)) {
    if (agent.heuristics && agent.heuristics.test(content)) {
      return {
        intent: agent.id as Intent,
        reasoning: `${agent.id} heuristics detected`,
        agent,
        usage: undefined,
        title: undefined,
      };
    }
  }

  const isFirstMessage = messages.filter((m) => m.role === "user").length <= 1;

  const agentDescriptions = Object.values(SUB_AGENTS)
    .map((agent) => `- '${agent.id}': ${agent.description}`)
    .join("\n");

  const routerPrompt = `You are a ClickHouse Intent Router.
Analyze the user's latest message and the conversation history to determine the best expert sub-agent.

Expert Agents:
${agentDescriptions}

${
  isFirstMessage
    ? "IMPORTANT: This is the first message in the conversation. You MUST provide a 'title' field with a concise, short (2-5 words) summary title for this session based on the user's message content. The title should capture the main topic or goal of the conversation."
    : ""
}

Respond with the appropriate intent and reasoning${
    isFirstMessage ? " (and REQUIRED title)" : ""
  } in JSON format:
{
  "intent": "${Object.keys(SUB_AGENTS).join('" | "')}",
  "reasoning": "Brief reasoning"${isFirstMessage ? ',\n  "title": "Concise session title (REQUIRED for first message)"' : ""}
}
`;

  const [model] = LanguageModelProviderFactory.createModel(
    modelConfig.provider,
    modelConfig.modelId,
    modelConfig.apiKey
  );

  try {
    const { output, usage: llmUsage } = await generateText({
      model,
      output: Output.object({
        schema: IntentSchema,
      }),
      prompt: `${routerPrompt}\n\nCONVERSATION HISTORY (Pruned):\n${summarizeMessages(messages)}`,
    });

    // Convert LanguageModelUsage to TokenUsage
    const usage: TokenUsage | undefined = llmUsage
      ? {
          inputTokens: llmUsage.inputTokens || 0,
          outputTokens: llmUsage.outputTokens || 0,
          totalTokens: llmUsage.totalTokens || 0,
          reasoningTokens:
            llmUsage.reasoningTokens || llmUsage.outputTokenDetails?.reasoningTokens || 0,
          cachedInputTokens:
            llmUsage.cachedInputTokens || llmUsage.inputTokenDetails?.cacheReadTokens || 0,
        }
      : undefined;

    if (!output) {
      throw new Error("No output generated from generateText");
    }

    // Validate and log title for first messages
    if (isFirstMessage) {
      if (!output.title || output.title.trim() === "") {
        // Generate a fallback title from the user message
        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
        if (lastUserMessage) {
          let userContent = "";
          if (typeof lastUserMessage.content === "string") {
            userContent = lastUserMessage.content;
          } else if (Array.isArray(lastUserMessage.content)) {
            userContent = lastUserMessage.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join(" ");
          }
          // Extract first few words as fallback title
          const words = userContent.trim().split(/\s+/).slice(0, 5);
          output.title = words.join(" ") || "New Conversation";
        }
      }
    }

    return {
      ...(output as any),
      agent: SUB_AGENTS[output.intent] || SUB_AGENTS.general,
      usage,
    } as PlanResult;
  } catch (error) {
    console.error("Intent identification failed, defaulting to general:", error);
    return {
      intent: "general",
      reasoning: "Classification failed",
      agent: SUB_AGENTS.general,
      usage: undefined,
      title: undefined,
    };
  }
}

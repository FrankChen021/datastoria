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

/** Tool result shape for the plan tool: type 'tool-result', toolName 'plan', output is JSON-wrapped PlanResult */
type PlanToolResult = {
  type?: string;
  toolCallId?: string;
  toolName?: string;
  output?: { type: "json"; value: PlanResult };
};

export type IntentMetadata = {
  intent: Intent;
};

/** Assistant message metadata from chat route: intent (agent id) is attached via messageMetadata */
type AssistantMessageWithIntent = ModelMessage & {
  providerMetadata?: { intent?: IntentMetadata };
};

/**
 * Builder class for constructing planner prompts in a maintainable way.
 */
class PromptBuilder {
  /**
   * Pre-computed agent descriptions for prompt building.
   */
  private static readonly AGENT_DESCRIPTIONS = Object.values(SUB_AGENTS)
    .map((agent) => `- '${agent.id}': ${agent.description}`)
    .join("\n");

  /**
   * Pre-computed intent options for prompt building.
   */
  private static readonly INTENT_OPTIONS = Object.values(SUB_AGENTS)
    .map((agent) => agent.id)
    .join('" | "');

  private _isTitleRequired = false;
  private conversationMessages: ModelMessage[] | undefined;

  /**
   * Mark that a title is required for this prompt.
   */
  isTitleRequired(required: boolean = true): this {
    this._isTitleRequired = required;
    return this;
  }

  /**
   * Append pruned conversation history to the prompt.
   */
  conversations(messages: ModelMessage[] | undefined): this {
    this.conversationMessages = messages;
    return this;
  }

  /**
   * Build the final prompt string.
   */
  build(): string {
    const templateWithTitle = `You are a ClickHouse Intent Planner.
Analyze the user's latest message and the conversation history to determine the best expert sub-agent.

Expert Agents:
{{AGENT_SECTION}}

If "Last chosen intent" is shown below, prefer it when the user's message is a follow-up (e.g. refinement, time range change) unless they clearly ask for something different.

IMPORTANT: This is the first message in the conversation. You MUST provide a 'title' field with a concise, short (2-5 words) summary title for this session based on the user's message content. The title should capture the main topic or goal of the conversation.

Respond with the appropriate intent and reasoning (and REQUIRED title) in JSON format:
{
  "title": "Concise session title (REQUIRED for first message)",
  "intent": "{{INTENT_OPTIONS}}",
  "reasoning": "Brief reasoning"
}`;

    const templateWithoutTitle = `You are a ClickHouse Intent Planner.
Analyze the user's latest message and the conversation history to determine the best expert sub-agent.

Expert Agents:
{{AGENT_SECTION}}

If "Last chosen intent" is shown below, prefer it when the user's message is a follow-up (e.g. refinement, time range change) unless they clearly ask for something different.

Respond with the appropriate intent and reasoning in JSON format:
{
  "intent": "{{INTENT_OPTIONS}}",
  "reasoning": "Brief reasoning"
}`;

    const template = this._isTitleRequired ? templateWithTitle : templateWithoutTitle;
    let prompt = template
      .replace("{{AGENT_SECTION}}", PromptBuilder.AGENT_DESCRIPTIONS)
      .replace("{{INTENT_OPTIONS}}", PromptBuilder.INTENT_OPTIONS);

    if (this.conversationMessages === undefined) {
      return prompt;
    }

    prompt = `${prompt}\n\nCONVERSATION HISTORY (Pruned):\n${this.collectMessage(this.conversationMessages)}`;

    const lastIntent = getLastChosenIntent(this.conversationMessages);
    if (lastIntent !== undefined) {
      prompt = `${prompt}\n\nLast chosen intent (for follow-up consistency): ${lastIntent}`;
    }

    return prompt;
  }

  /**
   * Summarizes and prunes message history for the intent router to save tokens and reduce noise.
   * Iterates from the end, skips tool messages, and keeps up to N user/assistant messages in chronological order.
   */
  private static readonly MAX_SUMMARY_MESSAGES = 6;

  private collectMessage(messages: ModelMessage[]): string {
    const collected: string[] = [];
    for (
      let i = messages.length - 1;
      i >= 0 && collected.length < PromptBuilder.MAX_SUMMARY_MESSAGES;
      i--
    ) {
      const line = this.collectOneMessage(messages[i]);
      if (line !== null) {
        collected.push(line);
      }
    }
    return collected.reverse().join("\n---\n");
  }

  /**
   * Prunes and formats a single message for the history summary.
   * Returns null for tool messages or when the message has no content (caller omits from summary).
   * Only assistant messages are pruned (code blocks, truncation); user content is kept as-is.
   */
  private collectOneMessage(m: ModelMessage): string | null {
    if (m.role === "tool") {
      return null;
    }

    const text = messageToText(m);
    if (!text.trim()) {
      return null;
    }

    let finalContent: string;
    if (m.role === "assistant") {
      finalContent = this.pruneAssistantContent(text);
    } else {
      finalContent = text.trim();
    }

    if (!finalContent) {
      return null;
    }
    return `${m.role.toUpperCase()}: ${finalContent}`;
  }

  /**
   * Prunes assistant message: replaces code blocks with placeholders, keeps Execution Trace, truncates.
   */
  private pruneAssistantContent(content: string): string {
    const prunedContent = content
      .replace(/```sql[\s\S]*?```/g, "[Generated SQL]")
      .replace(/```json[\s\S]*?```/g, "[Generated JSON]");

    return prunedContent.length > 500
      ? prunedContent.substring(0, 500) + "... [TRUNCATED]"
      : prunedContent.trim();
  }
}

function getPlanOutput(t: PlanToolResult): PlanResult | undefined {
  const out = t.output;
  if (out?.type === "json" && out.value) return out.value;
  return undefined;
}

function intentFromKey(key: string): Intent | undefined {
  const k = key.toLowerCase();
  if (k in SUB_AGENTS) return k as Intent;
  return undefined;
}

/**
 * Returns the intent chosen for the previous turn (before the current user message).
 * Tries plan tool result first, then assistant message metadata (intent attached by chat route).
 */
function getLastChosenIntent(messages: ModelMessage[]): Intent | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    console.log("getLastChosenIntent", msg);

    if (msg.role === "tool") {
      const toolMessages = Array.isArray(msg.content) ? msg.content : [msg];
      for (const toolMsg of toolMessages) {
        const t = toolMsg as PlanToolResult;
        if (t.toolName !== SERVER_TOOL_PLAN) continue;
        const plan = getPlanOutput(t);
        if (plan?.intent) {
          const key = intentFromKey(plan.intent);
          if (key) return key;
        }
      }
    }

    if (msg.role === "assistant") {
      const m = msg as AssistantMessageWithIntent;
      const meta = m.providerMetadata?.intent;
      const raw = meta?.intent;
      if (typeof raw === "string") {
        const key = intentFromKey(raw);
        if (key) return key;
      }
    }
  }
  return undefined;
}

/**
 * Extracts plain text from a model message (string or array of text parts).
 */
function messageToText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join(" ");
  }
  return "";
}

/**
 * Extract title from message text: first 10 tokens, maximum 64 characters
 */
function generateTitleFromMessage(message: ModelMessage): string | undefined {
  const content = messageToText(message).toLowerCase();

  if (content.length === 0) return undefined;

  // Split into tokens (words) and take first 10
  const tokens = content.split(/\s+/).filter((t) => t.length > 0);
  const titleTokens = tokens.slice(0, 10);
  let title = titleTokens.join(" ");

  // Limit to 64 characters
  if (title.length > 64) {
    title = title.slice(0, 64).trim();
    // Don't cut in the middle of a word if possible
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > 0 && lastSpace > 32) {
      title = title.slice(0, lastSpace);
    }
  }

  return title || undefined;
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
  // For first message, we need to generate a title
  const isFirstUserMessage = messages.filter((m) => m.role === "user").length <= 1;

  // 0. Tool Result Continuation: If the last message is a tool result,
  // we MUST continue with the agent that initiated the call.
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "tool") {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // 1. Try to find intent from plan tool result (output: PlanResult or { type, value })
      if (msg.role === "tool") {
        const toolMessages = Array.isArray(msg.content) ? msg.content : [msg];
        for (const toolMsg of toolMessages) {
          const t = toolMsg as PlanToolResult;
          if (t.toolName !== SERVER_TOOL_PLAN) continue;
          const plan = getPlanOutput(t);
          if (plan?.intent) {
            const key = intentFromKey(plan.intent);
            if (key) {
              const agent = SUB_AGENTS[key];
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

      // 2. Try to find intent from assistant message metadata (intent attached by chat route)
      if (msg.role === "assistant") {
        const m = msg as AssistantMessageWithIntent;
        const meta = m.providerMetadata?.intent;
        const raw = meta?.intent ?? meta?.agentName;
        if (typeof raw === "string") {
          const key = intentFromKey(raw);
          if (key) {
            const agent = SUB_AGENTS[key];
            return {
              intent: agent.id as Intent,
              reasoning: "Resuming agent from assistant metadata",
              agent,
              usage: undefined,
              title: undefined,
            };
          }
        }
      }
    }
  }

  // Target the latest user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) {
    // No user message found, this should be error
    return {
      intent: "general",
      reasoning: "No user message found",
      agent: SUB_AGENTS.general,
      usage: undefined,
      title: undefined,
    };
  }

  const content = messageToText(lastUserMessage).toLowerCase();

  // 1. Keyword Overrides
  for (const agent of Object.values(SUB_AGENTS)) {
    if (content.startsWith(`${agent.keyword} `) || content === agent.keyword) {
      return {
        intent: agent.id as Intent,
        reasoning: "Keyword override",
        agent,
        usage: undefined,

        // TODO: if the first message is the last message, we should trim the keyword for title generation
        title: isFirstUserMessage ? generateTitleFromMessage(messages[0]) : undefined,
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
        title: isFirstUserMessage ? generateTitleFromMessage(messages[0]) : undefined,
      };
    }
  }

  const [model] = LanguageModelProviderFactory.createModel(
    modelConfig.provider,
    modelConfig.modelId,
    modelConfig.apiKey
  );

  const plannerPrompt = new PromptBuilder()
    .isTitleRequired(isFirstUserMessage)
    .conversations(messages)
    .build();

  console.log("plannerPrompt", plannerPrompt);
  try {
    const { output, usage } = await generateText({
      model,
      output: Output.object({
        schema: IntentSchema,
      }),
      prompt: plannerPrompt,
    });

    // Convert LanguageModelUsage to TokenUsage
    const plannerTokenUsage: TokenUsage | undefined = usage
      ? {
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          totalTokens: usage.totalTokens || 0,
          reasoningTokens: usage.reasoningTokens || usage.outputTokenDetails?.reasoningTokens || 0,
          cachedInputTokens:
            usage.cachedInputTokens || usage.inputTokenDetails?.cacheReadTokens || 0,
        }
      : undefined;

    if (!output) {
      throw new Error("No output generated from generateText");
    }

    // Validate and log title for first messages
    if (isFirstUserMessage) {
      if (!output.title || output.title.trim() === "") {
        // Generate a fallback title from the user message
        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
        if (lastUserMessage) {
          const userContent = messageToText(lastUserMessage);
          // Extract first few words as fallback title
          const words = userContent.trim().split(/\s+/).slice(0, 5);
          output.title = words.join(" ") || "New Conversation";
        }
      }
    }

    return {
      ...(output as any),
      agent: SUB_AGENTS[output.intent] || SUB_AGENTS.general,
      usage: plannerTokenUsage,
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

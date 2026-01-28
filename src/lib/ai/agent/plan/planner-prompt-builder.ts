import { AGENT_ID_LIST, AGENT_LIST, type Intent } from "@/lib/ai/agent/plan/agent-registry";
import type { UIMessage } from "ai";

/**
 * Extracts plain text from a UI message (parts with type "text").
 */
export function uiMessageToText(message: UIMessage): string {
  if (!Array.isArray(message.parts)) {
    return "";
  }
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

/**
 * Builder class for constructing planner prompts in a maintainable way.
 */
export class PlannerPromptBuilder {
  private static readonly MAX_SUMMARY_MESSAGES = 6;

  private isTitleRequired = false;
  private conversationMessages: UIMessage[] | undefined;
  private _lastIntent: Intent | undefined;

  /**
   * Mark that a title is required for this prompt.
   */
  titleRequired(required: boolean = true): this {
    this.isTitleRequired = required;
    return this;
  }

  /**
   * Append pruned conversation history to the prompt.
   */
  conversations(messages: UIMessage[] | undefined): this {
    this.conversationMessages = messages;
    return this;
  }

  /**
   * Set the last chosen intent (from plan layer) for follow-up consistency in the prompt.
   */
  lastIntent(intent: Intent | undefined): this {
    this._lastIntent = intent;
    return this;
  }

  /**
   * Build the final prompt string.
   */
  build(): string {
    const templateWithTitle = `You are a ClickHouse Intent Planner.
Analyze the user's latest message and the conversation history to determine the best expert sub-agent.

Expert Agents:
{{AGENT_LIST}}

If "Last chosen intent" is shown below, prefer it when the user's message is a follow-up (e.g. refinement, time range change) unless they clearly ask for something different.

IMPORTANT: This is the first message in the conversation. You MUST provide a 'title' field with a concise, short (2-5 words) summary title for this session based on the user's message content. The title should capture the main topic or goal of the conversation.

Respond with the appropriate intent and reasoning (and REQUIRED title) in JSON format:
{
  "title": "Concise session title (REQUIRED for first message)",
  "intent": "{{AGENT_ID_LIST}}",
  "reasoning": "Brief reasoning"
}`;

    const templateWithoutTitle = `You are a ClickHouse Intent Planner.
Analyze the user's latest message and the conversation history to determine the best expert sub-agent.

Expert Agents:
{{AGENT_LIST}}

If "Last chosen intent" is shown below, prefer it when the user's message is a follow-up (e.g. refinement, time range change) unless they clearly ask for something different.

Respond with the appropriate intent and reasoning in JSON format:
{
  "intent": "{{AGENT_ID_LIST}}",
  "reasoning": "Brief reasoning"
}`;

    const template = this.isTitleRequired ? templateWithTitle : templateWithoutTitle;
    let prompt = template
      .replace("{{AGENT_LIST}}", AGENT_LIST)
      .replace("{{AGENT_ID_LIST}}", AGENT_ID_LIST);

    if (this.conversationMessages === undefined) {
      return prompt;
    }

    prompt = `${prompt}\n\nCONVERSATION HISTORY (Pruned):\n${this.collectMessage(this.conversationMessages)}`;

    if (this._lastIntent !== undefined) {
      prompt = `${prompt}\n\nLast chosen intent (for follow-up consistency): ${this._lastIntent}`;
    }

    return prompt;
  }

  /**
   * Summarizes and prunes message history for the intent router to save tokens and reduce noise.
   */
  private collectMessage(messages: UIMessage[]): string {
    const collected: string[] = [];
    for (
      let i = messages.length - 1;
      i >= 0 && collected.length < PlannerPromptBuilder.MAX_SUMMARY_MESSAGES;
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
   */
  private collectOneMessage(m: UIMessage): string | null {
    const text = uiMessageToText(m);
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
   * Prunes assistant message: replaces code blocks with placeholders, truncates.
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

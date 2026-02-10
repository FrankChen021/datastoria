import type { UIMessage } from "ai";
import type { AgentContext } from "./chat-types";

const VALIDATE_SQL_TOOL_NAME = "validate_sql";

export class MessagePruner {
  /**
   * Main entry point for message pruning.
   * Compresses conversation history by removing redundant intermediate tool calls.
   * Currently prunes all 'validate_sql' calls from historical turns as they are
   * considered intermediate "scaffolding" that clutter the context window.
   */
  static prune(messages: UIMessage[], context?: AgentContext): UIMessage[] {
    // By default, pruning is enabled unless explicitly disabled.
    if (context?.pruneValidateSql === false) {
      return messages;
    }
    return this.pruneHistoricalToolParts(messages, VALIDATE_SQL_TOOL_NAME);
  }

  /**
   * Prunes all tool calls and results for a specific tool from historical messages.
   * This is done regardless of success/failure to keep the conversation history
   * concise and consistent, and to simplify handling of parallel/retry execution.
   */
  private static pruneHistoricalToolParts(messages: UIMessage[], toolName: string): UIMessage[] {
    if (messages.length === 0) return messages;

    const pruned: UIMessage[] = [];

    // We only prune from "historical" turns.
    // If the last message is an assistant message, it's currently "active" (e.g., in a tool-call loop).
    const lastMessageIndex = messages.length - 1;
    const isAssistantTurnInFlight = messages[lastMessageIndex].role === "assistant";

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      // Don't prune from the active assistant message to avoid breaking current turn flow.
      if (isAssistantTurnInFlight && i === lastMessageIndex) {
        pruned.push(message);
        continue;
      }

      // We only prune from assistant messages that have parts.
      if (message.role !== "assistant" || !Array.isArray(message.parts)) {
        pruned.push(message);
        continue;
      }

      // Filter out parts that belong to the tool we want to prune.
      const filteredParts = message.parts.filter((part) => {
        const p = part as { toolName?: unknown; type?: unknown };
        const shouldPrune =
          p.toolName === toolName ||
          p.type === `tool-${toolName}` ||
          (p.type === "dynamic-tool" && p.toolName === toolName);

        return !shouldPrune;
      });

      pruned.push({
        ...message,
        parts: filteredParts,
      });
    }

    return pruned;
  }
}

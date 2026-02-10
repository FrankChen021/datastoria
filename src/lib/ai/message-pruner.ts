import type { UIMessage } from "ai";

const VALIDATE_SQL_TOOL_NAME = "validate_sql";

export class MessagePruner {
  /**
   * Main entry point for message pruning.
   * Compresses conversation history by removing redundant intermediate tool calls.
   */
  static prune(messages: UIMessage[]): UIMessage[] {
    return this.pruneHistoricalToolParts(messages, VALIDATE_SQL_TOOL_NAME);
  }

  /**
   * Prunes successful tool calls and their results from historical messages.
   * Keeps failed validations as they provide important context for the model's recovery reasoning.
   */
  private static pruneHistoricalToolParts(messages: UIMessage[], toolName: string): UIMessage[] {
    if (messages.length === 0) return messages;

    const pruned: UIMessage[] = [];

    // We only prune from "historical" turns. 
    // If the last message is an assistant message, it's currently "active" (e.g., in a tool-call loop).
    const lastMessageIndex = messages.length - 1;
    const isLastMessageAssistant = messages[lastMessageIndex].role === "assistant";

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      // Don't prune from the active assistant message to avoid breaking current turn flow.
      if (isLastMessageAssistant && i === lastMessageIndex) {
        pruned.push(message);
        continue;
      }

      // We only prune from assistant messages that have parts
      if (message.role !== "assistant" || !Array.isArray(message.parts)) {
        pruned.push(message);
        continue;
      }

      // 1. Find toolCallIds of successful validations in this message
      const successfulToolCallIds = new Set<string>();
      for (const part of message.parts) {
        const candidate = part as {
          toolName?: unknown;
          type?: unknown;
          state?: unknown;
          output?: { success?: unknown } | unknown;
          toolCallId?: unknown;
        };

        // Match various ways tool parts might be represented in the message history
        const isTargetTool =
          candidate.toolName === toolName ||
          candidate.type === `tool-${toolName}` ||
          (candidate.type === "dynamic-tool" && candidate.toolName === toolName);

        const success =
          typeof candidate.output === "object" &&
          candidate.output !== null &&
          "success" in candidate.output &&
          candidate.output.success === true;

        if (isTargetTool && candidate.state === "output-available" && success) {
          if (typeof candidate.toolCallId === "string") {
            successfulToolCallIds.add(candidate.toolCallId);
          }
        }
      }

      // If no successful validations found, keep the message as is
      if (successfulToolCallIds.size === 0) {
        pruned.push(message);
        continue;
      }

      // 2. Build a new version of the message with those toolCallIds removed.
      // This removes both the tool-call (arguments) and the tool-result (success: true) parts.
      const filteredParts = [];
      for (const part of message.parts) {
        const candidate = part as { toolCallId?: unknown };
        if (
          typeof candidate.toolCallId === "string" &&
          successfulToolCallIds.has(candidate.toolCallId)
        ) {
          console.log("Removing tool call", candidate.toolCallId);
          continue;
        }
        filteredParts.push(part);
      }

      pruned.push({
        ...message,
        parts: filteredParts,
      });
    }

    return pruned;
  }
}

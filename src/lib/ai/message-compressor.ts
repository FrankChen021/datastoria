import type { UIMessage } from "ai";

export class MessageCompressor {
  private static hasToolPart(part: unknown, toolName: string): boolean {
    if (!part || typeof part !== "object") return false;
    const candidate = part as { toolName?: unknown; type?: unknown };
    return candidate.toolName === toolName || candidate.type === `tool-${toolName}`;
  }

  private static lastAssistantMessageHasTool(messages: UIMessage[], toolName: string): boolean {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      return message.parts.some((part) => this.hasToolPart(part, toolName));
    }
    return false;
  }

  static pruneHistoricalToolParts(messages: UIMessage[], toolName: string): UIMessage[] {
    if (this.lastAssistantMessageHasTool(messages, toolName)) {
      return messages;
    }

    return messages.map((message) => ({
      ...message,
      parts: message.parts.filter((part) => !this.hasToolPart(part, toolName)),
    }));
  }
}

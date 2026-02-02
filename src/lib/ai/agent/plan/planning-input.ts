import type { ChatUIMessage } from "@/app/api/chat/route";
import type { PlanToolOutput } from "@/lib/ai/agent/plan/planning-types";
import { intentFromKey, type Intent } from "@/lib/ai/agent/plan/sub-agent-registry";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";
import type { UIMessage } from "ai";
import { v7 as uuidv7 } from "uuid";

/**
 * Parsed view of UI messages for the plan layer. Computes previousIntent, isContinuation,
 * lastAssistant, lastUser, isFirstUserMessage, and messageId once from UIMessage[].
 */
export class InputMessages {
  readonly messages: UIMessage[];
  readonly previousIntent: Intent | undefined;
  readonly isContinuation: boolean;
  readonly lastAssistant: UIMessage | undefined;
  readonly lastUser: UIMessage | undefined;
  readonly isFirstUserMessage: boolean;
  readonly messageId: string;

  constructor(messages: UIMessage[]) {
    this.messages = messages;
    this.previousIntent = InputMessages.getPreviousIntent(messages as ChatUIMessage[]);
    this.isContinuation = InputMessages.isContinuation(messages);

    let lastAssistant: UIMessage | undefined;
    let lastUser: UIMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && lastAssistant === undefined) {
        lastAssistant = m;
      }
      if (m.role === "user" && lastUser === undefined) {
        lastUser = m;
      }
      if (lastAssistant !== undefined && lastUser !== undefined) {
        break;
      }
    }

    this.lastAssistant = lastAssistant;
    this.lastUser = lastUser;
    this.isFirstUserMessage = messages.length === 1 && messages[0].role === "user";
    this.messageId =
      this.isContinuation &&
      this.lastAssistant &&
      "id" in this.lastAssistant &&
      typeof this.lastAssistant.id === "string"
        ? this.lastAssistant.id
        : uuidv7();
  }

  /**
   * Caller must check the length
   */
  getFirstMessage(): UIMessage {
    return this.messages[0];
  }

  /**
   * True when the last message is an assistant message whose last part is a tool-result
   * (continuation after tool execution).
   */
  private static isContinuation(messages: UIMessage[]): boolean {
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return false;
    const parts = last.parts;
    return (
      Array.isArray(parts) &&
      parts.length > 0 &&
      (parts[parts.length - 1] as { state?: string }).state === "output-available"
    );
  }

  /**
   * Extracts the previous turn's intent for continuation routing.
   * Single backward pass: metadata (assistant) wins; else most recent plan tool result in parts.
   */
  private static getPreviousIntent(messages: ChatUIMessage[]): Intent | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      if (msg.role === "assistant") {
        const raw = msg.metadata?.planner?.intent;
        if (typeof raw === "string") {
          const intent = intentFromKey(raw);
          if (intent) return intent;
        }
      }

      if (Array.isArray(msg.parts)) {
        for (let j = msg.parts.length - 1; j >= 0; j--) {
          const part = msg.parts[j];
          if (part.type === "dynamic-tool" && part.toolName === SERVER_TOOL_NAMES.PLAN) {
            const output = part.output as PlanToolOutput;
            if (output.intent) {
              const intent = intentFromKey(output.intent);
              if (intent) return intent;
            }
          }
        }
      }
    }

    return undefined;
  }
}

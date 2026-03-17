import type { ServerDatabaseContext } from "@/lib/ai/agent/common-types";
import type { AgentContext, AppUIMessage } from "@/lib/ai/chat-types";

export interface ChatRequestBase {
  sessionId: string;
  connectionId: string;
  ephemeral?: boolean;
  context?: ServerDatabaseContext;
  model?: { provider: string; modelId: string; apiKey?: string };
  agentContext?: AgentContext;
}

export interface InitialTurnRequest extends ChatRequestBase {
  continuation?: false;
  message: AppUIMessage;
  generateTitle?: boolean;
}

export interface ContinuationRequest extends ChatRequestBase {
  continuation: true;
  message: AppUIMessage;
}

export type RemoteChatRequest = InitialTurnRequest | ContinuationRequest;

export function replaceOrAppendMessageById(
  persistedMessages: AppUIMessage[],
  incomingMessage: AppUIMessage
): AppUIMessage[] {
  const next = [...persistedMessages];
  const index = next.findIndex((message) => message.id === incomingMessage.id);
  if (index >= 0) {
    next[index] = incomingMessage;
  } else {
    next.push(incomingMessage);
  }
  return next;
}

export function validateSessionId(sessionId: string): boolean {
  return typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 64;
}

export function hasCompletedToolOutputs(message: AppUIMessage): boolean {
  return Array.isArray(message.parts)
    ? message.parts.some((part) => {
        const candidate = part as { state?: unknown };
        return candidate.state === "output-available";
      })
    : false;
}

export function validateRemoteChatRequest(payload: unknown): RemoteChatRequest | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<RemoteChatRequest>;
  if (
    !validateSessionId(candidate.sessionId ?? "") ||
    typeof candidate.connectionId !== "string" ||
    !candidate.message ||
    typeof candidate.message !== "object" ||
    typeof candidate.message.id !== "string" ||
    (candidate.message.role !== "user" && candidate.message.role !== "assistant")
  ) {
    return null;
  }

  if (candidate.continuation === true) {
    return { ...candidate, continuation: true } as ContinuationRequest;
  }

  return {
    ...candidate,
    continuation: false,
  } as InitialTurnRequest;
}

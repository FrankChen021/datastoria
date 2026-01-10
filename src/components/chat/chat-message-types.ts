// TypeScript types for AI chat feature

import type { AppUIMessage, TokenUsage } from "@/lib/ai/common-types";
import type { DatabaseContext } from "./chat-context";

export type MessageRole = "user" | "assistant" | "system" | "data" | "tool";

export type MessagePartType = "text" | "tool-call" | "tool-result";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart;

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: Date;
  updatedAt: Date;
  usage?: TokenUsage;
  context?: DatabaseContext;
}

export interface Chat {
  chatId: string;
  databaseId?: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatRequest {
  chatId: string;
  messages: Array<{
    id: string;
    role: MessageRole;
    parts: MessagePart[];
  }>;
  context?: DatabaseContext;
}

/**
 * Type for tool parts that have input, output, and state properties
 */
export type ToolPart = AppUIMessage["parts"][0] & {
  input?: unknown;
  output?: unknown;
  state?: string;
  toolName?: string;
};

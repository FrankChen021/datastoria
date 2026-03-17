import type {
  AppUIMessage,
  Chat,
  Message,
  MessageMetadata,
  MessagePart,
} from "@/lib/ai/chat-types";
import type { PersistedChatMessage, PersistedChatSession } from "./server-session-repository";

export type ChatSessionDTO = {
  chatId: string;
  databaseId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageDTO = {
  id: string;
  role: Message["role"];
  parts: MessagePart[];
  metadata: MessageMetadata | null;
  sequence: number;
  createdAt: string;
  updatedAt: string;
};

export function serializeMessageParts(message: AppUIMessage): string {
  return JSON.stringify(message.parts ?? []);
}

export function serializeMessageMetadata(message: AppUIMessage): string | null {
  return message.metadata == null ? null : JSON.stringify(message.metadata);
}

function parseJsonField<T>(label: string, value: string | null): T | null {
  if (value == null) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`Failed to parse persisted chat ${label}`, error);
    throw new Error(`Corrupted persisted chat ${label}`);
  }
}

export function persistedSessionToChat(session: PersistedChatSession): Chat {
  return {
    chatId: session.session_id,
    databaseId: session.connection_id,
    title: session.title ?? undefined,
    createdAt: new Date(session.created_at),
    updatedAt: new Date(session.updated_at),
  };
}

export function persistedMessageToAppUIMessage(message: PersistedChatMessage): AppUIMessage {
  return {
    id: message.message_id,
    role: message.role,
    parts: parseJsonField<MessagePart[]>("parts", message.parts_text) ?? [],
    metadata: parseJsonField<MessageMetadata>("metadata", message.metadata_text) ?? undefined,
    createdAt: new Date(message.created_at),
    updatedAt: new Date(message.updated_at),
  } as AppUIMessage;
}

export function persistedSessionToDTO(session: PersistedChatSession): ChatSessionDTO {
  return {
    chatId: session.session_id,
    databaseId: session.connection_id,
    title: session.title,
    createdAt: session.created_at.toISOString(),
    updatedAt: session.updated_at.toISOString(),
  };
}

export function persistedMessageToDTO(message: PersistedChatMessage): ChatMessageDTO {
  return {
    id: message.message_id,
    role: message.role,
    parts: parseJsonField<MessagePart[]>("parts", message.parts_text) ?? [],
    metadata: parseJsonField<MessageMetadata>("metadata", message.metadata_text),
    sequence: message.sequence,
    createdAt: message.created_at.toISOString(),
    updatedAt: message.updated_at.toISOString(),
  };
}

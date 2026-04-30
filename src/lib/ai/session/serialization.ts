import type {
  AppUIMessage,
  Chat,
  FilePart,
  Message,
  MessageMetadata,
  MessagePart,
} from "@/lib/ai/ai-types";
import type { PersistedChatMessage, PersistedChatSession } from "./server-session-repository";

const IMAGE_HISTORY_PLACEHOLDER = "[Image attachment omitted from saved history]";

function isPersistedImagePart(part: MessagePart): part is FilePart {
  return (
    part.type === "file" &&
    typeof part.mediaType === "string" &&
    typeof part.url === "string" &&
    part.mediaType.startsWith("image/")
  );
}

function hasProviderMetadata(part: MessagePart): boolean {
  const metadata = (part as { providerMetadata?: unknown }).providerMetadata;
  return typeof metadata === "object" && metadata !== null;
}

function isNonPersistedStreamPart(part: MessagePart): boolean {
  const partType = String(part.type);
  if (partType === "step-start") {
    return true;
  }

  if (partType === "reasoning") {
    const text = (part as { text?: unknown }).text;
    return (typeof text !== "string" || text.trim().length === 0) && !hasProviderMetadata(part);
  }

  return false;
}

export function sanitizeMessageForPersistence(message: AppUIMessage): AppUIMessage {
  const parts = (message.parts ?? []) as MessagePart[];
  if (!parts.some((part) => isPersistedImagePart(part) || isNonPersistedStreamPart(part))) {
    return message;
  }

  const removedImagePart = parts.some(isPersistedImagePart);
  const sanitizedParts = parts.filter(
    (part) => !isPersistedImagePart(part) && !isNonPersistedStreamPart(part)
  );
  const nextParts =
    sanitizedParts.length > 0
      ? sanitizedParts
      : removedImagePart
        ? ([{ type: "text", text: IMAGE_HISTORY_PLACEHOLDER }] satisfies MessagePart[])
        : [];

  return {
    ...message,
    parts: nextParts as AppUIMessage["parts"],
  };
}

export type ChatSessionDTO = {
  chatId: string;
  databaseId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatSessionPageDTO = {
  sessions: ChatSessionDTO[];
  nextCursor: string | null;
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
  return JSON.stringify(sanitizeMessageForPersistence(message).parts ?? []);
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

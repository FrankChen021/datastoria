import type { Chat, Message } from "@/lib/ai/chat-types";
import { BasePath } from "@/lib/base-path";
import type { SessionRepository } from "./session-repository";

type ChatSessionDTO = {
  chatId: string;
  databaseId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatMessageDTO = {
  id: string;
  role: Message["role"];
  parts: Message["parts"];
  metadata: Message["metadata"] | null;
  sequence: number;
  createdAt: string;
  updatedAt: string;
};

function toChat(dto: ChatSessionDTO): Chat {
  return {
    chatId: dto.chatId,
    databaseId: dto.databaseId,
    title: dto.title ?? undefined,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

function toMessage(dto: ChatMessageDTO): Message {
  return {
    id: dto.id,
    role: dto.role,
    parts: dto.parts,
    metadata: dto.metadata ?? undefined,
    sequence: dto.sequence,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export class RemoteSessionRepository implements SessionRepository {
  async getSession(chatId: string): Promise<Chat | null> {
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions/${encodeURIComponent(chatId)}`),
      {
        credentials: "same-origin",
        cache: "no-store",
      }
    );

    if (response.status === 404) {
      return null;
    }

    const dto = await parseJson<ChatSessionDTO>(response);
    return toChat(dto);
  }

  async getSessionsForConnection(connectionId: string): Promise<Chat[]> {
    const searchParams = new URLSearchParams({ connectionId });
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions?${searchParams.toString()}`),
      {
        credentials: "same-origin",
        cache: "no-store",
      }
    );
    const sessions = await parseJson<ChatSessionDTO[]>(response);
    return sessions.map(toChat);
  }

  async getMessages(chatId: string): Promise<Message[]> {
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions/${encodeURIComponent(chatId)}/messages`),
      {
        credentials: "same-origin",
        cache: "no-store",
      }
    );

    if (response.status === 404) {
      return [];
    }

    const messages = await parseJson<ChatMessageDTO[]>(response);
    return messages.map(toMessage);
  }

  async saveSession(_session: Chat): Promise<void> {}

  async saveMessages(_chatId: string, _messages: Message[]): Promise<void> {}

  async saveMessage(_chatId: string, _message: Message): Promise<void> {}

  async renameSession(chatId: string, title: string): Promise<void> {
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions/${encodeURIComponent(chatId)}`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to rename session: ${response.status}`);
    }
  }

  async deleteSession(chatId: string): Promise<void> {
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions/${encodeURIComponent(chatId)}`),
      {
        method: "DELETE",
        credentials: "same-origin",
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
  }
}

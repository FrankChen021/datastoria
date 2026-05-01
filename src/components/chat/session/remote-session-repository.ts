import type { Chat, Message } from "@/lib/ai/ai-types";
import { SESSION_SHARE_CODE_HEADER } from "@/lib/ai/session/session-share-constants";
import { BasePath } from "@/lib/base-path";
import type {
  CreateSessionFromMessagesInput,
  SessionAccessOptions,
  SessionPage,
  SessionPageInput,
  SessionRepository,
} from "./session-repository";

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

function buildShareCodeHeaders(options?: SessionAccessOptions): HeadersInit | undefined {
  return options?.shareCode ? { [SESSION_SHARE_CODE_HEADER]: options.shareCode } : undefined;
}

export class RemoteSessionRepository implements SessionRepository {
  async getSession(sessionId: string, options?: SessionAccessOptions): Promise<Chat | null> {
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions/${encodeURIComponent(sessionId)}`),
      {
        headers: buildShareCodeHeaders(options),
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

  async getSessions(input: SessionPageInput): Promise<SessionPage> {
    const searchParams = new URLSearchParams({ limit: String(input.limit) });
    if (input.connectionId) {
      searchParams.set("connectionId", input.connectionId);
    }
    if (input.cursor) {
      searchParams.set("cursor", input.cursor);
    }

    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions?${searchParams.toString()}`),
      {
        credentials: "same-origin",
        cache: "no-store",
      }
    );
    const page = await parseJson<{ sessions: ChatSessionDTO[]; nextCursor: string | null }>(
      response
    );
    return {
      sessions: page.sessions.map(toChat),
      nextCursor: page.nextCursor,
    };
  }

  async getMessages(sessionId: string, options?: SessionAccessOptions): Promise<Message[]> {
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions/${encodeURIComponent(sessionId)}/messages`),
      {
        headers: buildShareCodeHeaders(options),
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

  async createSessionFromMessages(input: CreateSessionFromMessagesInput): Promise<Chat> {
    const response = await fetch(BasePath.getURL("/api/ai/chat/sessions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        connectionId: input.connectionId,
        sessionId: input.sessionId,
        title: input.title,
        messages: input.messages,
      }),
    });

    const data = await parseJson<{ session: ChatSessionDTO }>(response);
    return toChat(data.session);
  }

  async saveSession(_session: Chat): Promise<void> {}

  async saveMessages(_chatId: string, _messages: Message[]): Promise<void> {}

  async saveMessage(_sessionId: string, _message: Message): Promise<void> {}

  async renameSession(
    sessionId: string,
    title: string,
    options?: SessionAccessOptions
  ): Promise<void> {
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions/${encodeURIComponent(sessionId)}`),
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildShareCodeHeaders(options),
        },
        credentials: "same-origin",
        body: JSON.stringify({ title }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to rename session: ${response.status}`);
    }
  }

  async deleteSession(sessionId: string, options?: SessionAccessOptions): Promise<void> {
    const response = await fetch(
      BasePath.getURL(`/api/ai/chat/sessions/${encodeURIComponent(sessionId)}`),
      {
        method: "DELETE",
        headers: buildShareCodeHeaders(options),
        credentials: "same-origin",
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
  }
}

import type { Chat, Message } from "@/lib/ai/ai-types";

export interface CreateSessionFromMessagesInput {
  connectionId: string;
  sessionId?: string;
  title?: string;
  messages: Message[];
}

export interface SessionPageInput {
  connectionId?: string;
  limit: number;
  cursor?: string | null;
}

export interface SessionPage<TSession = Chat> {
  sessions: TSession[];
  nextCursor: string | null;
}

export interface SessionAccessOptions {
  shareCode?: string;
}

export interface SessionRepository {
  getSession(sessionId: string, options?: SessionAccessOptions): Promise<Chat | null>;
  getSessions(input: SessionPageInput): Promise<SessionPage>;
  getMessages(sessionId: string, options?: SessionAccessOptions): Promise<Message[]>;
  createSessionFromMessages(input: CreateSessionFromMessagesInput): Promise<Chat>;
  saveSession(session: Chat): Promise<void>;
  saveMessages(sessionId: string, messages: Message[]): Promise<void>;
  saveMessage(sessionId: string, message: Message): Promise<void>;
  renameSession(sessionId: string, title: string, options?: SessionAccessOptions): Promise<void>;
  deleteSession(sessionId: string, options?: SessionAccessOptions): Promise<void>;
}

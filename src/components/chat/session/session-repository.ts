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

export interface SessionRepository {
  getSession(chatId: string): Promise<Chat | null>;
  getSessions(input: SessionPageInput): Promise<SessionPage>;
  getMessages(chatId: string): Promise<Message[]>;
  createSessionFromMessages(input: CreateSessionFromMessagesInput): Promise<Chat>;
  saveSession(session: Chat): Promise<void>;
  saveMessages(chatId: string, messages: Message[]): Promise<void>;
  saveMessage(chatId: string, message: Message): Promise<void>;
  renameSession(chatId: string, title: string): Promise<void>;
  deleteSession(chatId: string): Promise<void>;
}

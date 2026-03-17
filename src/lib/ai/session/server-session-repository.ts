import type { AppUIMessage, MessageRole } from "@/lib/ai/chat-types";

export interface PersistedChatSession {
  id: string;
  owner_user_id: string;
  connection_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PersistedChatMessage {
  id: string;
  chat_id: string;
  owner_user_id: string;
  role: MessageRole;
  parts_text: string;
  metadata_text: string | null;
  sequence: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionInput {
  id: string;
  owner_user_id: string;
  connection_id: string;
  title?: string | null;
}

export interface TouchSessionInput {
  id: string;
  owner_user_id: string;
  title?: string | null;
}

export interface UpsertMessageInput {
  chat_id: string;
  owner_user_id: string;
  message: AppUIMessage;
}

export interface ServerSessionRepository {
  getSession(userId: string, chatId: string): Promise<PersistedChatSession | null>;
  getSessionsForConnection(userId: string, connectionId: string): Promise<PersistedChatSession[]>;
  getMessages(userId: string, chatId: string): Promise<PersistedChatMessage[]>;
  createSession(input: CreateSessionInput): Promise<PersistedChatSession>;
  touchSession(input: TouchSessionInput): Promise<PersistedChatSession | null>;
  upsertMessage(input: UpsertMessageInput): Promise<void>;
  updateSessionTitle(userId: string, chatId: string, title: string): Promise<void>;
  renameSession(userId: string, chatId: string, title: string): Promise<void>;
  deleteSession(userId: string, chatId: string): Promise<void>;
}

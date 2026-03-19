import type { AppUIMessage, MessageRole } from "@/lib/ai/chat-types";

export interface PersistedChatSession {
  session_id: string;
  user_id: string;
  connection_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PersistedChatMessage {
  message_id: string;
  session_id: string;
  user_id: string;
  role: MessageRole;
  parts_text: string;
  metadata_text: string | null;
  sequence: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionInput {
  id: string;
  user_id: string;
  connection_id: string;
  title?: string | null;
}

export interface TouchSessionInput {
  id: string;
  user_id: string;
  title?: string | null;
}

export interface UpsertMessageInput {
  session_id: string;
  user_id: string;
  message: AppUIMessage;
  allowMissingSession?: boolean;
}

export interface ServerSessionRepository {
  getSession(userId: string, sessionId: string): Promise<PersistedChatSession | null>;
  getSessionsForConnection(userId: string, connectionId: string): Promise<PersistedChatSession[]>;
  getMessages(userId: string, sessionId: string): Promise<PersistedChatMessage[]>;
  createSession(input: CreateSessionInput): Promise<PersistedChatSession>;
  touchSession(input: TouchSessionInput): Promise<PersistedChatSession | null>;
  upsertMessage(input: UpsertMessageInput): Promise<void>;
  updateSessionTitle(userId: string, sessionId: string, title: string): Promise<void>;
  renameSession(userId: string, sessionId: string, title: string): Promise<void>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  cleanupExpiredSessions(cutoff: Date): Promise<number>;
}

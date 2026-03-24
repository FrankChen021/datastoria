import type { AppUIMessage, MessageMetadata, MessageRole } from "@/lib/ai/chat-types";

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

export interface PersistedFeedbackEvent {
  user_id: string;
  source: string;
  session_id: string;
  message_id: string;
  solved: boolean;
  reason_code: string | null;
  payload_text: string;
  free_text: string | null;
  recovery_action_taken: boolean;
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

export interface RecordMessageMetadataInput {
  session_id: string;
  user_id: string;
  message_id: string;
  metadata: MessageMetadata;
}

export interface UpsertFeedbackEventInput {
  user_id: string;
  source: string;
  session_id: string;
  message_id: string;
  solved: boolean;
  reason_code: string | null;
  payload_text: string;
  free_text: string | null;
  recovery_action_taken: boolean;
}

export interface GetFeedbackEventsInput {
  source?: string;
  createdAfter?: Date;
}

export interface ServerSessionRepository {
  getSession(userId: string, sessionId: string): Promise<PersistedChatSession | null>;
  getSessionsForConnection(userId: string, connectionId: string): Promise<PersistedChatSession[]>;
  getMessages(userId: string, sessionId: string): Promise<PersistedChatMessage[]>;
  createSession(input: CreateSessionInput): Promise<PersistedChatSession>;
  touchSession(input: TouchSessionInput): Promise<PersistedChatSession | null>;
  upsertMessage(input: UpsertMessageInput): Promise<void>;
  recordMessageMetadata(input: RecordMessageMetadataInput): Promise<void>;
  upsertFeedbackEvent(input: UpsertFeedbackEventInput): Promise<PersistedFeedbackEvent>;
  getFeedbackEvents(input?: GetFeedbackEventsInput): Promise<PersistedFeedbackEvent[]>;
  updateSessionTitle(userId: string, sessionId: string, title: string): Promise<void>;
  renameSession(userId: string, sessionId: string, title: string): Promise<void>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  cleanupExpiredSessions(cutoff: Date): Promise<number>;
}

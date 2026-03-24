import type {
  CreateSessionInput,
  GetFeedbackEventsInput,
  PersistedChatSession,
  PersistedFeedbackEvent,
  RecordMessageMetadataInput,
  ServerSessionRepository,
  TouchSessionInput,
  UpsertFeedbackEventInput,
  UpsertMessageInput,
} from "../server-session-repository";

export class ServerSessionRepositoryNoop implements ServerSessionRepository {
  async getSession(_userId: string, _sessionId: string): Promise<PersistedChatSession | null> {
    return null;
  }

  async getSessionsForConnection(
    _userId: string,
    _connectionId: string
  ): Promise<PersistedChatSession[]> {
    return [];
  }

  async getMessages(_userId: string, _sessionId: string): Promise<[]> {
    return [];
  }

  async createSession(input: CreateSessionInput): Promise<PersistedChatSession> {
    const now = new Date();
    return {
      session_id: input.id,
      user_id: input.user_id,
      connection_id: input.connection_id,
      title: input.title ?? null,
      created_at: now,
      updated_at: now,
    };
  }

  async touchSession(_input: TouchSessionInput): Promise<PersistedChatSession | null> {
    return null;
  }

  async upsertMessage(_input: UpsertMessageInput): Promise<void> {}

  async recordMessageMetadata(_input: RecordMessageMetadataInput): Promise<void> {}

  async upsertFeedbackEvent(input: UpsertFeedbackEventInput): Promise<PersistedFeedbackEvent> {
    const now = new Date();
    return {
      user_id: input.user_id,
      source: input.source,
      session_id: input.session_id,
      message_id: input.message_id,
      solved: input.solved,
      reason_code: input.reason_code,
      payload_text: input.payload_text,
      free_text: input.free_text,
      recovery_action_taken: input.recovery_action_taken,
      created_at: now,
      updated_at: now,
    };
  }

  async getFeedbackEvents(_input?: GetFeedbackEventsInput): Promise<PersistedFeedbackEvent[]> {
    return [];
  }

  async updateSessionTitle(_userId: string, _sessionId: string, _title: string): Promise<void> {}

  async renameSession(_userId: string, _sessionId: string, _title: string): Promise<void> {}

  async deleteSession(_userId: string, _sessionId: string): Promise<void> {}

  async cleanupExpiredSessions(): Promise<number> {
    return 0;
  }
}

import type {
  CreateSessionInput,
  PersistedChatSession,
  ServerSessionRepository,
  TouchSessionInput,
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

  async updateSessionTitle(_userId: string, _sessionId: string, _title: string): Promise<void> {}

  async renameSession(_userId: string, _sessionId: string, _title: string): Promise<void> {}

  async deleteSession(_userId: string, _sessionId: string): Promise<void> {}

  async cleanupExpiredSessions(): Promise<number> {
    return 0;
  }
}

import type {
  CreateSessionInput,
  PersistedChatSession,
  ServerSessionRepository,
  TouchSessionInput,
  UpsertMessageInput,
} from "../server-session-repository";

export class ServerSessionRepositoryNoop implements ServerSessionRepository {
  async getSession(): Promise<PersistedChatSession | null> {
    return null;
  }

  async getSessionsForConnection(): Promise<PersistedChatSession[]> {
    return [];
  }

  async getMessages(): Promise<[]> {
    return [];
  }

  async createSession(input: CreateSessionInput): Promise<PersistedChatSession> {
    const now = new Date();
    return {
      id: input.id,
      owner_user_id: input.owner_user_id,
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

  async updateSessionTitle(): Promise<void> {}

  async renameSession(): Promise<void> {}

  async deleteSession(): Promise<void> {}
}

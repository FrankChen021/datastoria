import type { MessageMetadata } from "@/lib/ai/chat-types";
import type { Knex } from "knex";
import {
  persistedMessageToAppUIMessage,
  serializeMessageMetadata,
  serializeMessageParts,
} from "../serialization";
import type {
  CreateSessionInput,
  GetFeedbackEventsInput,
  PersistedChatMessage,
  PersistedChatSession,
  PersistedFeedbackEvent,
  RecordMessageMetadataInput,
  ServerSessionRepository,
  TouchSessionInput,
  UpsertFeedbackEventInput,
  UpsertMessageInput,
} from "../server-session-repository";

type SqlRepositoryOptions = {
  getDb: () => Knex;
  nowExpression: string;
  supportsForUpdate: boolean;
  ensureReady?: () => Promise<void>;
};

export abstract class AbstractServerSessionRepository implements ServerSessionRepository {
  constructor(private readonly options: SqlRepositoryOptions) {}

  protected toPersistedSession(row: PersistedChatSession): PersistedChatSession {
    return {
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  protected toPersistedMessage(row: PersistedChatMessage): PersistedChatMessage {
    return {
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  protected toPersistedFeedbackEvent(row: PersistedFeedbackEvent): PersistedFeedbackEvent {
    return {
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private db(): Knex {
    return this.options.getDb();
  }

  private nowRaw(executor: Knex | Knex.Transaction): Knex.Raw {
    return executor.raw(this.options.nowExpression);
  }

  private async ensureReady(): Promise<void> {
    if (this.options.ensureReady) {
      await this.options.ensureReady();
    }
  }

  async getSession(userId: string, sessionId: string): Promise<PersistedChatSession | null> {
    await this.ensureReady();
    const row = (await this.db()("chat_sessions")
      .select({
        session_id: "session_id",
        user_id: "user_id",
        connection_id: "connection_id",
        title: "title",
        created_at: "created_at",
        updated_at: "updated_at",
      })
      .where({
        session_id: sessionId,
        user_id: userId,
      })
      .first()) as PersistedChatSession | undefined;

    return row ? this.toPersistedSession(row) : null;
  }

  async getSessionsForConnection(
    userId: string,
    connectionId: string
  ): Promise<PersistedChatSession[]> {
    await this.ensureReady();
    const rows = (await this.db()("chat_sessions")
      .select({
        session_id: "session_id",
        user_id: "user_id",
        connection_id: "connection_id",
        title: "title",
        created_at: "created_at",
        updated_at: "updated_at",
      })
      .where({
        user_id: userId,
        connection_id: connectionId,
      })
      .orderBy("updated_at", "desc")) as PersistedChatSession[];

    return rows.map((row) => this.toPersistedSession(row));
  }

  async getMessages(userId: string, sessionId: string): Promise<PersistedChatMessage[]> {
    await this.ensureReady();
    const rows = (await this.db()("chat_messages")
      .select({
        message_id: "message_id",
        session_id: "session_id",
        user_id: "user_id",
        role: "role",
        parts_text: "parts_text",
        metadata_text: "metadata_text",
        sequence: "sequence",
        created_at: "created_at",
        updated_at: "updated_at",
      })
      .where({
        user_id: userId,
        session_id: sessionId,
      })
      .orderBy("sequence", "asc")) as PersistedChatMessage[];

    return rows.map((row) =>
      this.toPersistedMessage({
        ...row,
        role: row.role as PersistedChatMessage["role"],
      })
    );
  }

  async createSession(input: CreateSessionInput): Promise<PersistedChatSession> {
    await this.ensureReady();
    await this.db()("chat_sessions").insert({
      session_id: input.id,
      user_id: input.user_id,
      connection_id: input.connection_id,
      title: input.title ?? null,
      created_at: this.nowRaw(this.db()),
      updated_at: this.nowRaw(this.db()),
    });

    const created = await this.getSession(input.user_id, input.id);
    if (!created) {
      throw new Error("Failed to create chat session");
    }

    return created;
  }

  async touchSession(input: TouchSessionInput): Promise<PersistedChatSession | null> {
    await this.ensureReady();
    await this.db()("chat_sessions")
      .where({
        session_id: input.id,
        user_id: input.user_id,
      })
      .update({
        title: this.db().raw("COALESCE(?, title)", [input.title ?? null]),
        updated_at: this.nowRaw(this.db()),
      });

    return this.getSession(input.user_id, input.id);
  }

  async upsertMessage(input: UpsertMessageInput): Promise<void> {
    await this.ensureReady();
    const partsText = serializeMessageParts(input.message);
    const metadataText = serializeMessageMetadata(input.message);

    await this.db().transaction(async (trx) => {
      if (!input.allowMissingSession) {
        await this.ensureSessionForUpdate(trx, input.user_id, input.session_id);
      }

      const existingRow = (await trx("chat_messages")
        .select("sequence")
        .where({
          message_id: input.message.id,
          session_id: input.session_id,
          user_id: input.user_id,
        })
        .first()) as { sequence: number } | undefined;

      if (existingRow) {
        await trx("chat_messages")
          .where({
            message_id: input.message.id,
            session_id: input.session_id,
            user_id: input.user_id,
          })
          .update({
            role: input.message.role,
            parts_text: partsText,
            metadata_text: metadataText,
            updated_at: this.nowRaw(trx),
          });
      } else {
        const sequenceQuery = trx("chat_messages")
          .select("sequence")
          .where({
            user_id: input.user_id,
            session_id: input.session_id,
          })
          .orderBy("sequence", "desc")
          .first();

        if (this.options.supportsForUpdate) {
          sequenceQuery.forUpdate();
        }

        const sequenceRow = (await sequenceQuery) as { sequence: number } | undefined;
        const nextSequence = (sequenceRow?.sequence ?? 0) + 1;

        await trx("chat_messages").insert({
          session_id: input.session_id,
          message_id: input.message.id,
          user_id: input.user_id,
          role: input.message.role,
          parts_text: partsText,
          metadata_text: metadataText,
          sequence: nextSequence,
          created_at: this.nowRaw(trx),
          updated_at: this.nowRaw(trx),
        });
      }

      if (!input.allowMissingSession) {
        await trx("chat_sessions")
          .where({
            session_id: input.session_id,
            user_id: input.user_id,
          })
          .update({
            updated_at: this.nowRaw(trx),
          });
      }
    });
  }

  async recordMessageMetadata(input: RecordMessageMetadataInput): Promise<void> {
    await this.ensureReady();

    await this.db().transaction(async (trx) => {
      const existingRow = (await trx("chat_messages")
        .select({
          message_id: "message_id",
          session_id: "session_id",
          user_id: "user_id",
          role: "role",
          parts_text: "parts_text",
          metadata_text: "metadata_text",
          sequence: "sequence",
          created_at: "created_at",
          updated_at: "updated_at",
        })
        .where({
          message_id: input.message_id,
          session_id: input.session_id,
          user_id: input.user_id,
        })
        .orderBy("sequence", "desc")
        .first()) as PersistedChatMessage | undefined;

      if (!existingRow) {
        throw new Error("Chat message does not exist");
      }

      const existingMessage = persistedMessageToAppUIMessage(existingRow);
      const metadata: MessageMetadata = {
        ...(existingMessage.metadata ?? {}),
        ...input.metadata,
      };

      await trx("chat_messages")
        .where({
          message_id: input.message_id,
          session_id: input.session_id,
          user_id: input.user_id,
        })
        .update({
          metadata_text: JSON.stringify(metadata),
          updated_at: this.nowRaw(trx),
        });

      await trx("chat_sessions")
        .where({
          session_id: input.session_id,
          user_id: input.user_id,
        })
        .update({
          updated_at: this.nowRaw(trx),
        });
    });
  }

  async upsertFeedbackEvent(input: UpsertFeedbackEventInput): Promise<PersistedFeedbackEvent> {
    await this.ensureReady();

    return this.db().transaction(async (trx) => {
      const message = await this.findMessageForFeedback(
        trx,
        input.user_id,
        input.session_id,
        input.message_id
      );
      if (!message) {
        throw new Error("Chat message does not exist");
      }

      const existing = (await trx("feedback_events")
        .select({
          user_id: "user_id",
          source: "source",
          session_id: "session_id",
          message_id: "message_id",
          solved: "solved",
          reason_code: "reason_code",
          payload_text: "payload_text",
          free_text: "free_text",
          recovery_action_taken: "recovery_action_taken",
          created_at: "created_at",
          updated_at: "updated_at",
        })
        .where({
          user_id: input.user_id,
          source: input.source,
          message_id: input.message_id,
        })
        .first()) as PersistedFeedbackEvent | undefined;

      if (existing) {
        await trx("feedback_events")
          .where({
            user_id: input.user_id,
            source: input.source,
            message_id: input.message_id,
          })
          .update({
            session_id: input.session_id,
            solved: input.solved,
            reason_code: input.reason_code,
            payload_text: input.payload_text,
            free_text: input.free_text,
            recovery_action_taken: input.recovery_action_taken,
            updated_at: this.nowRaw(trx),
          });
      } else {
        await trx("feedback_events").insert({
          user_id: input.user_id,
          source: input.source,
          session_id: input.session_id,
          message_id: input.message_id,
          solved: input.solved,
          reason_code: input.reason_code,
          payload_text: input.payload_text,
          free_text: input.free_text,
          recovery_action_taken: input.recovery_action_taken,
          created_at: this.nowRaw(trx),
          updated_at: this.nowRaw(trx),
        });
      }

      const row = (await trx("feedback_events")
        .select({
          user_id: "user_id",
          source: "source",
          session_id: "session_id",
          message_id: "message_id",
          solved: "solved",
          reason_code: "reason_code",
          payload_text: "payload_text",
          free_text: "free_text",
          recovery_action_taken: "recovery_action_taken",
          created_at: "created_at",
          updated_at: "updated_at",
        })
        .where({
          user_id: input.user_id,
          source: input.source,
          message_id: input.message_id,
        })
        .first()) as PersistedFeedbackEvent | undefined;

      if (!row) {
        throw new Error("Feedback event was not persisted");
      }

      return this.toPersistedFeedbackEvent({
        ...row,
        solved: Boolean(row.solved),
        recovery_action_taken: Boolean(row.recovery_action_taken),
      });
    });
  }

  async getFeedbackEvents(input?: GetFeedbackEventsInput): Promise<PersistedFeedbackEvent[]> {
    await this.ensureReady();
    const query = this.db()("feedback_events")
      .select({
        user_id: "user_id",
        source: "source",
        session_id: "session_id",
        message_id: "message_id",
        solved: "solved",
        reason_code: "reason_code",
        payload_text: "payload_text",
        free_text: "free_text",
        recovery_action_taken: "recovery_action_taken",
        created_at: "created_at",
        updated_at: "updated_at",
      })
      .orderBy("created_at", "desc");

    if (input?.source) {
      query.where({ source: input.source });
    }
    if (input?.createdAfter) {
      query.andWhere("created_at", ">=", input.createdAfter);
    }

    const rows = (await query) as PersistedFeedbackEvent[];
    return rows.map((row) =>
      this.toPersistedFeedbackEvent({
        ...row,
        solved: Boolean(row.solved),
        recovery_action_taken: Boolean(row.recovery_action_taken),
      })
    );
  }

  async updateSessionTitle(userId: string, sessionId: string, title: string): Promise<void> {
    await this.renameSession(userId, sessionId, title);
  }

  async renameSession(userId: string, sessionId: string, title: string): Promise<void> {
    await this.ensureReady();
    await this.db()("chat_sessions")
      .where({
        session_id: sessionId,
        user_id: userId,
      })
      .update({
        title,
        updated_at: this.nowRaw(this.db()),
      });
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.ensureReady();
    await this.db().transaction(async (trx) => {
      await trx("chat_messages")
        .where({
          session_id: sessionId,
          user_id: userId,
        })
        .del();
      await trx("chat_sessions")
        .where({
          session_id: sessionId,
          user_id: userId,
        })
        .del();
    });
  }

  async cleanupExpiredSessions(cutoff: Date): Promise<number> {
    await this.ensureReady();
    return this.db().transaction(async (trx) => {
      const expiredSessionsQuery = trx("chat_sessions")
        .select("user_id", "session_id")
        .where("updated_at", "<", cutoff);

      await trx("chat_messages").whereIn(["user_id", "session_id"], expiredSessionsQuery).del();
      await trx("chat_messages as m")
        .where("m.updated_at", "<", cutoff)
        .whereNotExists(
          trx("chat_sessions as s")
            .select(trx.raw("1"))
            .whereRaw("s.user_id = m.user_id")
            .whereRaw("s.session_id = m.session_id")
        )
        .del();

      await trx("feedback_events").where("updated_at", "<", cutoff).del();

      const deletedCount = await trx("chat_sessions").where("updated_at", "<", cutoff).del();
      return deletedCount;
    });
  }

  private async ensureSessionForUpdate(
    trx: Knex.Transaction,
    userId: string,
    sessionId: string
  ): Promise<void> {
    const query = trx("chat_sessions")
      .select("session_id")
      .where({
        session_id: sessionId,
        user_id: userId,
      })
      .first();

    if (this.options.supportsForUpdate) {
      query.forUpdate();
    }

    const row = await query;
    if (!row) {
      throw new Error("Chat session does not exist");
    }
  }

  private async findMessageForFeedback(
    trx: Knex.Transaction,
    userId: string,
    sessionId: string,
    messageId: string
  ) {
    return trx("chat_messages")
      .select("message_id")
      .where({
        user_id: userId,
        session_id: sessionId,
        message_id: messageId,
      })
      .first();
  }
}

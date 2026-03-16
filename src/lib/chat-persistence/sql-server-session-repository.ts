import mysql, {
  type Pool as MySqlPool,
  type PoolConnection,
  type RowDataPacket,
} from "mysql2/promise";
import { Pool, type Pool as PgPool, type PoolClient, type QueryResultRow } from "pg";
import { getChatPersistenceDatabaseConfig } from "./chat-persistence-config";
import { serializeMessageMetadata, serializeMessageParts } from "./serialization";
import type {
  CreateSessionInput,
  PersistedChatMessage,
  PersistedChatSession,
  ServerSessionRepository,
  TouchSessionInput,
  UpsertMessageInput,
} from "./server-session-repository";

type MySqlSessionRow = PersistedChatSession & RowDataPacket;
type MySqlMessageRow = PersistedChatMessage & RowDataPacket;
type PgSessionRow = PersistedChatSession & QueryResultRow;
type PgMessageRow = PersistedChatMessage & QueryResultRow;

let mySqlPool: MySqlPool | null = null;
let pgPool: PgPool | null = null;

function requireDatabaseConfig() {
  const config = getChatPersistenceDatabaseConfig();
  if (!config) {
    throw new Error("Remote chat persistence is not configured");
  }
  return config;
}

function getMySqlPool(): MySqlPool {
  if (!mySqlPool) {
    const config = requireDatabaseConfig();
    mySqlPool = mysql.createPool(config.url);
  }
  return mySqlPool;
}

function getPgPool(): PgPool {
  if (!pgPool) {
    const config = requireDatabaseConfig();
    pgPool = new Pool({ connectionString: config.url });
  }
  return pgPool;
}

function toPersistedSession(row: PersistedChatSession): PersistedChatSession {
  return {
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

function toPersistedMessage(row: PersistedChatMessage): PersistedChatMessage {
  return {
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export class SqlServerSessionRepository implements ServerSessionRepository {
  private readonly config = requireDatabaseConfig();

  async getSession(userId: string, chatId: string): Promise<PersistedChatSession | null> {
    if (this.config.dialect === "mysql") {
      const [rows] = await getMySqlPool().execute<MySqlSessionRow[]>(
        `SELECT id, owner_user_id, connection_id, title, created_at, updated_at
         FROM chat_sessions
         WHERE id = ? AND owner_user_id = ?
         LIMIT 1`,
        [chatId, userId]
      );
      return rows[0] ? toPersistedSession(rows[0]) : null;
    }

    const result = await getPgPool().query<PgSessionRow>(
      `SELECT id, owner_user_id, connection_id, title, created_at, updated_at
       FROM chat_sessions
       WHERE id = $1 AND owner_user_id = $2
       LIMIT 1`,
      [chatId, userId]
    );
    return result.rows[0] ? toPersistedSession(result.rows[0]) : null;
  }

  async getSessionsForConnection(
    userId: string,
    connectionId: string
  ): Promise<PersistedChatSession[]> {
    if (this.config.dialect === "mysql") {
      const [rows] = await getMySqlPool().execute<MySqlSessionRow[]>(
        `SELECT id, owner_user_id, connection_id, title, created_at, updated_at
         FROM chat_sessions
         WHERE owner_user_id = ? AND connection_id = ?
         ORDER BY updated_at DESC`,
        [userId, connectionId]
      );
      return rows.map(toPersistedSession);
    }

    const result = await getPgPool().query<PgSessionRow>(
      `SELECT id, owner_user_id, connection_id, title, created_at, updated_at
       FROM chat_sessions
       WHERE owner_user_id = $1 AND connection_id = $2
       ORDER BY updated_at DESC`,
      [userId, connectionId]
    );
    return result.rows.map(toPersistedSession);
  }

  async getMessages(userId: string, chatId: string): Promise<PersistedChatMessage[]> {
    if (this.config.dialect === "mysql") {
      const [rows] = await getMySqlPool().execute<MySqlMessageRow[]>(
        `SELECT id, chat_id, owner_user_id, role, parts_text, metadata_text, sequence, created_at, updated_at
         FROM chat_messages
         WHERE owner_user_id = ? AND chat_id = ?
         ORDER BY sequence ASC`,
        [userId, chatId]
      );
      return rows.map(toPersistedMessage);
    }

    const result = await getPgPool().query<PgMessageRow>(
      `SELECT id, chat_id, owner_user_id, role, parts_text, metadata_text, sequence, created_at, updated_at
       FROM chat_messages
       WHERE owner_user_id = $1 AND chat_id = $2
       ORDER BY sequence ASC`,
      [userId, chatId]
    );
    return result.rows.map(toPersistedMessage);
  }

  async createSession(input: CreateSessionInput): Promise<PersistedChatSession> {
    if (this.config.dialect === "mysql") {
      await getMySqlPool().execute(
        `INSERT INTO chat_sessions (id, owner_user_id, connection_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
        [input.id, input.owner_user_id, input.connection_id, input.title ?? null]
      );
      const created = await this.getSession(input.owner_user_id, input.id);
      if (!created) {
        throw new Error("Failed to create chat session");
      }
      return created;
    }

    await getPgPool().query(
      `INSERT INTO chat_sessions (id, owner_user_id, connection_id, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [input.id, input.owner_user_id, input.connection_id, input.title ?? null]
    );
    const created = await this.getSession(input.owner_user_id, input.id);
    if (!created) {
      throw new Error("Failed to create chat session");
    }
    return created;
  }

  async touchSession(input: TouchSessionInput): Promise<PersistedChatSession | null> {
    if (this.config.dialect === "mysql") {
      await getMySqlPool().execute(
        `UPDATE chat_sessions
         SET title = COALESCE(?, title), updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND owner_user_id = ?`,
        [input.title ?? null, input.id, input.owner_user_id]
      );
      return this.getSession(input.owner_user_id, input.id);
    }

    await getPgPool().query(
      `UPDATE chat_sessions
       SET title = COALESCE($1, title), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3`,
      [input.title ?? null, input.id, input.owner_user_id]
    );
    return this.getSession(input.owner_user_id, input.id);
  }

  async upsertMessage(input: UpsertMessageInput): Promise<void> {
    const partsText = serializeMessageParts(input.message);
    const metadataText = serializeMessageMetadata(input.message);

    if (this.config.dialect === "mysql") {
      const connection = await getMySqlPool().getConnection();
      try {
        await connection.beginTransaction();
        await this.ensureSessionForUpdateMySql(connection, input.owner_user_id, input.chat_id);
        const [existingRows] = await connection.execute<
          Array<{ sequence: number; created_at: Date } & RowDataPacket>
        >(
          `SELECT sequence, created_at
           FROM chat_messages
           WHERE id = ? AND chat_id = ? AND owner_user_id = ?
           LIMIT 1`,
          [input.message.id, input.chat_id, input.owner_user_id]
        );

        if (existingRows[0]) {
          await connection.execute(
            `UPDATE chat_messages
             SET role = ?, parts_text = ?, metadata_text = ?, updated_at = CURRENT_TIMESTAMP(3)
             WHERE id = ? AND chat_id = ? AND owner_user_id = ?`,
            [
              input.message.role,
              partsText,
              metadataText,
              input.message.id,
              input.chat_id,
              input.owner_user_id,
            ]
          );
        } else {
          const [sequenceRows] = await connection.execute<
            Array<{ sequence: number } & RowDataPacket>
          >(
            `SELECT sequence
             FROM chat_messages
             WHERE chat_id = ?
             ORDER BY sequence DESC
             LIMIT 1
             FOR UPDATE`,
            [input.chat_id]
          );
          const nextSequence = (sequenceRows[0]?.sequence ?? 0) + 1;
          await connection.execute(
            `INSERT INTO chat_messages
             (id, chat_id, owner_user_id, role, parts_text, metadata_text, sequence, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
            [
              input.message.id,
              input.chat_id,
              input.owner_user_id,
              input.message.role,
              partsText,
              metadataText,
              nextSequence,
            ]
          );
        }

        await connection.execute(
          `UPDATE chat_sessions
           SET updated_at = CURRENT_TIMESTAMP(3)
           WHERE id = ? AND owner_user_id = ?`,
          [input.chat_id, input.owner_user_id]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return;
    }

    const client = await getPgPool().connect();
    try {
      await client.query("BEGIN");
      await this.ensureSessionForUpdatePg(client, input.owner_user_id, input.chat_id);
      const existingResult = await client.query<{ sequence: number }>(
        `SELECT sequence
         FROM chat_messages
         WHERE id = $1 AND chat_id = $2 AND owner_user_id = $3
         LIMIT 1`,
        [input.message.id, input.chat_id, input.owner_user_id]
      );

      if (existingResult.rows[0]) {
        await client.query(
          `UPDATE chat_messages
           SET role = $1, parts_text = $2, metadata_text = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4 AND chat_id = $5 AND owner_user_id = $6`,
          [
            input.message.role,
            partsText,
            metadataText,
            input.message.id,
            input.chat_id,
            input.owner_user_id,
          ]
        );
      } else {
        const sequenceResult = await client.query<{ sequence: number }>(
          `SELECT sequence
           FROM chat_messages
           WHERE chat_id = $1
           ORDER BY sequence DESC
           LIMIT 1
           FOR UPDATE`,
          [input.chat_id]
        );
        const nextSequence = (sequenceResult.rows[0]?.sequence ?? 0) + 1;
        await client.query(
          `INSERT INTO chat_messages
           (id, chat_id, owner_user_id, role, parts_text, metadata_text, sequence, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            input.message.id,
            input.chat_id,
            input.owner_user_id,
            input.message.role,
            partsText,
            metadataText,
            nextSequence,
          ]
        );
      }

      await client.query(
        `UPDATE chat_sessions
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND owner_user_id = $2`,
        [input.chat_id, input.owner_user_id]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateSessionTitle(userId: string, chatId: string, title: string): Promise<void> {
    await this.renameSession(userId, chatId, title);
  }

  async renameSession(userId: string, chatId: string, title: string): Promise<void> {
    if (this.config.dialect === "mysql") {
      await getMySqlPool().execute(
        `UPDATE chat_sessions
         SET title = ?, updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND owner_user_id = ?`,
        [title, chatId, userId]
      );
      return;
    }

    await getPgPool().query(
      `UPDATE chat_sessions
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_user_id = $3`,
      [title, chatId, userId]
    );
  }

  async deleteSession(userId: string, chatId: string): Promise<void> {
    if (this.config.dialect === "mysql") {
      const connection = await getMySqlPool().getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(
          `DELETE FROM chat_messages WHERE chat_id = ? AND owner_user_id = ?`,
          [chatId, userId]
        );
        await connection.execute(`DELETE FROM chat_sessions WHERE id = ? AND owner_user_id = ?`, [
          chatId,
          userId,
        ]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return;
    }

    const client = await getPgPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM chat_messages WHERE chat_id = $1 AND owner_user_id = $2`, [
        chatId,
        userId,
      ]);
      await client.query(`DELETE FROM chat_sessions WHERE id = $1 AND owner_user_id = $2`, [
        chatId,
        userId,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureSessionForUpdateMySql(
    connection: PoolConnection,
    userId: string,
    chatId: string
  ): Promise<void> {
    const [rows] = await connection.execute<MySqlSessionRow[]>(
      `SELECT id
       FROM chat_sessions
       WHERE id = ? AND owner_user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [chatId, userId]
    );
    if (!rows[0]) {
      throw new Error("Chat session does not exist");
    }
  }

  private async ensureSessionForUpdatePg(
    client: PoolClient,
    userId: string,
    chatId: string
  ): Promise<void> {
    const result = await client.query<PgSessionRow>(
      `SELECT id
       FROM chat_sessions
       WHERE id = $1 AND owner_user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [chatId, userId]
    );
    if (!result.rows[0]) {
      throw new Error("Chat session does not exist");
    }
  }
}

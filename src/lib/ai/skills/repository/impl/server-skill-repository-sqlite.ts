import {
  readRepositorySchemaSql,
  splitSqlStatements,
} from "@/lib/ai/session/impl/server-session-repository-schema";
import { knex, type Knex } from "knex";
import { AbstractServerSkillRepository } from "./server-skill-repository-sql-shared";

function resolveSqliteLocation(location: string): string {
  if (location === ":memory:") {
    return location;
  }

  if (location.startsWith("file:")) {
    return new URL(location).pathname;
  }

  return location;
}

export class ServerSkillRepositorySqlite extends AbstractServerSkillRepository {
  private sqliteKnex: Knex | null = null;
  private sqliteReadyPromise: Promise<void> | null = null;

  constructor(private readonly sqlitePath: string) {
    super({
      getDb: () => this.getSqliteKnex(),
      nowExpression: "STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')",
      ensureReady: () => this.ensureSqliteReady(),
    });
  }

  private getSqliteKnex(): Knex {
    if (!this.sqliteKnex) {
      this.sqliteKnex = knex({
        client: "better-sqlite3",
        connection: {
          filename: resolveSqliteLocation(this.sqlitePath),
        },
        useNullAsDefault: true,
      });
    }
    return this.sqliteKnex;
  }

  private async ensureSqliteReady(): Promise<void> {
    if (!this.sqliteReadyPromise) {
      this.sqliteReadyPromise = (async () => {
        const db = this.getSqliteKnex();
        await db.raw("PRAGMA journal_mode = WAL");
        await db.raw("PRAGMA foreign_keys = OFF");
        await db.raw("PRAGMA busy_timeout = 5000");

        for (const statement of splitSqlStatements(readRepositorySchemaSql("sqlite.sql"))) {
          await db.raw(statement);
        }
      })();
    }

    await this.sqliteReadyPromise;
  }
}

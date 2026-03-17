import { readFileSync } from "node:fs";
import { join } from "node:path";
import { knex, type Knex } from "knex";
import { AbstractServerSessionRepository } from "./server-session-repository-sql-shared";

let sqliteSchemaSql: string | null = null;

function resolveSqliteLocation(location: string): string {
  if (location === ":memory:") {
    return location;
  }

  if (location.startsWith("file:")) {
    return new URL(location).pathname;
  }

  return location;
}

function getSqliteSchemaSql(): string {
  if (!sqliteSchemaSql) {
    sqliteSchemaSql = readFileSync(join(process.cwd(), "resources/database/sqlite.sql"), "utf8");
  }

  return sqliteSchemaSql;
}

function splitSqlStatements(schemaSql: string): string[] {
  return schemaSql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export class ServerSessionRepositorySqlite extends AbstractServerSessionRepository {
  private sqliteKnex: Knex | null = null;
  private sqliteReadyPromise: Promise<void> | null = null;

  constructor(private readonly sqlitePath: string) {
    super({
      getDb: () => this.getSqliteKnex(),
      nowExpression: "STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')",
      supportsForUpdate: false,
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

        for (const statement of splitSqlStatements(getSqliteSchemaSql())) {
          await db.raw(statement);
        }
      })();
    }

    await this.sqliteReadyPromise;
  }
}

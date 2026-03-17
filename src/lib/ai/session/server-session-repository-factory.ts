import type { SessionRepositoryType } from "../chat-types";
import { ServerSessionRepositoryMySql } from "./impl/server-session-repository-mysql";
import { ServerSessionRepositoryNoop } from "./impl/server-session-repository-noop";
import { ServerSessionRepositoryPg } from "./impl/server-session-repository-pg";
import { ServerSessionRepositorySqlite } from "./impl/server-session-repository-sqlite";
import type { ServerSessionRepository } from "./server-session-repository";

type ServerRepositoryDialect = "mysql" | "postgres" | "sqlite";
type ServerRepositoryConfig = {
  dialect: ServerRepositoryDialect;
  url: string;
};

// 30 days
const DEFAULT_RETENTION_DAYS = 30;

// 6 Hours
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const noopServerSessionRepository = new ServerSessionRepositoryNoop();
let mySqlServerSessionRepository: ServerSessionRepositoryMySql | null = null;
let pgServerSessionRepository: ServerSessionRepositoryPg | null = null;
let sqliteServerSessionRepository: ServerSessionRepositorySqlite | null = null;
let sessionCleanupTimerStarted = false;

function getSessionRetentionDays(): number {
  const parsed = Number.parseInt(process.env.CHAT_SESSION_REPOSITORY_RETENTION_DAYS ?? "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }
  return parsed;
}

function startSessionCleanupTimer(repository: ServerSessionRepository) {
  if (sessionCleanupTimerStarted) {
    return;
  }

  sessionCleanupTimerStarted = true;
  const runCleanup = async () => {
    const retentionDays = getSessionRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    await repository.cleanupExpiredSessions(cutoff);
  };

  void runCleanup();
  const timer = setInterval(() => {
    void runCleanup();
  }, CLEANUP_INTERVAL_MS);

  timer.unref?.();
}

export function getServerSessionRepositoryConfig(): ServerRepositoryConfig | null {
  const mysqlUrl = process.env.CHAT_SESSION_REPOSITORY_MYSQL_URL;
  const postgresUrl = process.env.CHAT_SESSION_REPOSITORY_POSTGRES_URL;
  const sqlitePath = process.env.CHAT_SESSION_REPOSITORY_SQLITE_PATH;

  if (mysqlUrl) {
    return { dialect: "mysql", url: mysqlUrl };
  }

  if (postgresUrl) {
    return { dialect: "postgres", url: postgresUrl };
  }

  if (sqlitePath) {
    return { dialect: "sqlite", url: sqlitePath };
  }

  return null;
}

/**
 * Resolves effective session storage mode.
 *
 * Rules:
 * - no remote DB config -> local
 * - remote DB configured and userId provided -> local for anonymous users, remote otherwise
 */
export function getSessionRepositoryType(userId: string | null): SessionRepositoryType {
  if (!getServerSessionRepositoryConfig()) {
    return "local";
  }

  const normalizedUserId = userId ?? null;
  const isAnonymous = !normalizedUserId && process.env.ALLOW_ANONYMOUS_USER === "true";

  return isAnonymous ? "local" : "remote";
}

function getConfiguredSessionRepositoryType(): SessionRepositoryType {
  return getServerSessionRepositoryConfig() ? "remote" : "local";
}

export function getServerSessionRepository(): ServerSessionRepository {
  if (getConfiguredSessionRepositoryType() === "local") {
    return noopServerSessionRepository;
  }

  const config = getServerSessionRepositoryConfig();
  if (!config) {
    return noopServerSessionRepository;
  }

  if (config.dialect === "mysql") {
    if (!mySqlServerSessionRepository) {
      mySqlServerSessionRepository = new ServerSessionRepositoryMySql(config.url);
    }
    startSessionCleanupTimer(mySqlServerSessionRepository);
    return mySqlServerSessionRepository;
  }

  if (config.dialect === "postgres") {
    if (!pgServerSessionRepository) {
      pgServerSessionRepository = new ServerSessionRepositoryPg(config.url);
    }
    startSessionCleanupTimer(pgServerSessionRepository);
    return pgServerSessionRepository;
  }

  if (!sqliteServerSessionRepository) {
    sqliteServerSessionRepository = new ServerSessionRepositorySqlite(config.url);
  }
  startSessionCleanupTimer(sqliteServerSessionRepository);

  return sqliteServerSessionRepository;
}

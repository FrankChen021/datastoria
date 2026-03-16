import { getServerChatPersistenceMode } from "./chat-persistence-config";
import { NoopServerSessionRepository } from "./noop-server-session-repository";
import type { ServerSessionRepository } from "./server-session-repository";
import { SqlServerSessionRepository } from "./sql-server-session-repository";

const noopServerSessionRepository = new NoopServerSessionRepository();
let sqlServerSessionRepository: SqlServerSessionRepository | null = null;

export function getServerSessionRepository(): ServerSessionRepository {
  if (getServerChatPersistenceMode() === "local") {
    return noopServerSessionRepository;
  }

  if (!sqlServerSessionRepository) {
    sqlServerSessionRepository = new SqlServerSessionRepository();
  }

  return sqlServerSessionRepository;
}

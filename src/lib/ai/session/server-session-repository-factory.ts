import { ServerSessionRepositoryMySql } from "./impl/server-session-repository-mysql";
import { ServerSessionRepositoryNoop } from "./impl/server-session-repository-noop";
import type { ServerSessionRepository } from "./server-session-repository";
import { getSessionRepositoryType } from "./server-session-repository-config";

const noopServerSessionRepository = new ServerSessionRepositoryNoop();
let sqlServerSessionRepository: ServerSessionRepositoryMySql | null = null;

export function getServerSessionRepository(): ServerSessionRepository {
  if (getSessionRepositoryType() === "local") {
    return noopServerSessionRepository;
  }

  if (!sqlServerSessionRepository) {
    sqlServerSessionRepository = new ServerSessionRepositoryMySql();
  }

  return sqlServerSessionRepository;
}

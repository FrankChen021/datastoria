import { getServerSessionRepositoryConfig } from "@/lib/ai/session/server-session-repository-factory";
import { ServerSkillRepositoryMySql } from "./impl/server-skill-repository-mysql";
import { ServerSkillRepositoryNoop } from "./impl/server-skill-repository-noop";
import { ServerSkillRepositoryPg } from "./impl/server-skill-repository-pg";
import { ServerSkillRepositorySqlite } from "./impl/server-skill-repository-sqlite";
import type { ServerSkillRepository } from "./server-skill-repository";

const noopServerSkillRepository = new ServerSkillRepositoryNoop();
let mySqlServerSkillRepository: ServerSkillRepositoryMySql | null = null;
let pgServerSkillRepository: ServerSkillRepositoryPg | null = null;
let sqliteServerSkillRepository: ServerSkillRepositorySqlite | null = null;

export function isSkillEditingEnabled(): boolean {
  return getServerSessionRepositoryConfig() !== null;
}

export function getServerSkillRepository(): ServerSkillRepository {
  const config = getServerSessionRepositoryConfig();
  if (!config) {
    return noopServerSkillRepository;
  }

  if (config.dialect === "mysql") {
    if (!mySqlServerSkillRepository) {
      mySqlServerSkillRepository = new ServerSkillRepositoryMySql(config.url);
    }
    return mySqlServerSkillRepository;
  }

  if (config.dialect === "postgres") {
    if (!pgServerSkillRepository) {
      pgServerSkillRepository = new ServerSkillRepositoryPg(config.url);
    }
    return pgServerSkillRepository;
  }

  if (!sqliteServerSkillRepository) {
    sqliteServerSkillRepository = new ServerSkillRepositorySqlite(config.url);
  }
  return sqliteServerSkillRepository;
}

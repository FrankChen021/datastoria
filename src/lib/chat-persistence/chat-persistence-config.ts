export type ChatPersistenceMode = "local" | "remote";
export type ChatPersistenceDialect = "mysql" | "postgres";

export type ChatPersistenceDatabaseConfig = {
  dialect: ChatPersistenceDialect;
  url: string;
};

export function getChatPersistenceDatabaseConfig(): ChatPersistenceDatabaseConfig | null {
  const explicitDialect = process.env.CHAT_PERSISTENCE_DIALECT;
  const sharedUrl = process.env.CHAT_PERSISTENCE_DATABASE_URL;
  const mysqlUrl = process.env.CHAT_PERSISTENCE_MYSQL_URL;
  const postgresUrl = process.env.CHAT_PERSISTENCE_POSTGRES_URL;

  if (mysqlUrl) {
    return { dialect: "mysql", url: mysqlUrl };
  }

  if (postgresUrl) {
    return { dialect: "postgres", url: postgresUrl };
  }

  if (sharedUrl && explicitDialect === "mysql") {
    return { dialect: "mysql", url: sharedUrl };
  }

  if (sharedUrl && (explicitDialect === "postgres" || explicitDialect === "postgresql")) {
    return { dialect: "postgres", url: sharedUrl };
  }

  return null;
}

export function getServerChatPersistenceMode(): ChatPersistenceMode {
  return getChatPersistenceDatabaseConfig() ? "remote" : "local";
}

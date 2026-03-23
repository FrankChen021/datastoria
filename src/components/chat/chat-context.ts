import type { Connection } from "@/lib/connection/connection";

export interface DatabaseContext {
  database?: string;
  tables?: Array<{
    name: string;
    columns: Array<{ name: string; type: string }> | string[];
    totalColumns?: number;
  }>;
  clusterName?: string;
  serverVersion?: string;
  clickHouseUser?: string;
}

export function hasDatabaseContextFacts(context?: DatabaseContext): boolean {
  return Boolean(context?.clusterName || context?.serverVersion || context?.clickHouseUser);
}

export function formatDatabaseContextFacts(context?: DatabaseContext): string {
  if (!context) {
    return "";
  }

  return [
    "Database context facts:",
    `- Cluster name: ${context.clusterName ?? "unknown"}`,
    `- Server version: ${context.serverVersion ?? "unknown"}`,
    `- ClickHouse user: ${context.clickHouseUser ?? "unknown"}`,
    "Use these facts only when they materially change the answer. Do not infer missing values.",
  ].join("\n");
}

export function getDatabaseContextFromConnection(
  connection?: Pick<Connection, "cluster" | "metadata"> | null
): DatabaseContext | undefined {
  if (!connection) {
    return undefined;
  }

  const context: DatabaseContext = {
    clusterName: connection.cluster?.trim() || undefined,
    serverVersion: connection.metadata.serverVersion?.trim() || undefined,
    clickHouseUser: connection.metadata.internalUser?.trim() || undefined,
  };

  return hasDatabaseContextFacts(context) ? context : undefined;
}

/**
 * Context builder function type
 */
export type BuildContextFn = () => DatabaseContext | undefined;

export class ChatContext {
  private static builder: BuildContextFn | undefined;

  /**
   * Set the context builder function
   */
  static setBuilder(builder: BuildContextFn) {
    ChatContext.builder = builder;
  }

  /**
   * Get the current context using the builder
   */
  static build(): DatabaseContext | undefined {
    return ChatContext.builder?.();
  }
}

import { Dashboards } from "./dashboards";
import { DistributedDDLQueue } from "./distributed-ddl-queue";
import { PartLog } from "./part-log";
import { Processes } from "./processes";
import { QueryLog } from "./query-log";
import { QueryViewsLog } from "./query-views-log";

/**
 * Type definition for a system table tab entry
 */
export type SystemTableTabEntry = {
  component: React.ComponentType<{ database: string; table: string }>;
};

/**
 * Registry for custom system table rendering components
 * Key: table name (without database, e.g., "dashboards" not "system.dashboards")
 * Value: tab entry
 */
export const SYSTEM_TABLE_REGISTRY = new Map<string, SystemTableTabEntry>([
  ["dashboards", { component: Dashboards }],
  ["distributed_ddl_queue", { component: DistributedDDLQueue }],
  ["query_log", { component: QueryLog }],
  ["query_views_log", { component: QueryViewsLog }],
  ["part_log", { component: PartLog }],
  ["processes", { component: Processes }],
]);

function normalizeSystemTableName(tableName: string): string {
  // e.g. query_log_0, part_log_0, ...
  if (/^query_log_\d+$/.test(tableName)) {
    return "query_log";
  } else if (/^part_log_\d+$/.test(tableName)) {
    return "part_log";
  }
  return tableName;
}

/**
 * Get custom tabs for a system table
 * @param tableName - The table name without database prefix (e.g., "dashboards")
 * @returns Tab entry, or undefined if not found
 */
export function getSystemTableTabs(tableName: string): SystemTableTabEntry | undefined {
  return SYSTEM_TABLE_REGISTRY.get(normalizeSystemTableName(tableName));
}

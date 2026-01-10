import SystemTableDashboards from "./system-table-dashboards";
import SystemTableDistributedDDLQueue from "./system-table-distributed-ddl-queue";
import SystemTableQueryLog from "./system-table-query-log";

/**
 * Type definition for a system table tab entry
 * Tuple where:
 * - 1st element: display text of the tab
 * - 2nd element: the component to render
 */
export type SystemTableTabEntry = [
  string,
  React.ComponentType<{ database: string; table: string }>,
];

/**
 * Registry for custom system table rendering components
 * Key: table name (without database, e.g., "dashboards" not "system.dashboards")
 * Value: list of tuples where 1st element is display text, 2nd element is the component
 */
export const SYSTEM_TABLE_REGISTRY = new Map<string, SystemTableTabEntry[]>([
  ["dashboards", [["Dashboard", SystemTableDashboards]]],
  ["distributed_ddl_queue", [["DDL Queue", SystemTableDistributedDDLQueue]]],
  ["query_log", [["Query Log", SystemTableQueryLog]]],
]);

function normalizeSystemTableName(tableName: string): string {
  // e.g. query_log_0, query_log_1, ...
  if (/^query_log_\d+$/.test(tableName)) {
    return "query_log";
  }
  return tableName;
}

/**
 * Get custom tabs for a system table
 * @param tableName - The table name without database prefix (e.g., "dashboards")
 * @returns Array of tab entries, or undefined if not found
 */
export function getSystemTableTabs(tableName: string): SystemTableTabEntry[] | undefined {
  return SYSTEM_TABLE_REGISTRY.get(normalizeSystemTableName(tableName));
}

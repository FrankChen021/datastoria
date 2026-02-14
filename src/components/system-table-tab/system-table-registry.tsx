import { Dashboards } from "./dashboards";
import { DistributedDDLQueue } from "./distributed-ddl-queue";
import { OpenTelemetrySpanLog } from "./opentelemetry-span-log";
import { PartLog } from "./part-log";
import { Processes } from "./processes";
import { QueryLog } from "./query-log";
import { QueryViewsLog } from "./query-views-log";
import { Zookeeper } from "./zookeeper";

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
  ["opentelemetry_span_log", { component: OpenTelemetrySpanLog }],
  ["query_log", { component: QueryLog }],
  ["query_views_log", { component: QueryViewsLog }],
  ["part_log", { component: PartLog }],
  ["processes", { component: Processes }],
  ["zookeeper", { component: Zookeeper }],
]);

function normalizeSystemTableName(tableName: string): string {
  // e.g. query_log_0, part_log_0, ...
  if (/^query_log_\d+$/.test(tableName)) {
    return "query_log";
  } else if (/^part_log_\d+$/.test(tableName)) {
    return "part_log";
  } else if (/^opentelemetry_span_log_\d+$/.test(tableName)) {
    return "opentelemetry_span_log";
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

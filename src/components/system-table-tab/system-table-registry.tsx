import dynamic from "next/dynamic";
import type React from "react";

/**
 * Type definition for a system table tab entry
 */
export type SystemTableTabEntry = {
  component: React.ComponentType<{ database: string; table: string }>;
};

/**
 * Registry for custom system table rendering components.
 * Each entry is lazily loaded via next/dynamic so that heavy dependencies
 * (ECharts, @xyflow/react, etc.) are excluded from the initial bundle and
 * are only fetched when the user actually opens the relevant system table tab.
 *
 * Key: table name (without database, e.g., "dashboards" not "system.dashboards")
 */
export const SYSTEM_TABLE_REGISTRY = new Map<string, SystemTableTabEntry>([
  [
    "dashboards",
    {
      component: dynamic(() => import("./dashboards").then((m) => m.Dashboards), {
        ssr: false,
      }),
    },
  ],
  [
    "distributed_ddl_queue",
    {
      component: dynamic(
        () => import("./distributed-ddl-queue").then((m) => m.DistributedDDLQueue),
        { ssr: false }
      ),
    },
  ],
  [
    "opentelemetry_span_log",
    {
      component: dynamic(
        () => import("./opentelemetry-span-log").then((m) => m.OpenTelemetrySpanLog),
        { ssr: false }
      ),
    },
  ],
  [
    "query_log",
    {
      component: dynamic(() => import("./query-log").then((m) => m.QueryLog), {
        ssr: false,
      }),
    },
  ],
  [
    "query_views_log",
    {
      component: dynamic(() => import("./query-views-log").then((m) => m.QueryViewsLog), {
        ssr: false,
      }),
    },
  ],
  [
    "part_log",
    {
      component: dynamic(() => import("./part-log").then((m) => m.PartLog), {
        ssr: false,
      }),
    },
  ],
  [
    "processes",
    {
      component: dynamic(() => import("./processes").then((m) => m.Processes), {
        ssr: false,
      }),
    },
  ],
  [
    "zookeeper",
    {
      component: dynamic(() => import("./zookeeper").then((m) => m.Zookeeper), {
        ssr: false,
      }),
    },
  ],
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

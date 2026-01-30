/**
 * Find Expensive Queries Tool
 *
 * Discovers expensive queries from system.query_log by resource metric.
 * Used when user asks to find/optimize heavy queries without providing specific SQL or query_id.
 */
import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import { SqlUtils } from "@/lib/sql-utils";
import type { ToolExecutor } from "./client-tool-types";

const METRIC_CONFIG = {
  cpu: {
    column: "ProfileEvents['OSCPUVirtualTimeMicroseconds']",
    label: "CPU Time (μs)",
    formatValue: (v: number) => `${(v / 1_000_000).toFixed(2)}s`,
  },
  memory: {
    column: "memory_usage",
    label: "Memory",
    formatValue: (v: number) => {
      if (v >= 1_073_741_824) return `${(v / 1_073_741_824).toFixed(2)} GB`;
      if (v >= 1_048_576) return `${(v / 1_048_576).toFixed(2)} MB`;
      return `${(v / 1024).toFixed(2)} KB`;
    },
  },
  disk: {
    column: "read_bytes",
    label: "Disk Read",
    formatValue: (v: number) => {
      if (v >= 1_073_741_824) return `${(v / 1_073_741_824).toFixed(2)} GB`;
      if (v >= 1_048_576) return `${(v / 1_048_576).toFixed(2)} MB`;
      return `${(v / 1024).toFixed(2)} KB`;
    },
  },
  duration: {
    column: "query_duration_ms",
    label: "Duration",
    formatValue: (v: number) => {
      if (v >= 60000) return `${(v / 60000).toFixed(2)} min`;
      if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
      return `${v}ms`;
    },
  },
} as const;

export type FindExpensiveQueriesInput = {
  metric: "cpu" | "memory" | "disk" | "duration";
  limit?: number;
  time_window?: number;
  time_range?: {
    from: string;
    to: string;
  };
};

export type ExpensiveQueryResult = {
  rank: number;
  query_id: string;
  user: string;
  sql_preview: string;
  metric_value: number;
  metric_formatted: string;
  duration_ms: number;
  memory_bytes: number;
  read_rows: number;
  read_bytes: number;
  event_time: string;
};

export type FindExpensiveQueriesOutput = {
  success: boolean;
  message?: string;
  metric: string;
  metric_label: string;
  time_window?: number;
  time_range?: {
    from: string;
    to: string;
  };
  time_description: string;
  queries: ExpensiveQueryResult[];
};

/**
 * Executor for find_expensive_queries tool
 */
/**
 * Build time filter SQL clause and description
 */
function buildTimeFilter(
  time_window?: number,
  time_range?: { from: string; to: string }
): { filter: string; description: string; window?: number; range?: { from: string; to: string } } {
  if (time_range?.from && time_range?.to) {
    return {
      filter: `event_date >= toDate('${time_range.from}') AND event_date <= toDate('${time_range.to}') AND event_time >= toDateTime('${time_range.from}') AND event_time <= toDateTime('${time_range.to}')`,
      description: `${time_range.from} to ${time_range.to}`,
      range: time_range,
    };
  }

  const minutes = time_window ?? 60;
  return {
    filter: `event_date >= toDate(now() - INTERVAL ${minutes} MINUTE) AND event_time >= now() - INTERVAL ${minutes} MINUTE`,
    description: `last ${minutes} minutes`,
    window: minutes,
  };
}

export const findExpensiveQueriesExecutor: ToolExecutor<
  FindExpensiveQueriesInput,
  FindExpensiveQueriesOutput
> = async (input, connection) => {
  const { metric, limit = 3, time_window, time_range } = input;
  const config = METRIC_CONFIG[metric];
  const timeInfo = buildTimeFilter(time_window, time_range);

  const sql = `
    SELECT
      query_id,
      user,
      substring(query, 1, 300) AS sql_preview,
      ${config.column} AS metric_value,
      query_duration_ms,
      memory_usage,
      read_rows,
      read_bytes,
      event_time,
      tables
    FROM system.query_log
    WHERE
      type = 'QueryFinish'
      AND ${timeInfo.filter}
      AND query_kind = 'Select'
      AND not has(databases, 'system')
    ORDER BY metric_value DESC
    LIMIT ${limit}
  `;

  try {
    const { response } = connection.query(sql, { default_format: "JSONCompact" });
    const rows = (await response).data.json<JSONCompactFormatResponse>().data;

    if (!rows?.length) {
      return {
        success: false,
        message: `No queries found in time range: ${timeInfo.description}.`,
        metric,
        metric_label: config.label,
        time_window: timeInfo.window,
        time_range: timeInfo.range,
        time_description: timeInfo.description,
        queries: [],
      };
    }

    // JSONCompact format: rows are arrays with column order matching SELECT clause
    // [query_id, user, sql_preview, metric_value, query_duration_ms, memory_usage, read_rows, read_bytes, event_time, tables]
    return {
      success: true,
      metric,
      metric_label: config.label,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      time_description: timeInfo.description,
      queries: rows.map((row: unknown[], idx: number) => {
        let sqlPreview = row[2] as string;
        const tables = row[9] as string[] | undefined;

        // Qualify table names in SQL preview if tables array is available
        console.log("tables", tables);
        console.log("sqlPreview", sqlPreview);
        if (tables && tables.length > 0) {
          sqlPreview = SqlUtils.qualifyTableNames(sqlPreview, tables);
        }

        return {
          rank: idx + 1,
          query_id: row[0] as string,
          user: row[1] as string,
          sql_preview: sqlPreview,
          metric_value: row[3] as number,
          metric_formatted: config.formatValue(row[3] as number),
          duration_ms: row[4] as number,
          memory_bytes: row[5] as number,
          read_rows: row[6] as number,
          read_bytes: row[7] as number,
          event_time: String(row[8]),
        };
      }),
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to query system.query_log: ${error instanceof Error ? error.message : String(error)}`,
      metric,
      metric_label: config.label,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      time_description: timeInfo.description,
      queries: [],
    };
  }
};

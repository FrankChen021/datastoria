/**
 * Find Expensive Queries Tool
 *
 * Discovers expensive queries from system.query_log by resource metric.
 * Used when user asks to find/optimize heavy queries without providing specific SQL or query_id.
 */
import { QueryError, type JSONCompactFormatResponse } from "@/lib/connection/connection";
import { SqlUtils } from "@/lib/sql-utils";
import type { ToolExecutor } from "./client-tool-types";

const METRIC_CONFIG = {
  cpu: {
    column: "ProfileEvents['OSCPUVirtualTimeMicroseconds']",
    label: "CPU Time (μs)",
  },
  memory: {
    column: "memory_usage",
    label: "Memory (bytes)",
  },
  disk: {
    column: "read_bytes",
    label: "Disk Read (bytes)",
  },
  duration: {
    column: "query_duration_ms",
    label: "Duration (ms)",
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
  normalized_query_hash: string;
  query_id: string;
  user: string;
  sql_preview: string;
  metric_value: number;
  duration_ms: number;
  memory_bytes: number;
  read_rows: number;
  read_bytes: number;
  last_execution_time: string;
  execution_count: number;
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
  queries: ExpensiveQueryResult[];
};

/**
 * Build time filter SQL clause
 */
function toTimeFilter(
  time_window?: number,
  time_range?: { from: string; to: string }
): { filter: string; window?: number; range?: { from: string; to: string } } {
  if (time_range?.from && time_range?.to) {
    return {
      filter: `event_date >= toDate('${time_range.from}') AND event_date <= toDate('${time_range.to}') AND event_time >= toDateTime('${time_range.from}') AND event_time <= toDateTime('${time_range.to}')`,
      range: time_range,
    };
  }

  const minutes = time_window ?? 60;
  return {
    filter: `event_date >= toDate(now() - INTERVAL ${minutes} MINUTE) AND event_time >= now() - INTERVAL ${minutes} MINUTE`,
    window: minutes,
  };
}

export const findExpensiveQueriesExecutor: ToolExecutor<
  FindExpensiveQueriesInput,
  FindExpensiveQueriesOutput
> = async (input, connection) => {
  const { metric, limit = 3, time_window, time_range } = input;
  const config = METRIC_CONFIG[metric];
  const timeInfo = toTimeFilter(time_window, time_range);

  const sql = `
    SELECT
      normalized_query_hash,
      any(query_id) AS query_id,
      any(user) AS user,
      substring(any(query), 1, 300) AS sql_preview,
      sum(${config.column}) AS metric_value,
      sum(query_duration_ms) AS total_duration_ms,
      sum(memory_usage) AS total_memory_usage,
      sum(read_rows) AS total_read_rows,
      sum(read_bytes) AS total_read_bytes,
      max(event_time) AS last_execution_time,
      any(tables) AS tables,
      count() AS execution_count
    FROM system.query_log
    WHERE
      type = 'QueryFinish'
      AND ${timeInfo.filter}
      AND query_kind = 'Select'
      AND not has(databases, 'system')
    GROUP BY normalized_query_hash
    ORDER BY metric_value DESC
    LIMIT ${limit}
  `;

  try {
    const { response } = connection.query(sql, { default_format: "JSONCompact" });
    const rows = (await response).data.json<JSONCompactFormatResponse>().data;

    if (!rows?.length) {
      return {
        success: false,
        message: "No queries found in the specified time range.",
        metric,
        metric_label: config.label,
        time_window: timeInfo.window,
        time_range: timeInfo.range,
        queries: [],
      };
    }

    // JSONCompact format: rows are arrays with column order matching SELECT clause
    // [normalized_query_hash, query_id, user, sql_preview, metric_value, query_duration_ms, memory_usage, read_rows, read_bytes, event_time, tables, execution_count]
    return {
      success: true,
      metric,
      metric_label: config.label,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      queries: rows.map((row: unknown[], idx: number) => {
        let sqlPreview = row[3] as string;
        const tables = row[10] as string[] | undefined;

        // Qualify table names in SQL preview if tables array is available
        if (tables && tables.length > 0) {
          sqlPreview = SqlUtils.qualifyTableNames(sqlPreview, tables);
        }

        return {
          rank: idx + 1,
          normalized_query_hash: row[0] as string,
          query_id: row[1] as string,
          user: row[2] as string,
          sql_preview: sqlPreview,
          metric_value: row[4] as number,
          duration_ms: row[5] as number,
          memory_bytes: row[6] as number,
          read_rows: row[7] as number,
          read_bytes: row[8] as number,
          last_execution_time: String(row[9]),
          execution_count: row[11] as number,
        };
      }),
    };
  } catch (error) {
    let errorMessage: string;
    if (error instanceof QueryError && error.data) {
      errorMessage = error.data;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    return {
      success: false,
      message: `Failed to query system.query_log: ${errorMessage}`,
      metric,
      metric_label: config.label,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      queries: [],
    };
  }
};

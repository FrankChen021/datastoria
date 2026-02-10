import { QueryError, type JSONCompactFormatResponse } from "@/lib/connection/connection";
import type { ToolExecutor } from "./client-tool-types";

export type HistoricalMetricType = "memory" | "disk" | "query_latency";

export type AnalyzeClusterMetricsInput = {
  metric_type: HistoricalMetricType;
  /**
   * Lookback window in minutes (e.g. 60 = last 60 minutes).
   * If both time_window and time_range are provided, time_range takes precedence.
   */
  time_window?: number;
  /**
   * Absolute time range in ISO 8601 format.
   */
  time_range?: {
    from: string;
    to: string;
  };
  /**
   * Aggregation granularity in minutes. Default: 5.
   */
  granularity_minutes?: number;
};

export type TimeSeriesPoint = {
  timestamp: string;
  value: number;
};

export type AnalyzeClusterMetricsOutput = {
  success: boolean;
  metric_type: HistoricalMetricType;
  time_window?: number;
  time_range?: {
    from: string;
    to: string;
  };
  granularity_minutes: number;
  series: TimeSeriesPoint[];
  summary: {
    min: number | null;
    max: number | null;
    avg: number | null;
    trend: "up" | "down" | "flat" | "unknown";
  };
  message?: string;
  error?: string;
};

function buildTimeFilterClause(
  time_window?: number,
  time_range?: { from: string; to: string }
): {
  whereClause: string;
  window?: number;
  range?: { from: string; to: string };
} {
  if (time_range?.from && time_range?.to) {
    return {
      whereClause: `event_time >= toDateTime('${time_range.from}') AND event_time <= toDateTime('${time_range.to}')`,
      range: time_range,
    };
  }

  const minutes = time_window ?? 60;
  return {
    whereClause: `event_time >= now() - INTERVAL ${minutes} MINUTE`,
    window: minutes,
  };
}

async function queryJsonCompact(
  sql: string,
  connection: Parameters<ToolExecutor<AnalyzeClusterMetricsInput, AnalyzeClusterMetricsOutput>>[1]
): Promise<JSONCompactFormatResponse> {
  const { response } = connection.query(sql, { default_format: "JSONCompact" });
  const apiResponse = await response;
  return apiResponse.data.json<JSONCompactFormatResponse>();
}

function computeSummary(points: TimeSeriesPoint[]): AnalyzeClusterMetricsOutput["summary"] {
  if (points.length === 0) {
    return {
      min: null,
      max: null,
      avg: null,
      trend: "unknown",
    };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;

  for (const point of points) {
    const v = point.value;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }

  const avg = sum / points.length;

  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  const delta = last - first;
  const threshold = Math.max(Math.abs(first), 1) * 0.1; // 10% relative change

  let trend: "up" | "down" | "flat" | "unknown" = "unknown";
  if (Math.abs(delta) < threshold) {
    trend = "flat";
  } else if (delta > 0) {
    trend = "up";
  } else if (delta < 0) {
    trend = "down";
  }

  return {
    min,
    max,
    avg,
    trend,
  };
}

export const analyzeClusterMetricsExecutor: ToolExecutor<
  AnalyzeClusterMetricsInput,
  AnalyzeClusterMetricsOutput
> = async (input, connection) => {
  const { metric_type } = input;
  const granularityMinutes =
    input.granularity_minutes && input.granularity_minutes > 0 ? input.granularity_minutes : 5;

  const timeInfo = buildTimeFilterClause(input.time_window, input.time_range);

  // Currently we implement memory trends using system.metric_log.
  // Other metric types will return a friendly message indicating limited support.
  if (metric_type !== "memory") {
    return {
      success: false,
      metric_type,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      granularity_minutes: granularityMinutes,
      series: [],
      summary: {
        min: null,
        max: null,
        avg: null,
        trend: "unknown",
      },
      message:
        "Historical analysis is currently implemented only for metric_type='memory'. Other metrics will be added in future versions.",
    };
  }

  try {
    const sql = `
SELECT
  toStartOfInterval(event_time, INTERVAL ${granularityMinutes} MINUTE) AS bucket_start,
  avgIf(value, metric = 'MemoryTracking') AS avg_memory_bytes
FROM {clusterAllReplicas:system.metric_log}
WHERE
  metric = 'MemoryTracking'
  AND ${timeInfo.whereClause}
GROUP BY bucket_start
ORDER BY bucket_start
SETTINGS max_execution_time = 0
`;

    const data = await queryJsonCompact(sql, connection);
    const rows = data.data || [];

    const series: TimeSeriesPoint[] = rows.map((row) => {
      const [bucketStart, avgMemory] = row as (string | number)[];
      return {
        timestamp: String(bucketStart),
        value: Number(avgMemory) || 0,
      };
    });

    const summary = computeSummary(series);

    return {
      success: true,
      metric_type,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      granularity_minutes: granularityMinutes,
      series,
      summary,
      message:
        "Memory usage trend derived from system.metric_log (MemoryTracking). Use summary.trend to see overall direction.",
    };
  } catch (error) {
    const message =
      error instanceof QueryError && error.data
        ? typeof error.data === "string"
          ? error.data
          : JSON.stringify(error.data)
        : error instanceof Error
          ? error.message
          : String(error);

    return {
      success: false,
      metric_type,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      granularity_minutes: granularityMinutes,
      series: [],
      summary: {
        min: null,
        max: null,
        avg: null,
        trend: "unknown",
      },
      error: message,
    };
  }
};

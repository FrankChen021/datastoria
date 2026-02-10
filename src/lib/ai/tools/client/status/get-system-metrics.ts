import { QueryError, type JSONCompactFormatResponse } from "@/lib/connection/connection";
import type { ToolExecutor } from "../client-tool-types";

export type HistoricalMetricType =
  | "replication"
  | "disk"
  | "memory"
  | "merges"
  | "mutations"
  | "parts"
  | "errors"
  | "connections"
  | "query_latency";

export type GetSystemMetricsInput = {
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

export type GetSystemMetricsOutput = {
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

type MetricDefinition = {
  // Expression evaluated per (event_time, host_name), then averaged by time bucket.
  innerMetricExpression: string;
  message: string;
};

const METRIC_DEFINITIONS: Record<HistoricalMetricType, MetricDefinition> = {
  replication: {
    innerMetricExpression: "sum(ProfileEvent_ReplicatedPartFailedFetches)",
    message:
      "Replication trend derived from system.metric_log (ProfileEvent_ReplicatedPartFailedFetches). Higher values indicate more failed fetch activity.",
  },
  disk: {
    innerMetricExpression: "sum(ProfileEvent_OSReadBytes) + sum(ProfileEvent_OSWriteBytes)",
    message:
      "Disk I/O trend derived from system.metric_log (ProfileEvent_OSReadBytes + ProfileEvent_OSWriteBytes).",
  },
  memory: {
    innerMetricExpression: "max(CurrentMetric_MemoryTracking)",
    message:
      "Memory usage trend derived from system.metric_log (CurrentMetric_MemoryTracking). Use summary.trend to see overall direction.",
  },
  merges: {
    innerMetricExpression: "max(CurrentMetric_Merge)",
    message: "Merge pressure trend derived from system.metric_log (CurrentMetric_Merge).",
  },
  mutations: {
    innerMetricExpression: "sum(ProfileEvent_ReplicatedPartMutations)",
    message:
      "Mutation activity trend derived from system.metric_log (ProfileEvent_ReplicatedPartMutations).",
  },
  parts: {
    innerMetricExpression: "sum(ProfileEvent_SelectedParts)",
    message:
      "Part activity trend derived from system.metric_log (ProfileEvent_SelectedParts). This is an activity signal, not direct active part-count inventory.",
  },
  errors: {
    innerMetricExpression: "sum(ProfileEvent_FailedQuery)",
    message: "Error trend derived from system.metric_log (ProfileEvent_FailedQuery).",
  },
  connections: {
    innerMetricExpression:
      "max(CurrentMetric_TCPConnection) + max(CurrentMetric_MySQLConnection) + max(CurrentMetric_HTTPConnection) + max(CurrentMetric_InterserverConnection)",
    message:
      "Connection pressure trend derived from system.metric_log (TCP/MySQL/HTTP/Interserver current connections).",
  },
  query_latency: {
    innerMetricExpression:
      "if(sum(ProfileEvent_Query) = 0, 0, (sum(ProfileEvent_QueryTimeMicroseconds) / sum(ProfileEvent_Query)) / 1000)",
    message:
      "Query latency trend derived from system.metric_log (avg query time from ProfileEvent_QueryTimeMicroseconds / ProfileEvent_Query, in milliseconds).",
  },
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
      whereClause: `event_date >= toDate('${time_range.from}') AND event_date <= toDate('${time_range.to}') AND event_time >= toDateTime('${time_range.from}') AND event_time <= toDateTime('${time_range.to}')`,
      range: time_range,
    };
  }

  const minutes = time_window ?? 60;
  return {
    whereClause: `event_date >= toDate(now() - INTERVAL ${minutes} MINUTE) AND event_time >= now() - INTERVAL ${minutes} MINUTE`,
    window: minutes,
  };
}

async function queryJsonCompact(
  sql: string,
  connection: Parameters<ToolExecutor<GetSystemMetricsInput, GetSystemMetricsOutput>>[1]
): Promise<JSONCompactFormatResponse> {
  const { response } = connection.query(sql, { default_format: "JSONCompact" });
  const apiResponse = await response;
  return apiResponse.data.json<JSONCompactFormatResponse>();
}

function computeSummary(points: TimeSeriesPoint[]): GetSystemMetricsOutput["summary"] {
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

export const getSystemMetrics: ToolExecutor<GetSystemMetricsInput, GetSystemMetricsOutput> = async (
  input,
  connection
) => {
  const { metric_type } = input;
  const granularityMinutes =
    input.granularity_minutes && input.granularity_minutes > 0 ? input.granularity_minutes : 5;

  const timeInfo = buildTimeFilterClause(input.time_window, input.time_range);
  const metricDefinition = METRIC_DEFINITIONS[metric_type];

  try {
    const sql = `
SELECT
  toStartOfInterval(event_time, INTERVAL ${granularityMinutes} MINUTE) AS bucket_start,
  avg(metric_value) AS metric_value
FROM (
  SELECT
    event_time,
    FQDN() AS host_name,
    ${metricDefinition.innerMetricExpression} AS metric_value
  FROM {clusterAllReplicas:system.metric_log}
  WHERE ${timeInfo.whereClause}
  GROUP BY event_time, host_name
)
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
      message: metricDefinition.message,
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

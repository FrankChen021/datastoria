import { QueryError, type JSONCompactFormatResponse } from "@/lib/connection/connection";
import type { ToolExecutor, ToolProgressCallback } from "../client-tool-types";
import {
  getSystemMetrics,
  type GetSystemMetricsOutput,
  type HistoricalMetricType,
} from "./get-system-metrics";

type StatusSeverity = "OK" | "WARNING" | "CRITICAL";
type StatusAnalysisMode = "snapshot" | "windowed";
type StatusCheckCategory =
  | "cpu"
  | "memory"
  | "disk"
  | "select_queries"
  | "insert_queries"
  | "ddl_queries"
  | "parts"
  | "replication"
  | "merges"
  | "mutations"
  | "errors"
  | "connections";

export type GetClusterStatusInput = {
  status_analysis_mode?: StatusAnalysisMode;
  checks?: StatusCheckCategory[];
  verbosity?: "summary" | "detailed";
  thresholds?: {
    disk_warning?: number;
    disk_critical?: number;
    cpu_cores_used_warning?: number;
    cpu_cores_used_critical?: number;
    replication_lag_warning_seconds?: number;
    replication_lag_critical_seconds?: number;
    parts_warning?: number;
    parts_critical?: number;
    query_p95_warning_ms?: number;
    query_p95_critical_ms?: number;
  };
  max_outliers?: number;
  window?: {
    metric_type?: HistoricalMetricType;
    time_window?: number;
    time_range?: {
      from: string;
      to: string;
    };
    granularity_minutes?: number;
  };
};

export type Outlier = {
  node: string;
  details: string;
  metrics: Record<string, number | string | null>;
};

export type HealthCategorySummary = {
  status: StatusSeverity;
  issues: string[];
  metrics: Record<string, number | string | null>;
  outliers?: Outlier[];
};

export type GetClusterStatusOutput = {
  success: boolean;
  status_analysis_mode: StatusAnalysisMode;
  scope: "single_node" | "cluster";
  cluster?: string;
  node_count: number;
  summary: {
    total_nodes: number;
    healthy_nodes: number;
    nodes_with_issues: number;
  };
  categories: Partial<Record<StatusCheckCategory, HealthCategorySummary>>;
  window?: GetSystemMetricsOutput;
  generated_at: string;
  error?: string;
};

function rankSeverity(values: StatusSeverity[]): StatusSeverity {
  if (values.includes("CRITICAL")) return "CRITICAL";
  if (values.includes("WARNING")) return "WARNING";
  return "OK";
}

function limitOutliers<T>(items: T[], maxOutliers: number | undefined): T[] {
  if (!maxOutliers || maxOutliers <= 0) {
    return items;
  }
  return items.slice(0, maxOutliers);
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function buildLogTimeFilter(
  window: GetClusterStatusInput["window"] | undefined,
  defaultMinutes = 15
): { whereClause: string; windowMinutes: number; windowLabel: string } {
  if (window?.time_range?.from && window?.time_range?.to) {
    const from = escapeSqlLiteral(window.time_range.from);
    const to = escapeSqlLiteral(window.time_range.to);
    return {
      whereClause:
        `event_date >= toDate('${from}') AND event_date <= toDate('${to}') ` +
        `AND event_time >= toDateTime('${from}') AND event_time <= toDateTime('${to}')`,
      windowMinutes: window.time_window ?? defaultMinutes,
      windowLabel: `${window.time_range.from} to ${window.time_range.to}`,
    };
  }

  const windowMinutes = window?.time_window ?? defaultMinutes;
  return {
    whereClause:
      `event_date >= toDate(now() - INTERVAL ${windowMinutes} MINUTE) ` +
      `AND event_time >= now() - INTERVAL ${windowMinutes} MINUTE`,
    windowMinutes,
    windowLabel: `${windowMinutes}m`,
  };
}

async function queryJsonCompact(
  sql: string,
  connection: Parameters<ToolExecutor<GetClusterStatusInput, GetClusterStatusOutput>>[1]
): Promise<JSONCompactFormatResponse> {
  const { response } = connection.query(sql, { default_format: "JSONCompact" });
  const apiResponse = await response;
  return apiResponse.data.json<JSONCompactFormatResponse>();
}

type CategoryHandlerContext = {
  connection: Parameters<ToolExecutor<GetClusterStatusInput, GetClusterStatusOutput>>[1];
  window?: GetClusterStatusInput["window"];
  thresholds?: GetClusterStatusInput["thresholds"];
  maxOutliers: number;
  registerObservedNode: (node: string) => void;
  registerIssueNode: (node: string) => void;
};
type CategoryHandler = (context: CategoryHandlerContext) => Promise<HealthCategorySummary>;

type QueryPerformanceCategoryConfig = {
  categoryLabel: string;
  queryKindPredicate: string;
};

async function collectQueryPerformanceCategory(
  {
    connection,
    window,
    thresholds,
    maxOutliers,
    registerObservedNode,
    registerIssueNode,
  }: CategoryHandlerContext,
  config: QueryPerformanceCategoryConfig
): Promise<HealthCategorySummary> {
  const p95WarningMs = thresholds?.query_p95_warning_ms ?? 1000;
  const p95CriticalMs = thresholds?.query_p95_critical_ms ?? 3000;
  const timeFilter = buildLogTimeFilter(window, 15);
  const lookbackMinutes = timeFilter.windowMinutes;
  const data = await queryJsonCompact(
    `
SELECT
  FQDN() AS host_name,
  quantileExactIf(0.95)(query_duration_ms, type = 'QueryFinish') AS p95_ms,
  quantileExactIf(0.99)(query_duration_ms, type = 'QueryFinish') AS p99_ms,
  countIf(type = 'QueryFinish') AS finished_queries,
  countIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AS failed_queries
FROM {clusterAllReplicas:system.query_log}
WHERE ${timeFilter.whereClause}
  AND (${config.queryKindPredicate})
GROUP BY host_name`,
    connection
  );
  const rows = data.data || [];

  let maxP95Ms = 0;
  let maxP99Ms = 0;
  let totalFinished = 0;
  let totalFailed = 0;
  let nodesWithQueryData = 0;
  const outliers: Outlier[] = [];

  for (const row of rows) {
    const [hostName, p95Ms, p99Ms, finishedQueries, failedQueries] = row as (
      | string
      | number
      | null
    )[];
    const nodeName = String(hostName || "");
    registerObservedNode(nodeName);
    const nodeP95 = Number(p95Ms) || 0;
    const nodeP99 = Number(p99Ms) || 0;
    const nodeFinished = Number(finishedQueries) || 0;
    const nodeFailed = Number(failedQueries) || 0;

    if (nodeFinished > 0 || nodeFailed > 0) nodesWithQueryData += 1;
    maxP95Ms = Math.max(maxP95Ms, nodeP95);
    maxP99Ms = Math.max(maxP99Ms, nodeP99);
    totalFinished += nodeFinished;
    totalFailed += nodeFailed;

    const hasIssue = nodeP95 >= p95WarningMs || nodeFailed > 0;
    if (hasIssue) {
      registerIssueNode(nodeName);
      const severity: StatusSeverity =
        nodeP95 >= p95CriticalMs || nodeFailed > 100 ? "CRITICAL" : "WARNING";
      outliers.push({
        node: nodeName,
        details: `${severity} ${config.categoryLabel} performance on ${nodeName}`,
        metrics: {
          p95_query_duration_ms: Number(nodeP95.toFixed(2)),
          p99_query_duration_ms: Number(nodeP99.toFixed(2)),
          queries_per_minute: Number(((nodeFinished + nodeFailed) / lookbackMinutes).toFixed(2)),
          failed_queries: nodeFailed,
        },
      });
    }
  }

  const totalQpm = (totalFinished + totalFailed) / lookbackMinutes;
  const status: StatusSeverity =
    maxP95Ms >= p95CriticalMs || totalFailed > 500
      ? "CRITICAL"
      : maxP95Ms >= p95WarningMs || totalFailed > 0
        ? "WARNING"
        : "OK";

  return {
    status,
    issues:
      status === "OK"
        ? []
        : [
            `${config.categoryLabel} performance degraded over ${timeFilter.windowLabel}: max p95 ${maxP95Ms.toFixed(2)}ms, failed queries ${totalFailed}.`,
          ],
    metrics: {
      max_p95_query_duration_ms: Number(maxP95Ms.toFixed(2)),
      max_p99_query_duration_ms: Number(maxP99Ms.toFixed(2)),
      queries_per_minute: Number(totalQpm.toFixed(2)),
      failed_queries: totalFailed,
      nodes_with_query_data: nodesWithQueryData,
      window_minutes: lookbackMinutes,
    },
    outliers: limitOutliers(
      outliers.sort(
        (a, b) =>
          (Number(b.metrics.p95_query_duration_ms) || 0) -
          (Number(a.metrics.p95_query_duration_ms) || 0)
      ),
      maxOutliers
    ),
  };
}

const STATUS_CATEGORY_HANDLERS: Record<StatusCheckCategory, CategoryHandler> = {
  replication: async ({
    connection,
    thresholds,
    maxOutliers,
    registerObservedNode,
    registerIssueNode,
  }) => {
    const replicationLagWarningSeconds = thresholds?.replication_lag_warning_seconds ?? 60;
    const replicationLagCriticalSeconds = thresholds?.replication_lag_critical_seconds ?? 300;
    const data = await queryJsonCompact(
      `
SELECT
  FQDN() AS host_name,
  ifNull(database, '') AS database,
  ifNull(table, '') AS table,
  ifNull(is_readonly, 0) AS is_readonly,
  ifNull(is_session_expired, 0) AS is_session_expired,
  ifNull(total_replicas, 1) AS total_replicas,
  ifNull(active_replicas, 1) AS active_replicas,
  ifNull(absolute_delay, 0) AS absolute_delay
FROM {clusterAllReplicas:system.replicas}`,
      connection
    );
    const rows = data.data || [];

    let maxLag = 0;
    let laggedReplicas = 0;
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [
        hostName,
        databaseName,
        tableName,
        isReadonly,
        isSessionExpired,
        totalReplicas,
        activeReplicas,
        lagSeconds,
      ] = row as (string | number)[];

      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);

      const lag = Number(lagSeconds) || 0;
      const total = Number(totalReplicas) || 1;
      const active = Number(activeReplicas) || 0;
      const readonly = Number(isReadonly) === 1;
      const sessionExpired = Number(isSessionExpired) === 1;

      if (lag > maxLag) maxLag = lag;

      const hasIssue =
        lag >= replicationLagWarningSeconds || active < total || readonly || sessionExpired;

      if (hasIssue) {
        laggedReplicas += 1;
        registerIssueNode(nodeName);
      }

      if (hasIssue) {
        const severity: StatusSeverity =
          lag >= replicationLagCriticalSeconds || active === 0 || sessionExpired
            ? "CRITICAL"
            : "WARNING";

        outliers.push({
          node: nodeName,
          details: `${severity} replication issue on ${databaseName}.${tableName}`,
          metrics: {
            database: String(databaseName || ""),
            table: String(tableName || ""),
            total_replicas: total,
            active_replicas: active,
            lag_seconds: lag,
            is_readonly: readonly ? 1 : 0,
            is_session_expired: sessionExpired ? 1 : 0,
          },
        });
      }
    }

    const status: StatusSeverity =
      maxLag >= replicationLagCriticalSeconds || laggedReplicas > 0
        ? maxLag >= replicationLagCriticalSeconds
          ? "CRITICAL"
          : "WARNING"
        : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `Found ${laggedReplicas} replicas with lag or issues. Max replication lag: ${maxLag}s.`,
            ],
      metrics: {
        max_replication_lag_seconds: maxLag,
        replicas_with_issues: laggedReplicas,
      },
      outliers: limitOutliers(outliers, maxOutliers),
    };
  },

  disk: async ({
    connection,
    thresholds,
    maxOutliers,
    registerObservedNode,
    registerIssueNode,
  }) => {
    const diskWarning = thresholds?.disk_warning ?? 80;
    const diskCritical = thresholds?.disk_critical ?? 90;
    const data = await queryJsonCompact(
      `
SELECT
  FQDN() AS host_name,
  name,
  path,
  free_space,
  total_space,
  if(total_space = 0, 0, round((total_space - free_space) / total_space * 100, 2)) AS used_percent
FROM {clusterAllReplicas:system.disks}`,
      connection
    );
    const rows = data.data || [];

    let maxUsedPercent = 0;
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [hostName, name, path, freeSpace, totalSpace, usedPercent] = row as (string | number)[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const used = Number(usedPercent) || 0;
      if (used > maxUsedPercent) maxUsedPercent = used;

      if (used >= diskWarning) {
        registerIssueNode(nodeName);
        const severity: StatusSeverity = used >= diskCritical ? "CRITICAL" : "WARNING";
        outliers.push({
          node: `${nodeName}:${String(name || "")}`,
          details: `${severity} disk usage on ${name}`,
          metrics: {
            path: String(path || ""),
            free_space_bytes: Number(freeSpace) || 0,
            total_space_bytes: Number(totalSpace) || 0,
            used_percent: used,
          },
        });
      }
    }

    const status: StatusSeverity =
      maxUsedPercent >= diskCritical
        ? "CRITICAL"
        : maxUsedPercent >= diskWarning
          ? "WARNING"
          : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `Maximum disk usage is ${maxUsedPercent.toFixed(2)}%. Thresholds: warning >= ${diskWarning}%, critical >= ${diskCritical}%.`,
            ],
      metrics: {
        max_disk_used_percent: maxUsedPercent,
        disks_checked: rows.length,
      },
      outliers: limitOutliers(outliers, maxOutliers),
    };
  },

  memory: async ({ connection, maxOutliers, registerObservedNode, registerIssueNode }) => {
    const data = await queryJsonCompact(
      `
SELECT
    FQDN() AS host,
    (SELECT value FROM system.metrics WHERE metric = 'MemoryTracking') AS usedBytes,
    (SELECT value FROM system.asynchronous_metrics WHERE metric = 'OSMemoryTotal') AS totalBytes
FROM {clusterAllReplicas:system.one}
`,
      connection
    );
    const rows = data.data || [];
    const metricsByNode = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const [hostName, usedBytes, totalBytes] = row as (string | number)[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const metricsMap = metricsByNode.get(nodeName) ?? {};
      metricsMap["MemoryTracking"] = Number(usedBytes) || 0;
      metricsMap["MaxMemoryUsage"] = Number(totalBytes) || 0;
      metricsByNode.set(nodeName, metricsMap);
    }

    let worstMemoryUsedPercent = 0;
    let hasKnownMemoryPercent = false;
    const outliers: Outlier[] = [];

    for (const [nodeName, metricsMap] of metricsByNode.entries()) {
      const memoryBytes = metricsMap.MemoryTracking ?? 0;
      const maxMemory = metricsMap.MaxMemoryUsage ?? 0;
      const usedPercent = maxMemory > 0 ? (memoryBytes / maxMemory) * 100 : null;

      if (usedPercent !== null) {
        hasKnownMemoryPercent = true;
        if (usedPercent > worstMemoryUsedPercent) worstMemoryUsedPercent = usedPercent;
      }

      if (usedPercent !== null && usedPercent >= 80) {
        registerIssueNode(nodeName);
        const severity: StatusSeverity = usedPercent >= 90 ? "CRITICAL" : "WARNING";
        outliers.push({
          node: nodeName,
          details: `${severity} memory pressure on ${nodeName}`,
          metrics: {
            memory_tracking_bytes: memoryBytes,
            max_memory_usage_bytes: maxMemory,
            memory_used_percent: usedPercent,
          },
        });
      }
    }

    const status: StatusSeverity =
      hasKnownMemoryPercent && worstMemoryUsedPercent >= 90
        ? "CRITICAL"
        : hasKnownMemoryPercent && worstMemoryUsedPercent >= 80
          ? "WARNING"
          : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `Worst memory usage is ${hasKnownMemoryPercent ? worstMemoryUsedPercent.toFixed(2) : "unknown"}% of configured MaxMemoryUsage.`,
            ],
      metrics: {
        max_memory_used_percent: hasKnownMemoryPercent ? worstMemoryUsedPercent : null,
        nodes_checked: metricsByNode.size,
      },
      outliers: limitOutliers(outliers, maxOutliers),
    };
  },

  cpu: async ({
    connection,
    window,
    thresholds,
    maxOutliers,
    registerObservedNode,
    registerIssueNode,
  }) => {
    const cpuWarning = thresholds?.cpu_cores_used_warning ?? 4;
    const cpuCritical = thresholds?.cpu_cores_used_critical ?? 8;
    const timeFilter = buildLogTimeFilter(window, 15);
    const lookbackMinutes = timeFilter.windowMinutes;
    const data = await queryJsonCompact(
      `
SELECT
  FQDN() AS host_name,
  min(event_time) AS first_seen,
  max(event_time) AS last_seen,
  min(ProfileEvent_OSCPUVirtualTimeMicroseconds) AS min_cpu_us,
  max(ProfileEvent_OSCPUVirtualTimeMicroseconds) AS max_cpu_us
FROM {clusterAllReplicas:system.metric_log}
WHERE ${timeFilter.whereClause}
GROUP BY host_name`,
      connection
    );
    const rows = data.data || [];

    let maxCpuCoresUsed = 0;
    let totalCpuCoresUsed = 0;
    let nodesWithCpuData = 0;
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [hostName, firstSeen, lastSeen, minCpuUs, maxCpuUs] = row as (string | number | null)[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);

      const minValue = Number(minCpuUs) || 0;
      const maxValue = Number(maxCpuUs) || 0;
      const elapsedSeconds = Math.max(
        (new Date(String(lastSeen || "")).getTime() - new Date(String(firstSeen || "")).getTime()) /
          1000,
        0
      );
      const cpuCoresUsed =
        elapsedSeconds > 0 ? Math.max((maxValue - minValue) / 1_000_000 / elapsedSeconds, 0) : 0;

      if (elapsedSeconds > 0) nodesWithCpuData += 1;
      totalCpuCoresUsed += cpuCoresUsed;
      maxCpuCoresUsed = Math.max(maxCpuCoresUsed, cpuCoresUsed);

      if (cpuCoresUsed >= cpuWarning) {
        registerIssueNode(nodeName);
        const severity: StatusSeverity = cpuCoresUsed >= cpuCritical ? "CRITICAL" : "WARNING";
        outliers.push({
          node: nodeName,
          details: `${severity} ClickHouse CPU activity on ${nodeName}`,
          metrics: {
            clickhouse_cpu_cores_used: Number(cpuCoresUsed.toFixed(2)),
            window_minutes: lookbackMinutes,
          },
        });
      }
    }

    const status: StatusSeverity =
      maxCpuCoresUsed >= cpuCritical
        ? "CRITICAL"
        : maxCpuCoresUsed >= cpuWarning
          ? "WARNING"
          : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `ClickHouse CPU activity is elevated (max ${maxCpuCoresUsed.toFixed(2)} cores-used over ${timeFilter.windowLabel}). Thresholds: warning >= ${cpuWarning}, critical >= ${cpuCritical}.`,
            ],
      metrics: {
        max_clickhouse_cpu_cores_used: Number(maxCpuCoresUsed.toFixed(2)),
        avg_clickhouse_cpu_cores_used:
          nodesWithCpuData > 0 ? Number((totalCpuCoresUsed / nodesWithCpuData).toFixed(2)) : null,
        nodes_checked: rows.length,
        window_minutes: lookbackMinutes,
      },
      outliers: limitOutliers(
        outliers.sort(
          (a, b) =>
            (Number(b.metrics.clickhouse_cpu_cores_used) || 0) -
            (Number(a.metrics.clickhouse_cpu_cores_used) || 0)
        ),
        maxOutliers
      ),
    };
  },

  merges: async ({ connection, maxOutliers, registerObservedNode, registerIssueNode }) => {
    const data = await queryJsonCompact(
      `
SELECT
  FQDN() AS host_name,
  count() AS active_merges,
  max(elapsed) AS max_elapsed_seconds
FROM {clusterAllReplicas:system.merges}
GROUP BY host_name`,
      connection
    );
    const rows = data.data || [];

    let activeMerges = 0;
    let maxElapsed = 0;
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [hostName, nodeActiveMerges, nodeMaxElapsed] = row as (string | number | null)[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const nodeMerges = Number(nodeActiveMerges) || 0;
      const nodeElapsed = Number(nodeMaxElapsed) || 0;
      activeMerges += nodeMerges;
      maxElapsed = Math.max(maxElapsed, nodeElapsed);

      if (nodeMerges > 0 && nodeElapsed > 600) {
        registerIssueNode(nodeName);
        const severity: StatusSeverity = nodeElapsed > 3600 ? "CRITICAL" : "WARNING";
        outliers.push({
          node: nodeName,
          details: `${severity} long-running merges on ${nodeName}`,
          metrics: {
            active_merges: nodeMerges,
            max_merge_elapsed_seconds: nodeElapsed,
          },
        });
      }
    }

    const status: StatusSeverity =
      activeMerges === 0
        ? "OK"
        : maxElapsed > 3600
          ? "CRITICAL"
          : maxElapsed > 600
            ? "WARNING"
            : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `There are ${activeMerges} active merges. Longest running merge has been running for ${maxElapsed} seconds.`,
            ],
      metrics: {
        active_merges: activeMerges,
        max_merge_elapsed_seconds: maxElapsed,
      },
      outliers: limitOutliers(outliers, maxOutliers),
    };
  },

  mutations: async ({ connection, maxOutliers, registerObservedNode, registerIssueNode }) => {
    const data = await queryJsonCompact(
      `
SELECT
  FQDN() AS host_name,
  countIf(is_done = 0) AS pending_mutations,
  maxIf(now() - create_time, is_done = 0) AS max_pending_seconds
FROM {clusterAllReplicas:system.mutations}
GROUP BY host_name`,
      connection
    );
    const rows = data.data || [];

    let pendingMutations = 0;
    let maxPendingSeconds = 0;
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [hostName, nodePendingMutations, nodeMaxPendingSeconds] = row as (
        | string
        | number
        | null
      )[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const nodePending = Number(nodePendingMutations) || 0;
      const nodePendingMax = Number(nodeMaxPendingSeconds) || 0;
      pendingMutations += nodePending;
      maxPendingSeconds = Math.max(maxPendingSeconds, nodePendingMax);

      if (nodePending > 0 && nodePendingMax > 600) {
        registerIssueNode(nodeName);
        const severity: StatusSeverity = nodePendingMax > 3600 ? "CRITICAL" : "WARNING";
        outliers.push({
          node: nodeName,
          details: `${severity} pending mutations on ${nodeName}`,
          metrics: {
            pending_mutations: nodePending,
            max_pending_seconds: nodePendingMax,
          },
        });
      }
    }

    const status: StatusSeverity =
      pendingMutations === 0
        ? "OK"
        : maxPendingSeconds > 3600
          ? "CRITICAL"
          : maxPendingSeconds > 600
            ? "WARNING"
            : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `There are ${pendingMutations} pending mutations. Longest pending mutation has been running for ${maxPendingSeconds} seconds.`,
            ],
      metrics: {
        pending_mutations: pendingMutations,
        max_pending_seconds: maxPendingSeconds,
      },
      outliers: limitOutliers(outliers, maxOutliers),
    };
  },

  parts: async ({
    connection,
    thresholds,
    maxOutliers,
    registerObservedNode,
    registerIssueNode,
  }) => {
    const settingsSource =
      thresholds?.parts_warning !== undefined || thresholds?.parts_critical !== undefined
        ? "threshold_overrides"
        : "static_fallback";
    const settingsInfo: {
      source: "threshold_overrides" | "merge_tree_settings" | "static_fallback";
      parts_to_delay_insert?: number;
      parts_to_throw_insert?: number;
      max_avg_part_size_for_too_many_parts?: number;
    } = { source: settingsSource };

    if (settingsInfo.source !== "threshold_overrides") {
      try {
        const settingsData = await queryJsonCompact(
          `
SELECT
  name,
  toFloat64OrNull(value) AS value
FROM system.merge_tree_settings
WHERE name IN (
  'parts_to_delay_insert',
  'parts_to_throw_insert',
  'max_avg_part_size_for_too_many_parts'
)`,
          connection
        );
        for (const row of settingsData.data || []) {
          const [name, value] = row as (string | number | null)[];
          const n = Number(value);
          if (!Number.isFinite(n) || n <= 0) continue;
          if (name === "parts_to_delay_insert") settingsInfo.parts_to_delay_insert = n;
          if (name === "parts_to_throw_insert") settingsInfo.parts_to_throw_insert = n;
          if (name === "max_avg_part_size_for_too_many_parts") {
            settingsInfo.max_avg_part_size_for_too_many_parts = n;
          }
        }
        if (settingsInfo.parts_to_delay_insert || settingsInfo.parts_to_throw_insert) {
          settingsInfo.source = "merge_tree_settings";
        }
      } catch {
        // `system.merge_tree_settings` may be unavailable on some versions.
      }
    }

    const partsWarning = thresholds?.parts_warning ?? settingsInfo.parts_to_delay_insert ?? 500;
    const partsCritical = thresholds?.parts_critical ?? settingsInfo.parts_to_throw_insert ?? 1000;

    const aggregateData = await queryJsonCompact(
      `
SELECT
  max(active_parts) AS max_parts_per_table,
  max(max_parts_per_partition) AS max_parts_per_partition,
  max(avg_active_part_size_bytes) AS max_avg_active_part_size_bytes,
  count() AS tables_checked
FROM (
  SELECT
    FQDN() AS host_name,
    database,
    table,
    sum(partition_active_parts) AS active_parts,
    max(partition_active_parts) AS max_parts_per_partition,
    if(sum(partition_active_parts) = 0, 0, sum(partition_active_bytes) / sum(partition_active_parts)) AS avg_active_part_size_bytes
  FROM (
    SELECT
      FQDN() AS host_name,
      database,
      table,
      partition,
      count() AS partition_active_parts,
      sum(bytes_on_disk) AS partition_active_bytes
    FROM {clusterAllReplicas:system.parts}
    WHERE active
    GROUP BY host_name, database, table, partition
  )
  GROUP BY host_name, database, table
)`,
      connection
    );
    const aggregateRow =
      ((aggregateData.data || [])[0] as (string | number | null)[] | undefined) ?? [];
    const worstParts = Number(aggregateRow[0]) || 0;
    const worstPartsPerPartition = Number(aggregateRow[1]) || 0;
    const maxAvgPartSizeBytes = Number(aggregateRow[2]) || 0;
    const tablesChecked = Number(aggregateRow[3]) || 0;

    const outlierData = await queryJsonCompact(
      `
SELECT
  host_name,
  database,
  table,
  active_parts,
  max_parts_per_partition,
  avg_active_part_size_bytes
FROM (
  SELECT
    host_name,
    database,
    table,
    sum(partition_active_parts) AS active_parts,
    max(partition_active_parts) AS max_parts_per_partition,
    if(sum(partition_active_parts) = 0, 0, sum(partition_active_bytes) / sum(partition_active_parts)) AS avg_active_part_size_bytes
  FROM (
    SELECT
      FQDN() AS host_name,
      database,
      table,
      partition,
      count() AS partition_active_parts,
      sum(bytes_on_disk) AS partition_active_bytes
    FROM {clusterAllReplicas:system.parts}
    WHERE active
    GROUP BY host_name, database, table, partition
  )
  GROUP BY host_name, database, table
)
ORDER BY max_parts_per_partition DESC, active_parts DESC
LIMIT 500`,
      connection
    );
    const rows = outlierData.data || [];
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [
        hostName,
        databaseName,
        tableName,
        parts,
        maxPartsInPartition,
        avgActivePartSizeBytes,
      ] = row as (string | number | null)[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const partCount = Number(parts) || 0;
      const maxPartitionParts = Number(maxPartsInPartition) || 0;
      const avgPartSize = Number(avgActivePartSizeBytes) || 0;

      if (maxPartitionParts >= partsWarning) {
        registerIssueNode(nodeName);
        const avgPartSizeMitigates =
          (settingsInfo.max_avg_part_size_for_too_many_parts ?? 0) > 0 &&
          avgPartSize >= (settingsInfo.max_avg_part_size_for_too_many_parts ?? 0);
        let severity: StatusSeverity = maxPartitionParts >= partsCritical ? "CRITICAL" : "WARNING";
        if (severity === "CRITICAL" && avgPartSizeMitigates) {
          severity = "WARNING";
        }

        outliers.push({
          node: `${nodeName}:${databaseName}.${tableName}`,
          details: `${severity} parts pressure for ${databaseName}.${tableName} on ${nodeName}`,
          metrics: {
            host_name: nodeName,
            database: String(databaseName || ""),
            table: String(tableName || ""),
            parts: partCount,
            max_parts_per_partition: maxPartitionParts,
            avg_active_part_size_bytes: Number(avgPartSize.toFixed(2)),
            avg_part_size_mitigates_too_many_parts: avgPartSizeMitigates ? 1 : 0,
          },
        });
      }
    }

    const status: StatusSeverity =
      worstPartsPerPartition >= partsCritical
        ? "CRITICAL"
        : worstPartsPerPartition >= partsWarning
          ? "WARNING"
          : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `Highest max-parts-per-partition is ${worstPartsPerPartition}. Thresholds (${settingsInfo.source}): warning >= ${partsWarning}, critical >= ${partsCritical}.`,
            ],
      metrics: {
        max_parts_per_table: worstParts,
        max_parts_per_partition: worstPartsPerPartition,
        parts_warning_threshold: partsWarning,
        parts_critical_threshold: partsCritical,
        threshold_source: settingsInfo.source,
        max_avg_part_size_for_too_many_parts:
          settingsInfo.max_avg_part_size_for_too_many_parts ?? null,
        max_avg_active_part_size_bytes: Number(maxAvgPartSizeBytes.toFixed(2)),
        tables_checked: tablesChecked,
      },
      outliers: limitOutliers(outliers, maxOutliers),
    };
  },

  errors: async ({ connection, maxOutliers, registerObservedNode, registerIssueNode }) => {
    const data = await queryJsonCompact(
      `
SELECT
  FQDN() AS host_name,
  name,
  last_error_time,
  value
FROM {clusterAllReplicas:system.errors}
ORDER BY value DESC
LIMIT 50`,
      connection
    );
    const rows = data.data || [];

    let totalErrors = 0;
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [hostName, name, lastErrorTime, value] = row as (string | number)[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const count = Number(value) || 0;
      totalErrors += count;

      if (count > 0) {
        registerIssueNode(nodeName);
        outliers.push({
          node: nodeName,
          details: `Error ${name} occurred ${count} times`,
          metrics: {
            error_name: String(name || ""),
            last_error_time: String(lastErrorTime || ""),
            count,
          },
        });
      }
    }

    const status: StatusSeverity =
      totalErrors === 0 ? "OK" : totalErrors > 1000 ? "CRITICAL" : "WARNING";

    return {
      status,
      issues:
        status === "OK" ? [] : [`Total recent error count from system.errors: ${totalErrors}.`],
      metrics: {
        total_errors: totalErrors,
      },
      outliers: limitOutliers(outliers, maxOutliers),
    };
  },

  connections: async ({ connection, maxOutliers, registerObservedNode, registerIssueNode }) => {
    const data = await queryJsonCompact(
      `
SELECT
  FQDN() AS host_name,
  count() AS active_queries,
  uniqExact(user) AS active_users,
  uniqExact(address) AS remote_addresses
FROM {clusterAllReplicas:system.processes}
GROUP BY host_name`,
      connection
    );
    const rows = data.data || [];

    let activeQueries = 0;
    let activeUsers = 0;
    let remoteAddresses = 0;
    let maxNodeQueries = 0;
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [hostName, nodeActiveQueries, nodeActiveUsers, nodeRemoteAddresses] = row as (
        | string
        | number
      )[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const nodeQueries = Number(nodeActiveQueries) || 0;
      const nodeUsers = Number(nodeActiveUsers) || 0;
      const nodeAddresses = Number(nodeRemoteAddresses) || 0;

      activeQueries += nodeQueries;
      activeUsers += nodeUsers;
      remoteAddresses += nodeAddresses;
      maxNodeQueries = Math.max(maxNodeQueries, nodeQueries);

      if (nodeQueries > 200) {
        registerIssueNode(nodeName);
        const severity: StatusSeverity = nodeQueries > 1000 ? "CRITICAL" : "WARNING";
        outliers.push({
          node: nodeName,
          details: `${severity} active query pressure on ${nodeName}`,
          metrics: {
            active_queries: nodeQueries,
            active_users: nodeUsers,
            remote_addresses: nodeAddresses,
          },
        });
      }
    }

    const status: StatusSeverity =
      maxNodeQueries > 1000 ? "CRITICAL" : maxNodeQueries > 200 ? "WARNING" : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `High number of active queries: ${activeQueries}. Active users: ${activeUsers}, remote addresses: ${remoteAddresses}.`,
            ],
      metrics: {
        active_queries: activeQueries,
        active_users: activeUsers,
        remote_addresses: remoteAddresses,
      },
      outliers: limitOutliers(outliers, maxOutliers),
    };
  },

  select_queries: async (context) =>
    collectQueryPerformanceCategory(context, {
      categoryLabel: "SELECT",
      queryKindPredicate: "query_kind = 'Select'",
    }),

  insert_queries: async (context) =>
    collectQueryPerformanceCategory(context, {
      categoryLabel: "INSERT",
      queryKindPredicate: "query_kind = 'Insert'",
    }),

  ddl_queries: async (context) =>
    collectQueryPerformanceCategory(context, {
      categoryLabel: "DDL",
      queryKindPredicate:
        "query_kind IN ('Create', 'Alter', 'Drop', 'Rename', 'Truncate', 'Optimize')",
    }),
};

export const getClusterStatusExecutor: ToolExecutor<
  GetClusterStatusInput,
  GetClusterStatusOutput
> = async (input, connection, progressCallback?: ToolProgressCallback) => {
  const analysisMode: StatusAnalysisMode = input.status_analysis_mode ?? "snapshot";
  const checks: StatusCheckCategory[] =
    input.checks && input.checks.length > 0
      ? input.checks
      : [
          // resources
          "cpu",
          "memory",
          "disk",
          // queries
          "select_queries",
          "insert_queries",
          "ddl_queries",
          // merge & replication
          "merges",
          "replication",
          "mutations",
          // parts
          "parts",
          // others
          "errors",
          "connections",
        ];

  const maxOutliers = input.max_outliers ?? 10;

  const isCluster = Boolean(connection.cluster && connection.cluster.length > 0);
  const scope: GetClusterStatusOutput["scope"] = isCluster ? "cluster" : "single_node";

  const categories: GetClusterStatusOutput["categories"] = {};
  const observedNodes = new Set<string>();
  const issueNodes = new Set<string>();

  const registerObservedNode = (node: string) => {
    const normalizedNode = node.trim();
    if (normalizedNode.length > 0) observedNodes.add(normalizedNode);
  };

  const registerIssueNode = (node: string) => {
    const normalizedNode = node.trim();
    if (normalizedNode.length > 0) issueNodes.add(normalizedNode);
  };

  try {
    const totalSteps = checks.length + (analysisMode === "windowed" ? 1 : 0);
    const baseProgress = 5;
    const snapshotProgressSpan = analysisMode === "windowed" ? 75 : 90;

    for (let i = 0; i < checks.length; i += 1) {
      const check = checks[i]!;
      const checkProgress =
        baseProgress + Math.round((i / Math.max(checks.length, 1)) * snapshotProgressSpan);
      progressCallback?.(`check ${check}`, checkProgress, "started");
      try {
        categories[check] = await STATUS_CATEGORY_HANDLERS[check]({
          connection,
          window: input.window,
          thresholds: input.thresholds,
          maxOutliers,
          registerObservedNode,
          registerIssueNode,
        });
        const doneProgress =
          baseProgress +
          Math.round(((i + 1) / Math.max(totalSteps, 1)) * (analysisMode === "windowed" ? 90 : 95));
        progressCallback?.(`check ${check}`, doneProgress, "success");
      } catch (error) {
        const message =
          error instanceof QueryError && error.data
            ? typeof error.data === "string"
              ? error.data
              : JSON.stringify(error.data)
            : error instanceof Error
              ? error.message
              : String(error);
        progressCallback?.(`check ${check}`, checkProgress, "failed", message);
        throw error;
      }
    }

    const categorySeverities = Object.values(categories).map((category) => category.status);
    rankSeverity(categorySeverities);

    const totalNodes =
      observedNodes.size > 0 ? observedNodes.size : scope === "single_node" ? 1 : 0;
    const nodesWithIssues = issueNodes.size;
    const healthyNodes = Math.max(totalNodes - nodesWithIssues, 0);

    const windowResult =
      analysisMode === "windowed"
        ? await getSystemMetrics(
            {
              metric_type: input.window?.metric_type ?? "errors",
              time_window: input.window?.time_window,
              time_range: input.window?.time_range,
              granularity_minutes: input.window?.granularity_minutes,
            },
            connection
          )
        : undefined;
    if (analysisMode === "windowed") {
      progressCallback?.(
        "collect windowed metrics",
        95,
        windowResult?.success ? "success" : "failed",
        windowResult?.success ? undefined : windowResult?.error
      );
    }

    return {
      success: windowResult ? windowResult.success : true,
      status_analysis_mode: analysisMode,
      scope,
      cluster: connection.cluster,
      node_count: totalNodes,
      summary: {
        total_nodes: totalNodes,
        healthy_nodes: healthyNodes,
        nodes_with_issues: nodesWithIssues,
      },
      categories,
      window: windowResult,
      generated_at: new Date().toISOString(),
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
      status_analysis_mode: analysisMode,
      scope,
      cluster: connection.cluster,
      node_count: 0,
      summary: {
        total_nodes: 0,
        healthy_nodes: 0,
        nodes_with_issues: 0,
      },
      categories: {},
      generated_at: new Date().toISOString(),
      error: message,
    };
  }
};

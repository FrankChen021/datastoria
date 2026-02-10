import { QueryError, type JSONCompactFormatResponse } from "@/lib/connection/connection";
import type { ToolExecutor, ToolProgressCallback } from "../client-tool-types";
import {
  getSystemMetrics,
  type GetSystemMetricsOutput,
  type HistoricalMetricType,
} from "./get-system-metrics";

type StatusSeverity = "OK" | "WARNING" | "CRITICAL";
type StatusAnalysisMode = "snapshot" | "trend" | "both";
type StatusCheckCategory =
  | "replication"
  | "disk"
  | "memory"
  | "merges"
  | "mutations"
  | "parts"
  | "errors"
  | "connections";

export type GetClusterStatusInput = {
  status_analysis_mode?: StatusAnalysisMode;
  checks?: StatusCheckCategory[];
  verbosity?: "summary" | "detailed";
  thresholds?: {
    disk_warning?: number;
    disk_critical?: number;
    replication_lag_warning_seconds?: number;
    replication_lag_critical_seconds?: number;
    parts_warning?: number;
    parts_critical?: number;
  };
  max_outliers?: number;
  trend?: {
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
  trend?: GetSystemMetricsOutput;
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

async function queryJsonCompact(
  sql: string,
  connection: Parameters<ToolExecutor<GetClusterStatusInput, GetClusterStatusOutput>>[1]
): Promise<JSONCompactFormatResponse> {
  const { response } = connection.query(sql, { default_format: "JSONCompact" });
  const apiResponse = await response;
  return apiResponse.data.json<JSONCompactFormatResponse>();
}

function buildTrendTimeFilterClause(trend?: GetClusterStatusInput["trend"]): {
  whereClause: string;
} {
  if (trend?.time_range?.from && trend?.time_range?.to) {
    return {
      whereClause: `event_date >= toDate('${trend.time_range.from}') AND event_date <= toDate('${trend.time_range.to}') AND event_time >= toDateTime('${trend.time_range.from}') AND event_time <= toDateTime('${trend.time_range.to}')`,
    };
  }

  const minutes = trend?.time_window ?? 60;
  return {
    whereClause: `event_date >= now() - INTERVAL ${minutes} MINUTE AND event_time >= now() - INTERVAL ${minutes} MINUTE`,
  };
}

async function discoverTrendNodeCount(
  connection: Parameters<ToolExecutor<GetClusterStatusInput, GetClusterStatusOutput>>[1],
  trend?: GetClusterStatusInput["trend"]
): Promise<number> {
  try {
    const { whereClause } = buildTrendTimeFilterClause(trend);
    const data = await queryJsonCompact(
      `
SELECT
  uniqExact(host_name) AS node_count
FROM (
  SELECT FQDN() AS host_name
  FROM {clusterAllReplicas:system.metric_log}
  WHERE ${whereClause}
  GROUP BY host_name
)`,
      connection
    );
    const firstRow = data.data?.[0] as (string | number | null)[] | undefined;
    return Number(firstRow?.[0]) || 0;
  } catch {
    return 0;
  }
}

type CategoryHandlerContext = {
  connection: Parameters<ToolExecutor<GetClusterStatusInput, GetClusterStatusOutput>>[1];
  thresholds?: GetClusterStatusInput["thresholds"];
  maxOutliers: number;
  registerObservedNode: (node: string) => void;
  registerIssueNode: (node: string) => void;
};
type CategoryHandler = (context: CategoryHandlerContext) => Promise<HealthCategorySummary>;

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
  FQDN() AS host_name,
  metric,
  value
FROM {clusterAllReplicas:system.metrics}
WHERE metric IN ('MemoryTracking', 'MaxMemoryUsage', 'MemoryOvercommitRatio')`,
      connection
    );
    const rows = data.data || [];
    const metricsByNode = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const [hostName, metricName, value] = row as (string | number)[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const metricsMap = metricsByNode.get(nodeName) ?? {};
      metricsMap[String(metricName)] = Number(value) || 0;
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
    const partsWarning = thresholds?.parts_warning ?? 500;
    const partsCritical = thresholds?.parts_critical ?? 1000;
    const data = await queryJsonCompact(
      `
SELECT
  FQDN() AS host_name,
  database,
  table,
  sum(active) AS active_parts
FROM {clusterAllReplicas:system.parts}
GROUP BY host_name, database, table
ORDER BY active_parts DESC
LIMIT 500`,
      connection
    );
    const rows = data.data || [];

    let worstParts = 0;
    const outliers: Outlier[] = [];

    for (const row of rows) {
      const [hostName, databaseName, tableName, parts] = row as (string | number)[];
      const nodeName = String(hostName || "");
      registerObservedNode(nodeName);
      const partCount = Number(parts) || 0;
      if (partCount > worstParts) worstParts = partCount;

      if (partCount >= partsWarning) {
        registerIssueNode(nodeName);
        const severity: StatusSeverity = partCount >= partsCritical ? "CRITICAL" : "WARNING";
        outliers.push({
          node: `${nodeName}:${databaseName}.${tableName}`,
          details: `${severity} part count for ${databaseName}.${tableName} on ${nodeName}`,
          metrics: {
            host_name: nodeName,
            database: String(databaseName || ""),
            table: String(tableName || ""),
            parts: partCount,
          },
        });
      }
    }

    const status: StatusSeverity =
      worstParts >= partsCritical ? "CRITICAL" : worstParts >= partsWarning ? "WARNING" : "OK";

    return {
      status,
      issues:
        status === "OK"
          ? []
          : [
              `Highest part count per table is ${worstParts}. Thresholds: warning >= ${partsWarning}, critical >= ${partsCritical}.`,
            ],
      metrics: {
        max_parts_per_table: worstParts,
        tables_checked: rows.length,
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
};

export const getClusterStatusExecutor: ToolExecutor<
  GetClusterStatusInput,
  GetClusterStatusOutput
> = async (input, connection, progressCallback?: ToolProgressCallback) => {
  const analysisMode: StatusAnalysisMode = input.status_analysis_mode ?? "snapshot";
  const checks: StatusCheckCategory[] =
    input.checks && input.checks.length > 0
      ? input.checks
      : ["replication", "disk", "memory", "merges", "mutations", "parts", "errors", "connections"];

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

  if (analysisMode === "trend") {
    progressCallback?.("collect trend metrics", 10, "started");
    const trend = await getSystemMetrics(
      {
        metric_type: input.trend?.metric_type ?? "errors",
        time_window: input.trend?.time_window,
        time_range: input.trend?.time_range,
        granularity_minutes: input.trend?.granularity_minutes,
      },
      connection
    );
    progressCallback?.(
      "collect trend metrics",
      95,
      trend.success ? "success" : "failed",
      trend.success ? undefined : trend.error
    );

    const trendNodeCount = await discoverTrendNodeCount(connection, input.trend);

    return {
      success: trend.success,
      status_analysis_mode: analysisMode,
      scope,
      cluster: connection.cluster,
      node_count: trendNodeCount,
      summary: {
        total_nodes: trendNodeCount,
        healthy_nodes: trendNodeCount,
        nodes_with_issues: 0,
      },
      categories: {},
      trend,
      generated_at: new Date().toISOString(),
      error: trend.error,
    };
  }

  try {
    const totalSteps = checks.length + (analysisMode === "both" ? 1 : 0);
    const baseProgress = 5;
    const snapshotProgressSpan = analysisMode === "both" ? 75 : 90;

    for (let i = 0; i < checks.length; i += 1) {
      const check = checks[i]!;
      const checkProgress =
        baseProgress + Math.round((i / Math.max(checks.length, 1)) * snapshotProgressSpan);
      progressCallback?.(`check ${check}`, checkProgress, "started");
      try {
        categories[check] = await STATUS_CATEGORY_HANDLERS[check]({
          connection,
          thresholds: input.thresholds,
          maxOutliers,
          registerObservedNode,
          registerIssueNode,
        });
        const doneProgress =
          baseProgress +
          Math.round(((i + 1) / Math.max(totalSteps, 1)) * (analysisMode === "both" ? 90 : 95));
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

    const trendResult =
      analysisMode === "both"
        ? await getSystemMetrics(
            {
              metric_type: input.trend?.metric_type ?? "errors",
              time_window: input.trend?.time_window,
              time_range: input.trend?.time_range,
              granularity_minutes: input.trend?.granularity_minutes,
            },
            connection
          )
        : undefined;
    if (analysisMode === "both") {
      progressCallback?.(
        "collect trend metrics",
        95,
        trendResult?.success ? "success" : "failed",
        trendResult?.success ? undefined : trendResult?.error
      );
    }

    return {
      success: trendResult ? trendResult.success : true,
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
      trend: trendResult,
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

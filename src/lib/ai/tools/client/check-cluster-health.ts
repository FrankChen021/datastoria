import { QueryError, type JSONCompactFormatResponse } from "@/lib/connection/connection";
import type { ToolExecutor } from "./client-tool-types";

type HealthCheckCategory =
  | "replication"
  | "disk"
  | "memory"
  | "merges"
  | "mutations"
  | "parts"
  | "errors"
  | "connections";

type HealthSeverity = "OK" | "WARNING" | "CRITICAL";

export type CheckClusterHealthInput = {
  checks?: HealthCheckCategory[];
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
};

export type HealthOutlier = {
  node: string;
  details: string;
  metrics: Record<string, number | string | null>;
};

export type HealthCategorySummary = {
  status: HealthSeverity;
  issues: string[];
  metrics: Record<string, number | string | null>;
  outliers?: HealthOutlier[];
};

export type CheckClusterHealthOutput = {
  success: boolean;
  mode: "single_node" | "cluster";
  cluster?: string;
  node_count: number;
  summary: {
    total_nodes: number;
    healthy_nodes: number;
    nodes_with_issues: number;
  };
  categories: Partial<Record<HealthCheckCategory, HealthCategorySummary>>;
  generated_at: string;
  error?: string;
};

function getThresholds(
  thresholds?: CheckClusterHealthInput["thresholds"]
): Required<NonNullable<CheckClusterHealthInput["thresholds"]>> {
  return {
    disk_warning: thresholds?.disk_warning ?? 80,
    disk_critical: thresholds?.disk_critical ?? 90,
    replication_lag_warning_seconds: thresholds?.replication_lag_warning_seconds ?? 60,
    replication_lag_critical_seconds: thresholds?.replication_lag_critical_seconds ?? 300,
    parts_warning: thresholds?.parts_warning ?? 500,
    parts_critical: thresholds?.parts_critical ?? 1000,
  };
}

function rankSeverity(values: HealthSeverity[]): HealthSeverity {
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
  connection: Parameters<ToolExecutor<CheckClusterHealthInput, CheckClusterHealthOutput>>[1]
): Promise<JSONCompactFormatResponse> {
  const { response } = connection.query(sql, { default_format: "JSONCompact" });
  const apiResponse = await response;
  return apiResponse.data.json<JSONCompactFormatResponse>();
}

export const checkClusterHealthExecutor: ToolExecutor<
  CheckClusterHealthInput,
  CheckClusterHealthOutput
> = async (input, connection) => {
  const checks: HealthCheckCategory[] =
    input.checks && input.checks.length > 0
      ? input.checks
      : ["replication", "disk", "memory", "merges", "mutations", "parts", "errors", "connections"];
  const thresholds = getThresholds(input.thresholds);
  const maxOutliers = input.max_outliers ?? 10;

  const isCluster = Boolean(connection.cluster && connection.cluster.length > 0);
  const mode: CheckClusterHealthOutput["mode"] = isCluster ? "cluster" : "single_node";

  const categories: CheckClusterHealthOutput["categories"] = {};
  let totalNodes = 0;
  let nodesWithIssues = 0;

  try {
    // Replication health
    if (checks.includes("replication")) {
      const sql = `
SELECT
  ifNull(host_name, '') AS host_name,
  ifNull(database, '') AS database,
  ifNull(table, '') AS table,
  ifNull(is_readonly, 0) AS is_readonly,
  ifNull(is_session_expired, 0) AS is_session_expired,
  ifNull(total_replicas, 1) AS total_replicas,
  ifNull(active_replicas, 1) AS active_replicas,
  ifNull(absolute_delay, 0) AS absolute_delay
FROM ${
        isCluster
          ? `clusterAllReplicas("${connection.cluster}", system.replicas)`
          : "system.replicas"
      }`;

      const data = await queryJsonCompact(sql, connection);
      const rows = data.data || [];

      totalNodes = Math.max(totalNodes, rows.length || totalNodes);

      let maxLag = 0;
      let laggedReplicas = 0;
      const outliers: HealthOutlier[] = [];

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

        const lag = Number(lagSeconds) || 0;
        const total = Number(totalReplicas) || 1;
        const active = Number(activeReplicas) || 0;
        const readonly = Number(isReadonly) === 1;
        const sessionExpired = Number(isSessionExpired) === 1;

        if (lag > maxLag) {
          maxLag = lag;
        }

        const hasIssue =
          lag >= thresholds.replication_lag_warning_seconds ||
          active < total ||
          readonly ||
          sessionExpired;

        if (hasIssue) {
          laggedReplicas += 1;
          nodesWithIssues += 1;
        }

        if (hasIssue) {
          const severity: HealthSeverity =
            lag >= thresholds.replication_lag_critical_seconds || active === 0 || sessionExpired
              ? "CRITICAL"
              : "WARNING";

          outliers.push({
            node: String(hostName || ""),
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

      const replicationSeverity: HealthSeverity =
        maxLag >= thresholds.replication_lag_critical_seconds || laggedReplicas > 0
          ? maxLag >= thresholds.replication_lag_critical_seconds
            ? "CRITICAL"
            : "WARNING"
          : "OK";

      categories.replication = {
        status: replicationSeverity,
        issues:
          replicationSeverity === "OK"
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
    }

    // Disk health
    if (checks.includes("disk")) {
      const sql = `
SELECT
  name,
  path,
  free_space,
  total_space,
  round((total_space - free_space) / total_space * 100, 2) AS used_percent
FROM system.disks`;

      const data = await queryJsonCompact(sql, connection);
      const rows = data.data || [];

      let maxUsedPercent = 0;
      const outliers: HealthOutlier[] = [];

      for (const row of rows) {
        const [name, path, freeSpace, totalSpace, usedPercent] = row as (string | number)[];
        const used = Number(usedPercent) || 0;
        if (used > maxUsedPercent) {
          maxUsedPercent = used;
        }

        if (used >= thresholds.disk_warning) {
          const severity: HealthSeverity =
            used >= thresholds.disk_critical ? "CRITICAL" : "WARNING";
          outliers.push({
            node: String(name || ""),
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

      const diskSeverity: HealthSeverity =
        maxUsedPercent >= thresholds.disk_critical
          ? "CRITICAL"
          : maxUsedPercent >= thresholds.disk_warning
            ? "WARNING"
            : "OK";

      categories.disk = {
        status: diskSeverity,
        issues:
          diskSeverity === "OK"
            ? []
            : [
                `Maximum disk usage is ${maxUsedPercent.toFixed(2)}%. Thresholds: warning >= ${
                  thresholds.disk_warning
                }%, critical >= ${thresholds.disk_critical}%.`,
              ],
        metrics: {
          max_disk_used_percent: maxUsedPercent,
          disks_checked: rows.length,
        },
        outliers: limitOutliers(outliers, maxOutliers),
      };
    }

    // Memory metrics from system.metrics
    if (checks.includes("memory")) {
      const sql = `
SELECT
  metric,
  value
FROM system.metrics
WHERE metric IN ('MemoryTracking', 'MaxMemoryUsage', 'MemoryOvercommitRatio')`;

      const data = await queryJsonCompact(sql, connection);
      const rows = data.data || [];

      const metricsMap: Record<string, number> = {};
      for (const row of rows) {
        const [metricName, value] = row as (string | number)[];
        metricsMap[String(metricName)] = Number(value) || 0;
      }

      const memoryBytes = metricsMap.MemoryTracking ?? 0;
      const maxMemory = metricsMap.MaxMemoryUsage ?? 0;

      let usedPercent: number | null = null;
      if (maxMemory > 0) {
        usedPercent = (memoryBytes / maxMemory) * 100;
      }

      const severity: HealthSeverity =
        usedPercent !== null && usedPercent >= 90
          ? "CRITICAL"
          : usedPercent !== null && usedPercent >= 80
            ? "WARNING"
            : "OK";

      categories.memory = {
        status: severity,
        issues:
          severity === "OK"
            ? []
            : [
                `Estimated memory usage is ${
                  usedPercent !== null ? usedPercent.toFixed(2) : "unknown"
                }% of configured MaxMemoryUsage.`,
              ],
        metrics: {
          memory_tracking_bytes: memoryBytes,
          max_memory_usage_bytes: maxMemory,
          memory_used_percent: usedPercent,
        },
      };
    }

    // Merges (instant)
    if (checks.includes("merges")) {
      const sql = `
SELECT
  count() AS active_merges,
  max(elapsed) AS max_elapsed_seconds
FROM system.merges`;

      const data = await queryJsonCompact(sql, connection);
      const row = data.data?.[0] as (number | null | undefined)[] | undefined;

      const activeMerges = row ? Number(row[0]) || 0 : 0;
      const maxElapsed = row ? Number(row[1]) || 0 : 0;

      const severity: HealthSeverity =
        activeMerges === 0
          ? "OK"
          : maxElapsed > 3600
            ? "CRITICAL"
            : maxElapsed > 600
              ? "WARNING"
              : "OK";

      categories.merges = {
        status: severity,
        issues:
          severity === "OK"
            ? []
            : [
                `There are ${activeMerges} active merges. Longest running merge has been running for ${maxElapsed} seconds.`,
              ],
        metrics: {
          active_merges: activeMerges,
          max_merge_elapsed_seconds: maxElapsed,
        },
      };
    }

    // Mutations (instant)
    if (checks.includes("mutations")) {
      const sql = `
SELECT
  countIf(is_done = 0) AS pending_mutations,
  maxIf(now() - create_time, is_done = 0) AS max_pending_seconds
FROM system.mutations`;

      const data = await queryJsonCompact(sql, connection);
      const row = data.data?.[0] as (number | null | undefined)[] | undefined;

      const pendingMutations = row ? Number(row[0]) || 0 : 0;
      const maxPendingSeconds = row ? Number(row[1]) || 0 : 0;

      const severity: HealthSeverity =
        pendingMutations === 0
          ? "OK"
          : maxPendingSeconds > 3600
            ? "CRITICAL"
            : maxPendingSeconds > 600
              ? "WARNING"
              : "OK";

      categories.mutations = {
        status: severity,
        issues:
          severity === "OK"
            ? []
            : [
                `There are ${pendingMutations} pending mutations. Longest pending mutation has been running for ${maxPendingSeconds} seconds.`,
              ],
        metrics: {
          pending_mutations: pendingMutations,
          max_pending_seconds: maxPendingSeconds,
        },
      };
    }

    // Parts (part explosion)
    if (checks.includes("parts")) {
      const sql = `
SELECT
  database,
  table,
  sum(active) AS active_parts
FROM system.parts
GROUP BY database, table
ORDER BY active_parts DESC
LIMIT 500`;

      const data = await queryJsonCompact(sql, connection);
      const rows = data.data || [];

      let worstParts = 0;
      const outliers: HealthOutlier[] = [];

      for (const row of rows) {
        const [databaseName, tableName, parts] = row as (string | number)[];
        const partCount = Number(parts) || 0;
        if (partCount > worstParts) {
          worstParts = partCount;
        }

        if (partCount >= thresholds.parts_warning) {
          const severity: HealthSeverity =
            partCount >= thresholds.parts_critical ? "CRITICAL" : "WARNING";
          outliers.push({
            node: `${databaseName}.${tableName}`,
            details: `${severity} part count for ${databaseName}.${tableName}`,
            metrics: {
              database: String(databaseName || ""),
              table: String(tableName || ""),
              parts: partCount,
            },
          });
        }
      }

      const severity: HealthSeverity =
        worstParts >= thresholds.parts_critical
          ? "CRITICAL"
          : worstParts >= thresholds.parts_warning
            ? "WARNING"
            : "OK";

      categories.parts = {
        status: severity,
        issues:
          severity === "OK"
            ? []
            : [
                `Highest part count per table is ${worstParts}. Thresholds: warning >= ${thresholds.parts_warning}, critical >= ${thresholds.parts_critical}.`,
              ],
        metrics: {
          max_parts_per_table: worstParts,
          tables_checked: rows.length,
        },
        outliers: limitOutliers(outliers, maxOutliers),
      };
    }

    // Errors (system.errors)
    if (checks.includes("errors")) {
      const sql = `
SELECT
  name,
  last_error_time,
  value
FROM system.errors
ORDER BY value DESC
LIMIT 50`;

      const data = await queryJsonCompact(sql, connection);
      const rows = data.data || [];

      let totalErrors = 0;
      const outliers: HealthOutlier[] = [];

      for (const row of rows) {
        const [name, lastErrorTime, value] = row as (string | number)[];
        const count = Number(value) || 0;
        totalErrors += count;

        if (count > 0) {
          outliers.push({
            node: String(name || ""),
            details: `Error ${name} occurred ${count} times`,
            metrics: {
              last_error_time: String(lastErrorTime || ""),
              count,
            },
          });
        }
      }

      const severity: HealthSeverity =
        totalErrors === 0 ? "OK" : totalErrors > 1000 ? "CRITICAL" : "WARNING";

      categories.errors = {
        status: severity,
        issues:
          severity === "OK" ? [] : [`Total recent error count from system.errors: ${totalErrors}.`],
        metrics: {
          total_errors: totalErrors,
        },
        outliers: limitOutliers(outliers, maxOutliers),
      };
    }

    // Connections (instant)
    if (checks.includes("connections")) {
      const sql = `
SELECT
  count() AS active_queries,
  uniqExact(user) AS active_users,
  uniqExact(address) AS remote_addresses
FROM system.processes`;

      const data = await queryJsonCompact(sql, connection);
      const row = data.data?.[0] as (number | null | undefined)[] | undefined;

      const activeQueries = row ? Number(row[0]) || 0 : 0;
      const activeUsers = row ? Number(row[1]) || 0 : 0;
      const remoteAddresses = row ? Number(row[2]) || 0 : 0;

      const severity: HealthSeverity =
        activeQueries > 1000 ? "CRITICAL" : activeQueries > 200 ? "WARNING" : "OK";

      categories.connections = {
        status: severity,
        issues:
          severity === "OK"
            ? []
            : [
                `High number of active queries: ${activeQueries}. Active users: ${activeUsers}, remote addresses: ${remoteAddresses}.`,
              ],
        metrics: {
          active_queries: activeQueries,
          active_users: activeUsers,
          remote_addresses: remoteAddresses,
        },
      };
    }

    const categorySeverities = Object.values(categories).map((category) => category.status);
    const overallSeverity = rankSeverity(categorySeverities);

    const healthyNodes = Math.max(totalNodes - nodesWithIssues, 0);

    return {
      success: true,
      mode,
      cluster: connection.cluster,
      node_count: totalNodes || (mode === "single_node" ? 1 : 0),
      summary: {
        total_nodes: totalNodes || (mode === "single_node" ? 1 : 0),
        healthy_nodes: healthyNodes || (mode === "single_node" && overallSeverity === "OK" ? 1 : 0),
        nodes_with_issues: nodesWithIssues,
      },
      categories,
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
      mode,
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

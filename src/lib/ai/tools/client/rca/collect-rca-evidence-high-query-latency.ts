import {
  asNumber,
  buildQueryLogPredicate,
  type PossibleAction,
  type QuerySpec,
  type RcaThresholds,
  type RuleSpec,
  type ScenarioSpec,
  type SymptomContext,
} from "./collect-rca-evidence-common";

export type HighQueryLatencyContext = SymptomContext & {
  scopePredicate: string;
};

const HIGH_QUERY_LATENCY_QUERIES: QuerySpec<HighQueryLatencyContext>[] = [
  {
    id: "query_log",
    progressStage: "rca high_query_latency: query_log",
    progressWeight: 40,
    sqlTemplate: `
SELECT
  quantileExact(0.95)(query_duration_ms) AS p95_ms,
  quantileExact(0.99)(query_duration_ms) AS p99_ms,
  avg(read_rows) AS avg_read_rows,
  avg(read_bytes) AS avg_read_bytes,
  avg(memory_usage) AS avg_memory_bytes,
  any(toString(normalized_query_hash)) AS sample_query_hash
FROM {clusterAllReplicas:system.query_log}
WHERE {timeFilterExpression}
  AND type = 'QueryFinish'
  AND {scopeFilterExpression}`,
    toObservation: (row, ctx) => ({
      source: "system.query_log",
      description: `Latency summary over last ${ctx.timeWindowMinutes} minutes`,
      scope_summary: {
        level: "cluster",
        aggregation_semantics: "quantile",
        cluster_aggregation: "cluster-wide query_log quantiles",
      },
      metrics: {
        p95_ms: Number(asNumber(row?.[0]).toFixed(2)),
        p99_ms: Number(asNumber(row?.[1]).toFixed(2)),
        avg_read_rows: Number(asNumber(row?.[2]).toFixed(2)),
        avg_read_bytes: Number(asNumber(row?.[3]).toFixed(2)),
        avg_memory_bytes: Number(asNumber(row?.[4]).toFixed(2)),
        sample_query_hash: String(row?.[5] ?? ""),
      },
    }),
  },
  {
    id: "merges",
    progressStage: "rca high_query_latency: merges",
    progressWeight: 45,
    sqlTemplate: `
SELECT
  count() AS active_merges,
  max(elapsed) AS max_merge_elapsed_seconds
FROM {clusterAllReplicas:system.merges}`,
    toObservation: (row, _ctx) => ({
      source: "system.merges",
      description: "Merge pressure snapshot",
      scope_summary: {
        level: "cluster",
        aggregation_semantics: "additive",
        cluster_aggregation: "sum/max across replicas",
      },
      metrics: {
        active_merges: asNumber(row?.[0]),
        max_merge_elapsed_seconds: Number(asNumber(row?.[1]).toFixed(2)),
      },
    }),
  },
  {
    id: "metrics",
    progressStage: "rca high_query_latency: metrics",
    progressWeight: 50,
    sqlTemplate: `
SELECT
  ifNull(max(memory_used_percent), 0) AS memory_used_percent_max,
  ifNull(argMax(host, memory_used_percent), '') AS max_memory_node
FROM (
  SELECT
    FQDN() AS host,
    (SELECT value FROM system.metrics WHERE metric = 'MemoryTracking') AS usedBytes,
    (SELECT value FROM system.asynchronous_metrics WHERE metric = 'OSMemoryTotal') AS totalBytes,
    ifNull(usedBytes / nullIf(totalBytes, 0) * 100, 0) AS memory_used_percent
  FROM {clusterAllReplicas:system.one}
)`,
    toObservation: (row, ctx) => {
      const maxMemoryUsedPercent = Number(asNumber(row?.[0]).toFixed(2));
      const maxMemoryNode = String(row?.[1] ?? "");
      return {
        source: "system.asynchronous_metrics",
        description: `Memory pressure hotspot snapshot over last ${ctx.timeWindowMinutes} minutes`,
        scope_summary: {
          level: "cluster",
          aggregation_semantics: "ratio",
          cluster_aggregation: "max per-node memory ratio",
        },
        metrics: {
          memory_used_percent_max: maxMemoryUsedPercent,
          max_memory_node: maxMemoryNode,
        },
        top_nodes: maxMemoryNode
          ? [
              {
                node: maxMemoryNode,
                metrics: {
                  memory_used_percent: maxMemoryUsedPercent,
                },
              },
            ]
          : undefined,
        nodes_over_threshold:
          maxMemoryNode &&
          maxMemoryUsedPercent >= ctx.thresholds.high_query_latency.memory_used_percent_gte
            ? [
                {
                  node: maxMemoryNode,
                  metric: "memory_used_percent",
                  value: maxMemoryUsedPercent,
                  threshold: ctx.thresholds.high_query_latency.memory_used_percent_gte,
                },
              ]
            : [],
      };
    },
  },
];

function buildHighQueryLatencyRules(thresholds: RcaThresholds): RuleSpec[] {
  const t = thresholds.high_query_latency;
  return [
    {
      cause: "full_scan",
      next_check_hints: [
        "inspect query plan for high-latency hashes and verify predicate selectivity",
      ],
      indicators: [
        {
          description: `avg read rows >= ${t.avg_read_rows_gte}`,
          match: (r) => {
            const v = asNumber(r["query_log"]?.metrics["avg_read_rows"]);
            return { matched: v >= t.avg_read_rows_gte, actual: v.toFixed(2) };
          },
        },
        {
          description: `avg read bytes >= ${t.avg_read_bytes_gte}`,
          match: (r) => {
            const v = asNumber(r["query_log"]?.metrics["avg_read_bytes"]);
            return { matched: v >= t.avg_read_bytes_gte, actual: v.toFixed(2) };
          },
        },
        {
          description: `p99 latency >= ${t.p99_latency_ms_gte}ms`,
          required: true,
          match: (r) => {
            const v = asNumber(r["query_log"]?.metrics["p99_ms"]);
            return { matched: v >= t.p99_latency_ms_gte, actual: `${v.toFixed(2)}ms` };
          },
        },
      ],
    },
    {
      cause: "merge_pressure",
      next_check_hints: ["check part churn and merge scheduler pressure on top tables"],
      indicators: [
        {
          required: true,
          description: `active merges > ${t.active_merges_gt}`,
          match: (r) => {
            const v = asNumber(r["merges"]?.metrics["active_merges"]);
            return { matched: v > t.active_merges_gt, actual: v };
          },
        },
        {
          description: `max merge elapsed > ${t.max_merge_elapsed_seconds_gt}s`,
          match: (r) => {
            const v = asNumber(r["merges"]?.metrics["max_merge_elapsed_seconds"]);
            return {
              matched: v > t.max_merge_elapsed_seconds_gt,
              actual: `${v.toFixed(2)}s`,
            };
          },
        },
        {
          description: `p95 latency >= ${t.p95_latency_ms_gte}ms`,
          match: (r) => {
            const v = asNumber(r["query_log"]?.metrics["p95_ms"]);
            return { matched: v >= t.p95_latency_ms_gte, actual: `${v.toFixed(2)}ms` };
          },
        },
      ],
    },
    {
      cause: "memory_pressure",
      indicators: [
        {
          required: true,
          description: `memory used >= ${t.memory_used_percent_gte}%`,
          match: (r) => {
            const v = asNumber(r["metrics"]?.metrics["memory_used_percent_max"]);
            return { matched: v >= t.memory_used_percent_gte, actual: `${v.toFixed(2)}%` };
          },
        },
        {
          description: `avg query memory >= ${t.avg_query_memory_bytes_gte}`,
          match: (r) => {
            const v = asNumber(r["query_log"]?.metrics["avg_memory_bytes"]);
            return { matched: v >= t.avg_query_memory_bytes_gte, actual: v.toFixed(2) };
          },
        },
        {
          description: `p99 latency >= ${t.p99_latency_ms_gte}ms`,
          match: (r) => {
            const v = asNumber(r["query_log"]?.metrics["p99_ms"]);
            return { matched: v >= t.p99_latency_ms_gte, actual: `${v.toFixed(2)}ms` };
          },
        },
      ],
    },
  ];
}

const HIGH_QUERY_LATENCY_ACTIONS: PossibleAction[] = [
  {
    title: "Inspect top slow query patterns and optimize filters/index usage",
    risk: "low",
    tied_to: "full_scan",
  },
  {
    title: "Reduce merge pressure by smoothing ingest and checking part churn",
    risk: "medium",
    tied_to: "merge_pressure",
  },
  {
    title: "Review memory-heavy queries and memory limits",
    risk: "medium",
    tied_to: "memory_pressure",
  },
];

export const HIGH_QUERY_LATENCY_SCENARIO: ScenarioSpec<HighQueryLatencyContext> = {
  queries: HIGH_QUERY_LATENCY_QUERIES,
  rules: (context) => buildHighQueryLatencyRules(context.thresholds),
  possible_actions: HIGH_QUERY_LATENCY_ACTIONS,
  prepareContext: async (baseContext) => ({
    ...baseContext,
    scopePredicate: buildQueryLogPredicate(baseContext.scope, baseContext.target),
  }),
  finalizeResult: ({ context, results }) => {
    const sampleQueryHash = String(results["query_log"]?.metrics["sample_query_hash"] ?? "");
    if (context.scope === "query_pattern" && sampleQueryHash) {
      return {
        target: {
          ...context.target,
          query_hash: context.target?.query_hash || sampleQueryHash,
        },
      };
    }
    return {};
  },
};

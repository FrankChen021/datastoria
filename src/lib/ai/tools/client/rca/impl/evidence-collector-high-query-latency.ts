import {
  asNumber,
  buildQueryLogPredicate,
  collectObservation,
  evaluateCandidate,
  scoreCauseEvaluations,
  type CauseEvaluation,
  type Observation,
  type PossibleAction,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
} from "../evidence-collector-common";

type HighQueryLatencyContext = SymptomContext & {
  scopePredicate: string;
};

type HypothesisAnalysis = {
  observations: Observation[];
  evaluation: CauseEvaluation;
};

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

async function collectQueryLog(context: HighQueryLatencyContext): Promise<Observation> {
  return collectObservation({
    context,
    stage: "rca high_query_latency: query_log",
    progress: 40,
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
  });
}

async function collectMerges(context: HighQueryLatencyContext): Promise<Observation> {
  return collectObservation({
    context,
    stage: "rca high_query_latency: merges",
    progress: 45,
    sqlTemplate: `
SELECT
  count() AS active_merges,
  max(elapsed) AS max_merge_elapsed_seconds
FROM {clusterAllReplicas:system.merges}`,
    toObservation: (row) => ({
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
  });
}

async function collectMemoryMetrics(context: HighQueryLatencyContext): Promise<Observation> {
  return collectObservation({
    context,
    stage: "rca high_query_latency: metrics",
    progress: 50,
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
  });
}

async function analyzeFullScan(context: HighQueryLatencyContext): Promise<HypothesisAnalysis> {
  const queryLog = await collectQueryLog(context);
  const t = context.thresholds.high_query_latency;

  return {
    observations: [queryLog],
    evaluation: evaluateCandidate({
      cause: "full_scan",
      next_check_hints: [
        "inspect query plan for high-latency hashes and verify predicate selectivity",
      ],
      indicators: [
        {
          description: `avg read rows >= ${t.avg_read_rows_gte}`,
          evaluation: {
            matched: asNumber(queryLog.metrics["avg_read_rows"]) >= t.avg_read_rows_gte,
            actual: asNumber(queryLog.metrics["avg_read_rows"]).toFixed(2),
          },
        },
        {
          description: `avg read bytes >= ${t.avg_read_bytes_gte}`,
          evaluation: {
            matched: asNumber(queryLog.metrics["avg_read_bytes"]) >= t.avg_read_bytes_gte,
            actual: asNumber(queryLog.metrics["avg_read_bytes"]).toFixed(2),
          },
        },
        {
          description: `p99 latency >= ${t.p99_latency_ms_gte}ms`,
          required: true,
          evaluation: {
            matched: asNumber(queryLog.metrics["p99_ms"]) >= t.p99_latency_ms_gte,
            actual: `${asNumber(queryLog.metrics["p99_ms"]).toFixed(2)}ms`,
          },
        },
      ],
    }),
  };
}

async function analyzeMergePressure(context: HighQueryLatencyContext): Promise<HypothesisAnalysis> {
  const [queryLog, merges] = await Promise.all([collectQueryLog(context), collectMerges(context)]);
  const t = context.thresholds.high_query_latency;

  return {
    observations: [queryLog, merges],
    evaluation: evaluateCandidate({
      cause: "merge_pressure",
      next_check_hints: ["check part churn and merge scheduler pressure on top tables"],
      indicators: [
        {
          description: `active merges > ${t.active_merges_gt}`,
          required: true,
          evaluation: {
            matched: asNumber(merges.metrics["active_merges"]) > t.active_merges_gt,
            actual: asNumber(merges.metrics["active_merges"]),
          },
        },
        {
          description: `max merge elapsed > ${t.max_merge_elapsed_seconds_gt}s`,
          evaluation: {
            matched:
              asNumber(merges.metrics["max_merge_elapsed_seconds"]) >
              t.max_merge_elapsed_seconds_gt,
            actual: `${asNumber(merges.metrics["max_merge_elapsed_seconds"]).toFixed(2)}s`,
          },
        },
        {
          description: `p95 latency >= ${t.p95_latency_ms_gte}ms`,
          evaluation: {
            matched: asNumber(queryLog.metrics["p95_ms"]) >= t.p95_latency_ms_gte,
            actual: `${asNumber(queryLog.metrics["p95_ms"]).toFixed(2)}ms`,
          },
        },
      ],
    }),
  };
}

async function analyzeMemoryPressure(context: HighQueryLatencyContext): Promise<HypothesisAnalysis> {
  const [queryLog, metrics] = await Promise.all([
    collectQueryLog(context),
    collectMemoryMetrics(context),
  ]);
  const t = context.thresholds.high_query_latency;

  return {
    observations: [queryLog, metrics],
    evaluation: evaluateCandidate({
      cause: "memory_pressure",
      indicators: [
        {
          description: `memory used >= ${t.memory_used_percent_gte}%`,
          required: true,
          evaluation: {
            matched:
              asNumber(metrics.metrics["memory_used_percent_max"]) >= t.memory_used_percent_gte,
            actual: `${asNumber(metrics.metrics["memory_used_percent_max"]).toFixed(2)}%`,
          },
        },
        {
          description: `avg query memory >= ${t.avg_query_memory_bytes_gte}`,
          evaluation: {
            matched:
              asNumber(queryLog.metrics["avg_memory_bytes"]) >= t.avg_query_memory_bytes_gte,
            actual: asNumber(queryLog.metrics["avg_memory_bytes"]).toFixed(2),
          },
        },
        {
          description: `p99 latency >= ${t.p99_latency_ms_gte}ms`,
          evaluation: {
            matched: asNumber(queryLog.metrics["p99_ms"]) >= t.p99_latency_ms_gte,
            actual: `${asNumber(queryLog.metrics["p99_ms"]).toFixed(2)}ms`,
          },
        },
      ],
    }),
  };
}

function dedupeObservations(observations: Observation[]): Observation[] {
  const byKey = new Map<string, Observation>();
  for (const observation of observations) {
    const key = `${observation.source}::${observation.description}`;
    if (!byKey.has(key)) {
      byKey.set(key, observation);
    }
  }
  return [...byKey.values()];
}

export const handleHighQueryLatency: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context: HighQueryLatencyContext = {
    ...baseContext,
    scopePredicate: buildQueryLogPredicate(baseContext.scope, baseContext.target),
  };
  const analyses = await Promise.all([
    analyzeFullScan(context),
    analyzeMergePressure(context),
    analyzeMemoryPressure(context),
  ]);
  const { candidates, excludedCandidates } = scoreCauseEvaluations(
    analyses.map((analysis) => analysis.evaluation)
  );
  const observations = dedupeObservations(analyses.flatMap((analysis) => analysis.observations));
  const queryLog = await collectQueryLog(context);
  const sampleQueryHash = String(queryLog.metrics["sample_query_hash"] ?? "");

  return {
    observations,
    candidates,
    excluded_candidates: excludedCandidates,
    possible_actions: HIGH_QUERY_LATENCY_ACTIONS,
    target:
      context.scope === "query_pattern" && sampleQueryHash
        ? {
            ...context.target,
            query_hash: context.target?.query_hash || sampleQueryHash,
          }
        : context.target,
  };
};

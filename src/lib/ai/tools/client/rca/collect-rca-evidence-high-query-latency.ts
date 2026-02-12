import {
  asNumber,
  buildQueryLogPredicate,
  evaluateRules,
  runQueries,
  scoreCandidate,
  type PossibleAction,
  type QueryResults,
  type QuerySpec,
  type RuleSpec,
  type SymptomContext,
  type SymptomResult,
  type Target,
} from "./collect-rca-evidence-common";

type HighQueryLatencyContext = SymptomContext & {
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
  ifNull(sumIf(value, metric = 'MemoryTracking') / nullIf(sumIf(value, metric = 'MemoryTracking') + sumIf(value, metric = 'MemoryAvailable'), 0) * 100, 0) AS memory_used_percent
FROM {clusterAllReplicas:system.asynchronous_metrics}`,
    toObservation: (row, _ctx) => ({
      source: "system.asynchronous_metrics",
      description: "Memory pressure snapshot",
      metrics: {
        memory_used_percent: Number(asNumber(row?.[0]).toFixed(2)),
      },
    }),
  },
];

const HIGH_QUERY_LATENCY_RULES: RuleSpec[] = [
  {
    cause: "full_scan",
    next_check_hints: [
      "inspect query plan for high-latency hashes and verify predicate selectivity",
    ],
    indicators: [
      {
        description: "avg read rows >= 1M",
        match: (r) => {
          const v = asNumber(r["query_log"]?.metrics["avg_read_rows"]);
          return { matched: v >= 1_000_000, actual: v.toFixed(2) };
        },
      },
      {
        description: "avg read bytes >= 1GB",
        match: (r) => {
          const v = asNumber(r["query_log"]?.metrics["avg_read_bytes"]);
          return { matched: v >= 1_000_000_000, actual: v.toFixed(2) };
        },
      },
      {
        description: "p99 latency >= 2000ms",
        required: true,
        match: (r) => {
          const v = asNumber(r["query_log"]?.metrics["p99_ms"]);
          return { matched: v >= 2000, actual: `${v.toFixed(2)}ms` };
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
        description: "active merges > 10",
        match: (r) => {
          const v = asNumber(r["merges"]?.metrics["active_merges"]);
          return { matched: v > 10, actual: v };
        },
      },
      {
        description: "max merge elapsed > 600s",
        match: (r) => {
          const v = asNumber(r["merges"]?.metrics["max_merge_elapsed_seconds"]);
          return { matched: v > 600, actual: `${v.toFixed(2)}s` };
        },
      },
      {
        description: "p95 latency >= 1000ms",
        match: (r) => {
          const v = asNumber(r["query_log"]?.metrics["p95_ms"]);
          return { matched: v >= 1000, actual: `${v.toFixed(2)}ms` };
        },
      },
    ],
  },
  {
    cause: "memory_pressure",
    indicators: [
      {
        required: true,
        description: "memory used >= 85%",
        match: (r) => {
          const v = asNumber(r["metrics"]?.metrics["memory_used_percent"]);
          return { matched: v >= 85, actual: `${v.toFixed(2)}%` };
        },
      },
      {
        description: "avg query memory >= 1GB",
        match: (r) => {
          const v = asNumber(r["query_log"]?.metrics["avg_memory_bytes"]);
          return { matched: v >= 1_000_000_000, actual: v.toFixed(2) };
        },
      },
      {
        description: "p99 latency >= 2000ms",
        match: (r) => {
          const v = asNumber(r["query_log"]?.metrics["p99_ms"]);
          return { matched: v >= 2000, actual: `${v.toFixed(2)}ms` };
        },
      },
    ],
  },
];

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

function resolveHighQueryLatencyTarget(
  context: SymptomContext,
  results: QueryResults
): Target | undefined {
  const { scope, target } = context;
  const sampleQueryHash = String(results["query_log"]?.metrics["sample_query_hash"] ?? "");
  if (scope === "query_pattern" && sampleQueryHash) {
    return {
      ...target,
      query_hash: target?.query_hash || sampleQueryHash,
    };
  }
  return target;
}

export async function collectHighQueryLatencyEvidence(context: SymptomContext): Promise<SymptomResult> {
  const { scope, target } = context;
  const ctx: HighQueryLatencyContext = {
    ...context,
    scopePredicate: buildQueryLogPredicate(scope, target),
  };

  const results = await runQueries(ctx, HIGH_QUERY_LATENCY_QUERIES);
  const candidateRules = evaluateRules(HIGH_QUERY_LATENCY_RULES, results);
  const candidates = candidateRules
    .map(scoreCandidate)
    .sort((a, b) => b.signal_strength - a.signal_strength);

  return {
    observations: Object.values(results),
    candidates,
    possible_actions: HIGH_QUERY_LATENCY_ACTIONS,
    target: resolveHighQueryLatencyTarget(context, results),
  };
}

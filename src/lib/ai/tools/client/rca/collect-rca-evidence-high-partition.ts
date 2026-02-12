import {
  asNumber,
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  discoverTargetTableByParts,
  evaluateRules,
  runProbe,
  runQueries,
  scoreCandidate,
  type PossibleAction,
  type QuerySpec,
  type RuleSpec,
  type SymptomContext,
  type SymptomResult,
  type Target,
} from "./collect-rca-evidence-common";

type HighPartitionCountContext = SymptomContext & {
  resolvedTarget: Target | undefined;
  partsTablePredicate: string;
  queryLogTablePredicate: string;
};

const HIGH_PARTITION_COUNT_QUERIES: QuerySpec<HighPartitionCountContext>[] = [
  {
    id: "partition_stats",
    progressStage: "rca high_partition_count: partition_stats",
    progressWeight: 40,
    sqlTemplate: `
SELECT
  uniqExact(partition) AS partition_count,
  count() AS active_parts,
  max(partition_parts) AS max_parts_per_partition
FROM (
  SELECT
    partition,
    count() AS partition_parts
  FROM {clusterAllReplicas:system.parts}
  WHERE active AND {partsTableFilterExpression}
  GROUP BY partition
)`,
    toObservation: (row, _ctx) => ({
      source: "system.parts",
      description: "Partition inventory and growth",
      metrics: {
        partition_count: asNumber(row?.[0]),
        active_parts: asNumber(row?.[1]),
        max_parts_per_partition: asNumber(row?.[2]),
      },
    }),
  },
  {
    id: "partition_growth",
    progressStage: "rca high_partition_count: partition_growth",
    progressWeight: 45,
    sqlTemplate: `
SELECT
  uniqExact(partition) AS recent_partitions
FROM {clusterAllReplicas:system.parts}
WHERE active
  AND modification_time >= now() - INTERVAL {timeWindowMinutes} MINUTE
  AND {partsTableFilterExpression}`,
    toObservation: (row, _ctx) => ({
      source: "system.parts",
      description: "Recent partition growth",
      metrics: {
        recent_partitions: asNumber(row?.[0]),
      },
    }),
  },
  {
    id: "table_meta",
    progressStage: "rca high_partition_count: table_meta",
    progressWeight: 50,
    sqlTemplate: `
SELECT
  any(partition_key) AS partition_key,
  any(engine) AS engine
FROM {clusterAllReplicas:system.tables}
WHERE database = '{resolvedTargetDatabase}'
  AND name = '{resolvedTargetTable}'`,
    toObservation: (row, _ctx) => ({
      source: "system.tables",
      description: "Partition key definition",
      metrics: {
        partition_key: String(row?.[0] ?? ""),
        engine: String(row?.[1] ?? "unknown"),
      },
    }),
  },
  {
    id: "insert_pattern",
    progressStage: "rca high_partition_count: insert_pattern",
    progressWeight: 55,
    sqlTemplate: `
SELECT
  count() AS inserts,
  avg(written_rows) AS avg_rows_per_insert
FROM {clusterAllReplicas:system.query_log}
WHERE {timeFilterExpression}
  AND type = 'QueryFinish'
  AND query_kind = 'Insert'
  AND {queryLogTableFilterExpression}`,
    toObservation: (row, _ctx) => ({
      source: "system.query_log",
      description: "Insert pressure for target table",
      metrics: {
        inserts: asNumber(row?.[0]),
        avg_rows_per_insert: Number(asNumber(row?.[1]).toFixed(2)),
      },
    }),
  },
];

const HIGH_PARTITION_COUNT_RULES: RuleSpec[] = [
  {
    cause: "partition_key_too_granular",
    indicators: [
      {
        description: "partition count > 1000",
        required: true,
        match: (r) => {
          const v = asNumber(r["partition_stats"]?.metrics["partition_count"]);
          return { matched: v > 1000, actual: v };
        },
      },
      {
        description: "partition key expression appears granular",
        match: (r) => {
          const v = String(r["table_meta"]?.metrics["partition_key"] ?? "");
          const granular =
            /toDate\(|toStartOfHour|toYYYYMMDD|toYYYYMMDDhh|cityHash|user_id|trace_id/i.test(v);
          return { matched: granular, actual: v || "none" };
        },
      },
      {
        description: "recent partitions > 100 in window",
        match: (r) => {
          const v = asNumber(r["partition_growth"]?.metrics["recent_partitions"]);
          return { matched: v > 100, actual: v };
        },
      },
    ],
  },
  {
    cause: "high_cardinality_partition_key",
    indicators: [
      {
        description: "partition count > 1000",
        required: true,
        match: (r) => {
          const v = asNumber(r["partition_stats"]?.metrics["partition_count"]);
          return { matched: v > 1000, actual: v };
        },
      },
      {
        description: "partition/parts ratio > 0.3",
        required: true,
        match: (r) => {
          const obs = r["partition_stats"];
          const partitionCount = asNumber(obs?.metrics["partition_count"]);
          const activeParts = asNumber(obs?.metrics["active_parts"]);
          const ratio = activeParts > 0 ? partitionCount / activeParts : 0;
          return { matched: activeParts > 0 && ratio > 0.3, actual: ratio.toFixed(2) };
        },
      },
      {
        description: "avg rows per insert < 10000",
        match: (r) => {
          const v = asNumber(r["insert_pattern"]?.metrics["avg_rows_per_insert"]);
          return { matched: v > 0 && v < 10_000, actual: v.toFixed(2) };
        },
      },
    ],
  },
  {
    cause: "unbounded_partition_growth",
    next_check_hints: ["review partition lifecycle policy and retention granularity"],
    indicators: [
      {
        description: "recent partitions > 100 in window",
        required: true,
        match: (r) => {
          const v = asNumber(r["partition_growth"]?.metrics["recent_partitions"]);
          return { matched: v > 100, actual: v };
        },
      },
      {
        description: "partition count > 500",
        match: (r) => {
          const v = asNumber(r["partition_stats"]?.metrics["partition_count"]);
          return { matched: v > 500, actual: v };
        },
      },
      {
        description: "engine is MergeTree family",
        match: (r) => {
          const v = String(r["table_meta"]?.metrics["engine"] ?? "unknown");
          return { matched: /MergeTree/i.test(v), actual: v };
        },
      },
    ],
  },
];

const HIGH_PARTITION_COUNT_ACTIONS: PossibleAction[] = [
  {
    title: "Coarsen partition key granularity (for example month-level time partition)",
    risk: "high",
    tied_to: "partition_key_too_granular",
  },
  {
    title: "Align partitioning with lifecycle management and retention",
    risk: "medium",
    tied_to: "unbounded_partition_growth",
  },
  {
    title: "Reduce insert fragmentation to avoid compounding partition pressure",
    risk: "low",
    tied_to: "high_cardinality_partition_key",
  },
];

export async function collectHighPartitionCountEvidence(context: SymptomContext): Promise<SymptomResult> {
  const { connection, scope, target } = context;
  const resolvedTarget = await runProbe(
    context,
    "rca high_partition_count: target_table",
    35,
    async () => discoverTargetTableByParts(connection, scope, target)
  );

  const ctx: HighPartitionCountContext = {
    ...context,
    resolvedTarget,
    partsTablePredicate: buildPartsTablePredicate(resolvedTarget),
    queryLogTablePredicate: buildQueryLogPredicate("table", resolvedTarget),
  };

  const results = await runQueries(ctx, HIGH_PARTITION_COUNT_QUERIES);
  const candidateRules = evaluateRules(HIGH_PARTITION_COUNT_RULES, results);
  const candidates = candidateRules
    .map(scoreCandidate)
    .sort((a, b) => b.signal_strength - a.signal_strength);

  return {
    observations: Object.values(results),
    candidates,
    possible_actions: HIGH_PARTITION_COUNT_ACTIONS,
    target: resolvedTarget,
  };
}

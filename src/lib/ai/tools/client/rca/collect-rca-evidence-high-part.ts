import {
  asNumber,
  buildNodePredicate,
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  discoverTargetTableByParts,
  evaluateRules,
  runProbe,
  runQueries,
  scoreCandidate,
  type CanonicalSymptom,
  type CauseCandidate,
  type PossibleAction,
  type QueryResults,
  type QuerySpec,
  type RuleSpec,
  type SymptomContext,
  type SymptomResult,
  type Target,
} from "./collect-rca-evidence-common";

type HighPartCountContext = SymptomContext & {
  resolvedTarget: Target | undefined;
  partsTablePredicate: string;
  queryLogTablePredicate: string;
  nodePredicate: string;
};

const HIGH_PART_COUNT_QUERIES: QuerySpec<HighPartCountContext>[] = [
  {
    id: "parts_summary",
    progressStage: "rca high_part_count: parts_summary",
    progressWeight: 40,
    sqlTemplate: `
SELECT
  sum(active_parts_per_partition) AS total_active_parts,
  uniqExact(partition) AS distinct_partitions,
  max(active_parts_per_partition) AS max_parts_per_partition
FROM (
  SELECT
    partition,
    count() AS active_parts_per_partition
  FROM {clusterAllReplicas:system.parts}
  WHERE active AND {partsTableFilterExpression}
  GROUP BY partition
)`,
    toObservation: (row, _ctx) => ({
      source: "system.parts",
      description: "Part inventory for target table",
      metrics: {
        total_active_parts: asNumber(row?.[0]),
        distinct_partitions: asNumber(row?.[1]),
        max_parts_per_partition: asNumber(row?.[2]),
      },
    }),
  },
  {
    id: "merges",
    progressStage: "rca high_part_count: merges",
    progressWeight: 45,
    sqlTemplate: `
SELECT
  count() AS active_merges,
  max(elapsed) AS max_merge_elapsed
FROM {clusterAllReplicas:system.merges}
WHERE {nodeFilterExpression}`,
    toObservation: (row, _ctx) => ({
      source: "system.merges",
      description: "Merge pressure around target scope",
      metrics: {
        active_merges: asNumber(row?.[0]),
        max_merge_elapsed_seconds: Number(asNumber(row?.[1]).toFixed(2)),
      },
    }),
  },
  {
    id: "insert_pattern",
    progressStage: "rca high_part_count: insert_pattern",
    progressWeight: 50,
    sqlTemplate: `
SELECT
  count() AS inserts,
  avg(written_rows) AS avg_rows_per_insert
FROM {clusterAllReplicas:system.query_log}
WHERE {timeFilterExpression}
  AND type = 'QueryFinish'
  AND query_kind = 'Insert'
  AND {queryLogTableFilterExpression}`,
    toObservation: (row, ctx) => {
      const insertCount = asNumber(row?.[0]);
      const avgRowsPerInsert = asNumber(row?.[1]);
      const insertsPerMinute =
        ctx.timeWindowMinutes > 0 ? insertCount / ctx.timeWindowMinutes : insertCount;
      return {
        source: "system.query_log",
        description: `Insert pattern over last ${ctx.timeWindowMinutes} minutes`,
        metrics: {
          inserts: insertCount,
          inserts_per_minute: Number(insertsPerMinute.toFixed(2)),
          avg_rows_per_insert: Number(avgRowsPerInsert.toFixed(2)),
        },
      };
    },
  },
  {
    id: "table_meta",
    progressStage: "rca high_part_count: table_meta",
    progressWeight: 55,
    sqlTemplate: `
SELECT
  any(engine) AS engine,
  any(partition_key) AS partition_key
FROM {clusterAllReplicas:system.tables}
WHERE database = '{resolvedTargetDatabase}'
  AND name = '{resolvedTargetTable}'`,
    toObservation: (row, _ctx) => ({
      source: "system.tables",
      description: "Table engine and partition key",
      metrics: {
        engine: String(row?.[0] ?? "unknown"),
        partition_key: String(row?.[1] ?? ""),
      },
    }),
  },
];

const HIGH_PART_COUNT_RULES: RuleSpec[] = [
  {
    cause: "insert_too_frequent",
    next_check_hints: ["increase insert batch size and reduce insert frequency"],
    indicators: [
      {
        description: "inserts per minute > 10",
        match: (r) => {
          const v = asNumber(r["insert_pattern"]?.metrics["inserts_per_minute"]);
          return { matched: v > 10, actual: v.toFixed(2) };
        },
      },
      {
        description: "avg rows per insert < 10000",
        match: (r) => {
          const v = asNumber(r["insert_pattern"]?.metrics["avg_rows_per_insert"]);
          return { matched: v > 0 && v < 10_000, actual: v.toFixed(2) };
        },
      },
      {
        description: "total active parts > 3000",
        required: true,
        match: (r) => {
          const v = asNumber(r["parts_summary"]?.metrics["total_active_parts"]);
          return { matched: v > 3000, actual: v };
        },
      },
    ],
  },
  {
    cause: "merge_backlog",
    indicators: [
      {
        description: "active merges > 20",
        match: (r) => {
          const v = asNumber(r["merges"]?.metrics["active_merges"]);
          return { matched: v > 20, actual: v };
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
        description: "total active parts > 3000",
        required: true,
        match: (r) => {
          const v = asNumber(r["parts_summary"]?.metrics["total_active_parts"]);
          return { matched: v > 3000, actual: v };
        },
      },
    ],
  },
  {
    cause: "partition_granularity_pressure",
    next_check_hints: [
      "run collect_rca_evidence with symptom=high_partition_count for partition-key RCA",
    ],
    indicators: [
      {
        description: "distinct partitions > 500",
        required: true,
        match: (r) => {
          const v = asNumber(r["parts_summary"]?.metrics["distinct_partitions"]);
          return { matched: v > 500, actual: v };
        },
      },
      {
        description: "partition/parts ratio > 0.2",
        match: (r) => {
          const obs = r["parts_summary"];
          const total = asNumber(obs?.metrics["total_active_parts"]);
          const distinct = asNumber(obs?.metrics["distinct_partitions"]);
          const ratio = total > 0 ? distinct / total : 0;
          return { matched: total > 0 && ratio > 0.2, actual: ratio.toFixed(2) };
        },
      },
      {
        description: "partition key is configured",
        match: (r) => {
          const v = String(r["table_meta"]?.metrics["partition_key"] ?? "");
          return { matched: v.length > 0, actual: v || "none" };
        },
      },
    ],
  },
  {
    cause: "wrong_engine_settings",
    next_check_hints: ["review merge-tree table settings and per-table insert patterns"],
    indicators: [
      {
        description: "engine is MergeTree family",
        blocker: true,
        match: (r) => {
          const v = String(r["table_meta"]?.metrics["engine"] ?? "unknown");
          return { matched: /MergeTree/i.test(v), actual: v };
        },
      },
      {
        description: "total active parts > 3000",
        required: true,
        match: (r) => {
          const v = asNumber(r["parts_summary"]?.metrics["total_active_parts"]);
          return { matched: v > 3000, actual: v };
        },
      },
      {
        description: "max parts in one partition > 1000",
        required: true,
        match: (r) => {
          const v = asNumber(r["parts_summary"]?.metrics["max_parts_per_partition"]);
          return { matched: v > 1000, actual: v };
        },
      },
    ],
  },
];

const HIGH_PART_COUNT_ACTIONS: PossibleAction[] = [
  {
    title: "Increase insert batch size and reduce insert frequency",
    risk: "low",
    tied_to: "insert_too_frequent",
  },
  {
    title: "Investigate merge backlog and node merge pressure",
    risk: "medium",
    tied_to: "merge_backlog",
  },
  {
    title: "Review partition key granularity and lifecycle alignment",
    risk: "high",
    tied_to: "partition_granularity_pressure",
  },
];

function computeHighPartCountRelatedSymptoms(
  results: QueryResults,
  candidates: CauseCandidate[]
): CanonicalSymptom[] {
  const parts = results["parts_summary"];
  const distinctPartitions = asNumber(parts?.metrics["distinct_partitions"]);
  const partitionPressureCandidate = candidates.find(
    (c) => c.cause === "partition_granularity_pressure"
  );
  if (distinctPartitions >= 100 || (partitionPressureCandidate?.signal_strength ?? 0) >= 0.3) {
    return ["high_partition_count"];
  }
  return [];
}

export async function collectHighPartCountEvidence(context: SymptomContext): Promise<SymptomResult> {
  const { connection, scope, target } = context;
  const resolvedTarget = await runProbe(
    context,
    "rca high_part_count: target_table",
    35,
    async () => discoverTargetTableByParts(connection, scope, target)
  );

  const ctx: HighPartCountContext = {
    ...context,
    resolvedTarget,
    partsTablePredicate: buildPartsTablePredicate(resolvedTarget),
    queryLogTablePredicate: buildQueryLogPredicate("table", resolvedTarget),
    nodePredicate: buildNodePredicate(scope, resolvedTarget, "FQDN()"),
  };

  const results = await runQueries(ctx, HIGH_PART_COUNT_QUERIES);
  const candidateRules = evaluateRules(HIGH_PART_COUNT_RULES, results);
  const candidates = candidateRules
    .map(scoreCandidate)
    .sort((a, b) => b.signal_strength - a.signal_strength);

  return {
    observations: Object.values(results),
    candidates,
    possible_actions: HIGH_PART_COUNT_ACTIONS,
    target: resolvedTarget,
    related_symptoms: computeHighPartCountRelatedSymptoms(results, candidates),
  };
}

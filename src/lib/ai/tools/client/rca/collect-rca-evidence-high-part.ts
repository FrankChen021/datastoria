import {
  asNumber,
  buildNodePredicate,
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  discoverTargetTableByParts,
  enrichPartitionKeyColumns,
  runProbe,
  runScenarioEvidence,
  type CanonicalSymptom,
  type CauseCandidate,
  type PossibleAction,
  type QueryResults,
  type QuerySpec,
  type RcaThresholds,
  type RuleSpec,
  type ScenarioSpec,
  type SymptomContext,
  type SymptomHandler,
  type Target,
} from "./collect-rca-evidence-common";

export type HighPartCountContext = SymptomContext & {
  resolvedTarget: Target | undefined;
  partsTablePredicate: string;
  queryLogTablePredicate: string;
  nodePredicate: string;
};

const HIGH_PART_COUNT_QUERIES: QuerySpec<HighPartCountContext>[] = [
  {
    id: "parts_replica_totals",
    progressStage: "rca high_part_count: parts_replica_totals",
    progressWeight: 40,
    sqlTemplate: `
SELECT
  count() AS total_active_parts
FROM {clusterAllReplicas:system.parts}
WHERE active AND {partsTableFilterExpression}`,
    toObservation: (row, _ctx) => ({
      source: "system.parts",
      description: "Replica-inclusive active part count for target table",
      metrics: {
        total_active_parts: asNumber(row?.[0]),
      },
    }),
  },
  {
    id: "parts_logical_partition_stats",
    progressStage: "rca high_part_count: parts_logical_partition_stats",
    progressWeight: 43,
    sqlTemplate: `
SELECT
  uniqExact(partition) AS distinct_partitions,
  max(logical_parts_per_partition) AS max_parts_per_partition
FROM (
  SELECT
    partition,
    uniqExact(name) AS logical_parts_per_partition
  FROM {clusterAllReplicas:system.parts}
  WHERE active AND {partsTableFilterExpression}
  GROUP BY partition
)`,
    toObservation: (row, _ctx) => ({
      source: "system.parts",
      description: "Logical (replica-deduplicated) part inventory by partition",
      metrics: {
        distinct_partitions: asNumber(row?.[0]),
        max_parts_per_partition: asNumber(row?.[1]),
      },
    }),
  },
  {
    id: "parts_node_partition_ratio",
    progressStage: "rca high_part_count: parts_node_partition_ratio",
    progressWeight: 44,
    sqlTemplate: `
SELECT
  max(node_partition_to_parts_ratio) AS max_node_partition_to_parts_ratio,
  avg(node_partition_to_parts_ratio) AS avg_node_partition_to_parts_ratio,
  ifNull(argMax(host_name, node_partition_to_parts_ratio), '') AS top_ratio_node
FROM (
  SELECT
    host_name,
    if(sum(logical_parts_per_partition) = 0, 0, uniqExact(partition) / sum(logical_parts_per_partition)) AS node_partition_to_parts_ratio
  FROM (
    SELECT
      FQDN() AS host_name,
      partition,
      uniqExact(name) AS logical_parts_per_partition
    FROM {clusterAllReplicas:system.parts}
    WHERE active AND {partsTableFilterExpression}
    GROUP BY host_name, partition
  )
  GROUP BY host_name
)`,
    toObservation: (row, _ctx) => ({
      source: "system.parts",
      description: "Per-node partition-to-parts ratio (logical, replica-deduplicated within node)",
      metrics: {
        max_node_partition_to_parts_ratio: Number(asNumber(row?.[0]).toFixed(4)),
        avg_node_partition_to_parts_ratio: Number(asNumber(row?.[1]).toFixed(4)),
        top_ratio_node: String(row?.[2] ?? ""),
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
WHERE {nodeFilterExpression}
  AND {partsTableFilterExpression}`,
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
FROM system.tables
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

function getHighPartCounts(results: QueryResults): {
  replicaTotalActiveParts: number;
  distinctPartitions: number;
  maxPartsPerPartition: number;
  maxNodePartitionToPartsRatio: number;
  avgNodePartitionToPartsRatio: number;
} {
  const replicaTotals = results["parts_replica_totals"];
  const logicalStats = results["parts_logical_partition_stats"];
  const nodeRatio = results["parts_node_partition_ratio"];
  return {
    replicaTotalActiveParts: asNumber(replicaTotals?.metrics["total_active_parts"]),
    distinctPartitions: asNumber(logicalStats?.metrics["distinct_partitions"]),
    maxPartsPerPartition: asNumber(logicalStats?.metrics["max_parts_per_partition"]),
    maxNodePartitionToPartsRatio: asNumber(nodeRatio?.metrics["max_node_partition_to_parts_ratio"]),
    avgNodePartitionToPartsRatio: asNumber(nodeRatio?.metrics["avg_node_partition_to_parts_ratio"]),
  };
}

function buildHighPartCountRules(thresholds: RcaThresholds): RuleSpec[] {
  const t = thresholds.high_part_count;
  return [
    {
      cause: "insert_too_frequent",
      next_check_hints: ["increase insert batch size and reduce insert frequency"],
      indicators: [
        {
          description: `inserts per minute > ${t.inserts_per_minute_gt}`,
          required: true,
          match: (r) => {
            const v = asNumber(r["insert_pattern"]?.metrics["inserts_per_minute"]);
            return { matched: v > t.inserts_per_minute_gt, actual: v.toFixed(2) };
          },
        },
        {
          description: `avg rows per insert < ${t.avg_rows_per_insert_lt}`,
          match: (r) => {
            const v = asNumber(r["insert_pattern"]?.metrics["avg_rows_per_insert"]);
            return { matched: v > 0 && v < t.avg_rows_per_insert_lt, actual: v.toFixed(2) };
          },
        },
        {
          description: `total active parts > ${t.total_active_parts_gt}`,
          required: true,
          match: (r) => {
            const v = getHighPartCounts(r).replicaTotalActiveParts;
            return { matched: v > t.total_active_parts_gt, actual: v };
          },
        },
      ],
    },
    {
      cause: "merge_backlog",
      indicators: [
        {
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
            return { matched: v > t.max_merge_elapsed_seconds_gt, actual: `${v.toFixed(2)}s` };
          },
        },
        {
          description: `total active parts > ${t.total_active_parts_gt}`,
          required: true,
          match: (r) => {
            const v = getHighPartCounts(r).replicaTotalActiveParts;
            return { matched: v > t.total_active_parts_gt, actual: v };
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
          description: `distinct partitions > ${t.distinct_partitions_gt}`,
          required: true,
          match: (r) => {
            const v = getHighPartCounts(r).distinctPartitions;
            return { matched: v > t.distinct_partitions_gt, actual: v };
          },
        },
        {
          description: `partition/parts ratio > ${t.partition_to_parts_ratio_gt}`,
          match: (r) => {
            const counts = getHighPartCounts(r);
            const ratio = counts.maxNodePartitionToPartsRatio;
            return {
              matched: ratio > t.partition_to_parts_ratio_gt,
              actual: `max_node=${ratio.toFixed(2)} avg_node=${counts.avgNodePartitionToPartsRatio.toFixed(2)}`,
            };
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
          description: `total active parts > ${t.total_active_parts_gt}`,
          required: true,
          match: (r) => {
            const v = getHighPartCounts(r).replicaTotalActiveParts;
            return { matched: v > t.total_active_parts_gt, actual: v };
          },
        },
        {
          description: `max parts in one partition > ${t.max_parts_per_partition_gt}`,
          required: true,
          match: (r) => {
            const v = getHighPartCounts(r).maxPartsPerPartition;
            return { matched: v > t.max_parts_per_partition_gt, actual: v };
          },
        },
      ],
    },
  ];
}

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
  candidates: CauseCandidate[],
  thresholds: RcaThresholds
): CanonicalSymptom[] {
  const t = thresholds.high_part_count;
  const distinctPartitions = getHighPartCounts(results).distinctPartitions;
  const partitionPressureCandidate = candidates.find(
    (candidate) => candidate.cause === "partition_granularity_pressure"
  );
  if (
    distinctPartitions >= t.related_symptom_distinct_partitions_gte ||
    (partitionPressureCandidate?.signal_strength ?? 0) >= t.related_symptom_signal_strength_gte
  ) {
    return ["high_partition_count"];
  }
  return [];
}

export const HIGH_PART_COUNT_SCENARIO: ScenarioSpec<HighPartCountContext> = {
  queries: HIGH_PART_COUNT_QUERIES,
  rules: (context) => buildHighPartCountRules(context.thresholds),
  possible_actions: HIGH_PART_COUNT_ACTIONS,
  prepareContext: async (baseContext) => {
    const resolvedTarget = await runProbe(
      baseContext,
      "rca high_part_count: target_table",
      35,
      async () =>
        discoverTargetTableByParts(baseContext.connection, baseContext.scope, baseContext.target)
    );
    return {
      ...baseContext,
      resolvedTarget,
      partsTablePredicate: buildPartsTablePredicate(resolvedTarget),
      queryLogTablePredicate: buildQueryLogPredicate("table", resolvedTarget),
      nodePredicate: buildNodePredicate(baseContext.scope, resolvedTarget, "FQDN()"),
    };
  },
  finalizeResult: ({ context, results, candidates }) => ({
    target: context.resolvedTarget,
    related_symptoms: computeHighPartCountRelatedSymptoms(results, candidates, context.thresholds),
  }),
};

export const handleHighPartCount: SymptomHandler = async (context) => {
  const result = await runScenarioEvidence(context, HIGH_PART_COUNT_SCENARIO);
  await enrichPartitionKeyColumns(
    context,
    result.target ?? context.target,
    result.observations,
    "rca high_part_count: partition_key_columns",
    60
  );
  return result;
};

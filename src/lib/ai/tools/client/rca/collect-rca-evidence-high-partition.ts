import {
  asNumber,
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  discoverTargetTableByParts,
  enrichPartitionKeyColumns,
  runProbe,
  runScenarioEvidence,
  type PossibleAction,
  type QuerySpec,
  type RcaThresholds,
  type RuleSpec,
  type ScenarioSpec,
  type SymptomContext,
  type SymptomHandler,
  type Target,
} from "./collect-rca-evidence-common";

export type HighPartitionCountContext = SymptomContext & {
  resolvedTarget: Target | undefined;
  partsTablePredicate: string;
  queryLogTablePredicate: string;
};

const HIGH_PARTITION_COUNT_QUERIES: QuerySpec<HighPartitionCountContext>[] = [
  {
    id: "partition_replica_totals",
    progressStage: "rca high_partition_count: partition_replica_totals",
    progressWeight: 40,
    sqlTemplate: `
SELECT
  count() AS replica_active_parts
FROM {clusterAllReplicas:system.parts}
WHERE active AND {partsTableFilterExpression}`,
    toObservation: (row, _ctx) => ({
      source: "system.parts",
      description: "Replica-inclusive active part count for target table",
      metrics: {
        replica_active_parts: asNumber(row?.[0]),
      },
    }),
  },
  {
    id: "partition_logical_stats",
    progressStage: "rca high_partition_count: partition_logical_stats",
    progressWeight: 43,
    sqlTemplate: `
SELECT
  uniqExact(partition) AS partition_count,
  sum(logical_parts_per_partition) AS active_parts,
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
      description: "Logical (replica-deduplicated) partition inventory",
      metrics: {
        partition_count: asNumber(row?.[0]),
        active_parts: asNumber(row?.[1]),
        max_parts_per_partition: asNumber(row?.[2]),
      },
    }),
  },
  {
    id: "partition_node_ratio",
    progressStage: "rca high_partition_count: partition_node_ratio",
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
FROM system.tables
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

function getHighPartitionCounts(
  results: Record<string, { metrics: Record<string, unknown> } | undefined>
) {
  const logicalStats = results["partition_logical_stats"];
  const replicaTotals = results["partition_replica_totals"];
  return {
    partitionCount: asNumber(logicalStats?.metrics["partition_count"]),
    logicalActiveParts: asNumber(logicalStats?.metrics["active_parts"]),
    maxPartsPerPartition: asNumber(logicalStats?.metrics["max_parts_per_partition"]),
    replicaActiveParts: asNumber(replicaTotals?.metrics["replica_active_parts"]),
    maxNodePartitionToPartsRatio: asNumber(
      results["partition_node_ratio"]?.metrics["max_node_partition_to_parts_ratio"]
    ),
    avgNodePartitionToPartsRatio: asNumber(
      results["partition_node_ratio"]?.metrics["avg_node_partition_to_parts_ratio"]
    ),
  };
}

function buildHighPartitionCountRules(thresholds: RcaThresholds): RuleSpec[] {
  const t = thresholds.high_partition_count;
  return [
    {
      cause: "partition_key_too_granular",
      indicators: [
        {
          description: `partition count > ${t.partition_count_gt}`,
          required: true,
          match: (r) => {
            const v = getHighPartitionCounts(r).partitionCount;
            return { matched: v > t.partition_count_gt, actual: v };
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
          description: `recent partitions > ${t.recent_partitions_gt} in window`,
          match: (r) => {
            const v = asNumber(r["partition_growth"]?.metrics["recent_partitions"]);
            return { matched: v > t.recent_partitions_gt, actual: v };
          },
        },
      ],
    },
    {
      cause: "high_cardinality_partition_key",
      indicators: [
        {
          description: `partition count > ${t.partition_count_gt}`,
          required: true,
          match: (r) => {
            const v = getHighPartitionCounts(r).partitionCount;
            return { matched: v > t.partition_count_gt, actual: v };
          },
        },
        {
          description: `partition/parts ratio > ${t.partition_to_parts_ratio_gt}`,
          required: true,
          match: (r) => {
            const counts = getHighPartitionCounts(r);
            const ratio = counts.maxNodePartitionToPartsRatio;
            return {
              matched: ratio > t.partition_to_parts_ratio_gt,
              actual: `max_node=${ratio.toFixed(2)} avg_node=${counts.avgNodePartitionToPartsRatio.toFixed(2)}`,
            };
          },
        },
        {
          description: `avg rows per insert < ${t.avg_rows_per_insert_lt}`,
          match: (r) => {
            const v = asNumber(r["insert_pattern"]?.metrics["avg_rows_per_insert"]);
            return { matched: v > 0 && v < t.avg_rows_per_insert_lt, actual: v.toFixed(2) };
          },
        },
      ],
    },
    {
      cause: "unbounded_partition_growth",
      next_check_hints: ["review partition lifecycle policy and retention granularity"],
      indicators: [
        {
          description: `recent partitions > ${t.recent_partitions_gt} in window`,
          required: true,
          match: (r) => {
            const v = asNumber(r["partition_growth"]?.metrics["recent_partitions"]);
            return { matched: v > t.recent_partitions_gt, actual: v };
          },
        },
        {
          description: `partition count > ${t.unbounded_growth_partition_count_gt}`,
          match: (r) => {
            const v = getHighPartitionCounts(r).partitionCount;
            return { matched: v > t.unbounded_growth_partition_count_gt, actual: v };
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
}

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

export const HIGH_PARTITION_COUNT_SCENARIO: ScenarioSpec<HighPartitionCountContext> = {
  queries: HIGH_PARTITION_COUNT_QUERIES,
  rules: (context) => buildHighPartitionCountRules(context.thresholds),
  possible_actions: HIGH_PARTITION_COUNT_ACTIONS,
  prepareContext: async (baseContext) => {
    const resolvedTarget = await runProbe(
      baseContext,
      "rca high_partition_count: target_table",
      35,
      async () =>
        discoverTargetTableByParts(baseContext.connection, baseContext.scope, baseContext.target)
    );
    return {
      ...baseContext,
      resolvedTarget,
      partsTablePredicate: buildPartsTablePredicate(resolvedTarget),
      queryLogTablePredicate: buildQueryLogPredicate("table", resolvedTarget),
    };
  },
  finalizeResult: ({ context }) => ({
    target: context.resolvedTarget,
  }),
};

export const handleHighPartitionCount: SymptomHandler = async (context) => {
  const result = await runScenarioEvidence(context, HIGH_PARTITION_COUNT_SCENARIO);
  await enrichPartitionKeyColumns(
    context,
    result.target ?? context.target,
    result.observations,
    "rca high_partition_count: partition_key_columns",
    58
  );
  return result;
};

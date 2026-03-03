import {
  asNumber,
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  collectObservation,
  discoverTargetTableByParts,
  enrichPartitionKeyColumns,
  evaluateCandidate,
  runQuery,
  scoreCauseEvaluations,
  type Observation,
  type PossibleAction,
  type RcaThresholds,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
  type Target,
} from "./collect-rca-evidence-common";

type HighPartitionCountContext = SymptomContext & {
  resolvedTarget: Target | undefined;
  partsTablePredicate: string;
  queryLogTablePredicate: string;
};

type HighPartitionCountEvidence = {
  replicaTotals: Observation;
  logicalStats: Observation;
  nodeRatio: Observation;
  partitionGrowth: Observation;
  tableMeta: Observation;
  insertPattern: Observation;
};

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

async function prepareHighPartitionCountContext(
  baseContext: SymptomContext
): Promise<HighPartitionCountContext> {
  const resolvedTarget = await runQuery(
    baseContext,
    "rca high_partition_count: target_table",
    35,
    async () => discoverTargetTableByParts(baseContext.connection, baseContext.scope, baseContext.target)
  );

  return {
    ...baseContext,
    resolvedTarget,
    partsTablePredicate: buildPartsTablePredicate(resolvedTarget),
    queryLogTablePredicate: buildQueryLogPredicate("table", resolvedTarget),
  };
}

async function collectHighPartitionCountEvidence(
  context: HighPartitionCountContext
): Promise<HighPartitionCountEvidence> {
  const replicaTotals = await collectObservation({
    context,
    stage: "rca high_partition_count: partition_replica_totals",
    progress: 40,
    sqlTemplate: `
SELECT
  count() AS replica_active_parts
FROM {clusterAllReplicas:system.parts}
WHERE active AND {partsTableFilterExpression}`,
    toObservation: (row) => ({
      source: "system.parts",
      description: "Replica-inclusive active part count for target table",
      metrics: {
        replica_active_parts: asNumber(row?.[0]),
      },
    }),
  });

  const logicalStats = await collectObservation({
    context,
    stage: "rca high_partition_count: partition_logical_stats",
    progress: 43,
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
    toObservation: (row) => ({
      source: "system.parts",
      description: "Logical (replica-deduplicated) partition inventory",
      metrics: {
        partition_count: asNumber(row?.[0]),
        active_parts: asNumber(row?.[1]),
        max_parts_per_partition: asNumber(row?.[2]),
      },
    }),
  });

  const nodeRatio = await collectObservation({
    context,
    stage: "rca high_partition_count: partition_node_ratio",
    progress: 44,
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
    toObservation: (row) => ({
      source: "system.parts",
      description: "Per-node partition-to-parts ratio (logical, replica-deduplicated within node)",
      metrics: {
        max_node_partition_to_parts_ratio: Number(asNumber(row?.[0]).toFixed(4)),
        avg_node_partition_to_parts_ratio: Number(asNumber(row?.[1]).toFixed(4)),
        top_ratio_node: String(row?.[2] ?? ""),
      },
    }),
  });

  const partitionGrowth = await collectObservation({
    context,
    stage: "rca high_partition_count: partition_growth",
    progress: 45,
    sqlTemplate: `
SELECT
  uniqExact(partition) AS recent_partitions
FROM {clusterAllReplicas:system.parts}
WHERE active
  AND modification_time >= now() - INTERVAL {timeWindowMinutes} MINUTE
  AND {partsTableFilterExpression}`,
    toObservation: (row) => ({
      source: "system.parts",
      description: "Recent partition growth",
      metrics: {
        recent_partitions: asNumber(row?.[0]),
      },
    }),
  });

  const tableMeta = await collectObservation({
    context,
    stage: "rca high_partition_count: table_meta",
    progress: 50,
    sqlTemplate: `
SELECT
  any(partition_key) AS partition_key,
  any(engine) AS engine
FROM system.tables
WHERE database = '{resolvedTargetDatabase}'
  AND name = '{resolvedTargetTable}'`,
    toObservation: (row) => ({
      source: "system.tables",
      description: "Partition key definition",
      metrics: {
        partition_key: String(row?.[0] ?? ""),
        engine: String(row?.[1] ?? "unknown"),
      },
    }),
  });

  const insertPattern = await collectObservation({
    context,
    stage: "rca high_partition_count: insert_pattern",
    progress: 55,
    sqlTemplate: `
SELECT
  count() AS inserts,
  avg(written_rows) AS avg_rows_per_insert
FROM {clusterAllReplicas:system.query_log}
WHERE {timeFilterExpression}
  AND type = 'QueryFinish'
  AND query_kind = 'Insert'
  AND {queryLogTableFilterExpression}`,
    toObservation: (row) => ({
      source: "system.query_log",
      description: "Insert pressure for target table",
      metrics: {
        inserts: asNumber(row?.[0]),
        avg_rows_per_insert: Number(asNumber(row?.[1]).toFixed(2)),
      },
    }),
  });

  return {
    replicaTotals,
    logicalStats,
    nodeRatio,
    partitionGrowth,
    tableMeta,
    insertPattern,
  };
}

function getHighPartitionCounts(evidence: HighPartitionCountEvidence) {
  return {
    partitionCount: asNumber(evidence.logicalStats.metrics["partition_count"]),
    logicalActiveParts: asNumber(evidence.logicalStats.metrics["active_parts"]),
    maxPartsPerPartition: asNumber(evidence.logicalStats.metrics["max_parts_per_partition"]),
    replicaActiveParts: asNumber(evidence.replicaTotals.metrics["replica_active_parts"]),
    maxNodePartitionToPartsRatio: asNumber(
      evidence.nodeRatio.metrics["max_node_partition_to_parts_ratio"]
    ),
    avgNodePartitionToPartsRatio: asNumber(
      evidence.nodeRatio.metrics["avg_node_partition_to_parts_ratio"]
    ),
  };
}

function evaluateHighPartitionCountCandidates(
  evidence: HighPartitionCountEvidence,
  thresholds: RcaThresholds
) {
  const t = thresholds.high_partition_count;
  const counts = getHighPartitionCounts(evidence);

  return [
    evaluateCandidate({
      cause: "partition_key_too_granular",
      indicators: [
        {
          description: `partition count > ${t.partition_count_gt}`,
          required: true,
          evaluation: {
            matched: counts.partitionCount > t.partition_count_gt,
            actual: counts.partitionCount,
          },
        },
        {
          description: "partition key expression appears granular",
          evaluation: {
            matched: /toDate\(|toStartOfHour|toYYYYMMDD|toYYYYMMDDhh|cityHash|user_id|trace_id/i.test(
              String(evidence.tableMeta.metrics["partition_key"] ?? "")
            ),
            actual: String(evidence.tableMeta.metrics["partition_key"] ?? "") || "none",
          },
        },
        {
          description: `recent partitions > ${t.recent_partitions_gt} in window`,
          evaluation: {
            matched: asNumber(evidence.partitionGrowth.metrics["recent_partitions"]) > t.recent_partitions_gt,
            actual: asNumber(evidence.partitionGrowth.metrics["recent_partitions"]),
          },
        },
      ],
    }),
    evaluateCandidate({
      cause: "high_cardinality_partition_key",
      indicators: [
        {
          description: `partition count > ${t.partition_count_gt}`,
          required: true,
          evaluation: {
            matched: counts.partitionCount > t.partition_count_gt,
            actual: counts.partitionCount,
          },
        },
        {
          description: `partition/parts ratio > ${t.partition_to_parts_ratio_gt}`,
          required: true,
          evaluation: {
            matched: counts.maxNodePartitionToPartsRatio > t.partition_to_parts_ratio_gt,
            actual: `max_node=${counts.maxNodePartitionToPartsRatio.toFixed(2)} avg_node=${counts.avgNodePartitionToPartsRatio.toFixed(2)}`,
          },
        },
        {
          description: `avg rows per insert < ${t.avg_rows_per_insert_lt}`,
          evaluation: {
            matched:
              asNumber(evidence.insertPattern.metrics["avg_rows_per_insert"]) > 0 &&
              asNumber(evidence.insertPattern.metrics["avg_rows_per_insert"]) <
                t.avg_rows_per_insert_lt,
            actual: asNumber(evidence.insertPattern.metrics["avg_rows_per_insert"]).toFixed(2),
          },
        },
      ],
    }),
    evaluateCandidate({
      cause: "unbounded_partition_growth",
      next_check_hints: ["review partition lifecycle policy and retention granularity"],
      indicators: [
        {
          description: `recent partitions > ${t.recent_partitions_gt} in window`,
          required: true,
          evaluation: {
            matched: asNumber(evidence.partitionGrowth.metrics["recent_partitions"]) > t.recent_partitions_gt,
            actual: asNumber(evidence.partitionGrowth.metrics["recent_partitions"]),
          },
        },
        {
          description: `partition count > ${t.unbounded_growth_partition_count_gt}`,
          evaluation: {
            matched: counts.partitionCount > t.unbounded_growth_partition_count_gt,
            actual: counts.partitionCount,
          },
        },
        {
          description: "engine is MergeTree family",
          evaluation: {
            matched: /MergeTree/i.test(String(evidence.tableMeta.metrics["engine"] ?? "unknown")),
            actual: String(evidence.tableMeta.metrics["engine"] ?? "unknown"),
          },
        },
      ],
    }),
  ];
}

export const handleHighPartitionCount: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context = await prepareHighPartitionCountContext(baseContext);
  const evidence = await collectHighPartitionCountEvidence(context);
  const { candidates, excludedCandidates } = scoreCauseEvaluations(
    evaluateHighPartitionCountCandidates(evidence, context.thresholds)
  );

  const observations = [
    evidence.replicaTotals,
    evidence.logicalStats,
    evidence.nodeRatio,
    evidence.partitionGrowth,
    evidence.tableMeta,
    evidence.insertPattern,
  ];

  await enrichPartitionKeyColumns(
    context,
    context.resolvedTarget ?? context.target,
    observations,
    "rca high_partition_count: partition_key_columns",
    58
  );

  return {
    observations,
    candidates,
    excluded_candidates: excludedCandidates,
    possible_actions: HIGH_PARTITION_COUNT_ACTIONS,
    target: context.resolvedTarget,
  };
};

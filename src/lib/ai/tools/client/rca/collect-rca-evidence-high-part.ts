import {
  asNumber,
  buildNodePredicate,
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  collectObservation,
  discoverTargetTableByParts,
  enrichPartitionKeyColumns,
  evaluateCandidate,
  runQuery,
  scoreCauseEvaluations,
  type CanonicalSymptom,
  type CauseCandidate,
  type Observation,
  type PossibleAction,
  type RcaThresholds,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
  type Target,
} from "./collect-rca-evidence-common";

type HighPartCountContext = SymptomContext & {
  resolvedTarget: Target | undefined;
  partsTablePredicate: string;
  queryLogTablePredicate: string;
  nodePredicate: string;
};

type HighPartCountEvidence = {
  logicalPartitionStats: Observation;
  nodePartitionRatio: Observation;
  nodeTotals: Observation;
  merges: Observation;
  insertPattern: Observation;
  tableMeta: Observation;
};

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

async function prepareHighPartCountContext(
  baseContext: SymptomContext
): Promise<HighPartCountContext> {
  const resolvedTarget = await runQuery(
    baseContext,
    "rca high_part_count: target_table",
    35,
    async () => discoverTargetTableByParts(baseContext.connection, baseContext.scope, baseContext.target)
  );

  return {
    ...baseContext,
    resolvedTarget,
    partsTablePredicate: buildPartsTablePredicate(resolvedTarget),
    queryLogTablePredicate: buildQueryLogPredicate("table", resolvedTarget),
    nodePredicate: buildNodePredicate(baseContext.scope, resolvedTarget, "FQDN()"),
  };
}

async function collectHighPartCountEvidence(
  context: HighPartCountContext
): Promise<HighPartCountEvidence> {
  const logicalPartitionStats = await collectObservation({
    context,
    stage: "rca high_part_count: parts_logical_partition_stats",
    progress: 40,
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
    toObservation: (row) => ({
      source: "system.parts",
      description: "Logical (replica-deduplicated) part inventory by partition",
      metrics: {
        distinct_partitions: asNumber(row?.[0]),
        max_parts_per_partition: asNumber(row?.[1]),
      },
    }),
  });

  const nodePartitionRatio = await collectObservation({
    context,
    stage: "rca high_part_count: parts_node_partition_ratio",
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

  const nodeTotals = await collectObservation({
    context,
    stage: "rca high_part_count: parts_node_totals",
    progress: 44,
    sqlTemplate: `
SELECT
  max(node_active_parts) AS max_active_parts_per_node,
  avg(node_active_parts) AS avg_active_parts_per_node,
  ifNull(argMax(host_name, node_active_parts), '') AS top_parts_node
FROM (
  SELECT
    FQDN() AS host_name,
    count() AS node_active_parts
  FROM {clusterAllReplicas:system.parts}
  WHERE active AND {partsTableFilterExpression}
  GROUP BY host_name
)`,
    toObservation: (row) => ({
      source: "system.parts",
      description: "Per-node active part totals (replica-inclusive, hotspot-oriented)",
      metrics: {
        max_active_parts_per_node: asNumber(row?.[0]),
        avg_active_parts_per_node: Number(asNumber(row?.[1]).toFixed(2)),
        top_parts_node: String(row?.[2] ?? ""),
      },
    }),
  });

  const merges = await collectObservation({
    context,
    stage: "rca high_part_count: merges",
    progress: 45,
    sqlTemplate: `
SELECT
  count() AS active_merges,
  max(elapsed) AS max_merge_elapsed
FROM {clusterAllReplicas:system.merges}
WHERE {nodeFilterExpression}
  AND {partsTableFilterExpression}`,
    toObservation: (row) => ({
      source: "system.merges",
      description: "Merge pressure around target scope",
      metrics: {
        active_merges: asNumber(row?.[0]),
        max_merge_elapsed_seconds: Number(asNumber(row?.[1]).toFixed(2)),
      },
    }),
  });

  const insertPattern = await collectObservation({
    context,
    stage: "rca high_part_count: insert_pattern",
    progress: 50,
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
  });

  const tableMeta = await collectObservation({
    context,
    stage: "rca high_part_count: table_meta",
    progress: 55,
    sqlTemplate: `
SELECT
  any(engine) AS engine,
  any(partition_key) AS partition_key
FROM system.tables
WHERE database = '{resolvedTargetDatabase}'
  AND name = '{resolvedTargetTable}'`,
    toObservation: (row) => ({
      source: "system.tables",
      description: "Table engine and partition key",
      metrics: {
        engine: String(row?.[0] ?? "unknown"),
        partition_key: String(row?.[1] ?? ""),
      },
    }),
  });

  return {
    logicalPartitionStats,
    nodePartitionRatio,
    nodeTotals,
    merges,
    insertPattern,
    tableMeta,
  };
}

function getHighPartCounts(evidence: HighPartCountEvidence) {
  return {
    distinctPartitions: asNumber(evidence.logicalPartitionStats.metrics["distinct_partitions"]),
    maxPartsPerPartition: asNumber(evidence.logicalPartitionStats.metrics["max_parts_per_partition"]),
    maxActivePartsPerNode: asNumber(evidence.nodeTotals.metrics["max_active_parts_per_node"]),
    avgActivePartsPerNode: asNumber(evidence.nodeTotals.metrics["avg_active_parts_per_node"]),
    maxNodePartitionToPartsRatio: asNumber(
      evidence.nodePartitionRatio.metrics["max_node_partition_to_parts_ratio"]
    ),
    avgNodePartitionToPartsRatio: asNumber(
      evidence.nodePartitionRatio.metrics["avg_node_partition_to_parts_ratio"]
    ),
  };
}

function evaluateHighPartCountCandidates(
  evidence: HighPartCountEvidence,
  thresholds: RcaThresholds
) {
  const t = thresholds.high_part_count;
  const counts = getHighPartCounts(evidence);

  return [
    evaluateCandidate({
      cause: "insert_too_frequent",
      next_check_hints: ["increase insert batch size and reduce insert frequency"],
      indicators: [
        {
          description: `inserts per minute > ${t.inserts_per_minute_gt}`,
          required: true,
          evaluation: {
            matched: asNumber(evidence.insertPattern.metrics["inserts_per_minute"]) > t.inserts_per_minute_gt,
            actual: asNumber(evidence.insertPattern.metrics["inserts_per_minute"]).toFixed(2),
          },
        },
        {
          description: `avg rows per insert < ${t.avg_rows_per_insert_lt}`,
          evaluation: {
            matched:
              asNumber(evidence.insertPattern.metrics["avg_rows_per_insert"]) > 0 &&
              asNumber(evidence.insertPattern.metrics["avg_rows_per_insert"]) < t.avg_rows_per_insert_lt,
            actual: asNumber(evidence.insertPattern.metrics["avg_rows_per_insert"]).toFixed(2),
          },
        },
        {
          description: `max active parts per node > ${t.total_active_parts_gt}`,
          required: true,
          evaluation: {
            matched: counts.maxActivePartsPerNode > t.total_active_parts_gt,
            actual: counts.maxActivePartsPerNode,
          },
        },
      ],
    }),
    evaluateCandidate({
      cause: "merge_backlog",
      indicators: [
        {
          description: `active merges > ${t.active_merges_gt}`,
          evaluation: {
            matched: asNumber(evidence.merges.metrics["active_merges"]) > t.active_merges_gt,
            actual: asNumber(evidence.merges.metrics["active_merges"]),
          },
        },
        {
          description: `max merge elapsed > ${t.max_merge_elapsed_seconds_gt}s`,
          evaluation: {
            matched:
              asNumber(evidence.merges.metrics["max_merge_elapsed_seconds"]) >
              t.max_merge_elapsed_seconds_gt,
            actual: `${asNumber(evidence.merges.metrics["max_merge_elapsed_seconds"]).toFixed(2)}s`,
          },
        },
        {
          description: `max active parts per node > ${t.total_active_parts_gt}`,
          required: true,
          evaluation: {
            matched: counts.maxActivePartsPerNode > t.total_active_parts_gt,
            actual: counts.maxActivePartsPerNode,
          },
        },
      ],
    }),
    evaluateCandidate({
      cause: "partition_granularity_pressure",
      next_check_hints: [
        "run collect_rca_evidence with symptom=high_partition_count for partition-key RCA",
      ],
      indicators: [
        {
          description: `distinct partitions > ${t.distinct_partitions_gt}`,
          required: true,
          evaluation: {
            matched: counts.distinctPartitions > t.distinct_partitions_gt,
            actual: counts.distinctPartitions,
          },
        },
        {
          description: `partition/parts ratio > ${t.partition_to_parts_ratio_gt}`,
          evaluation: {
            matched: counts.maxNodePartitionToPartsRatio > t.partition_to_parts_ratio_gt,
            actual: `max_node=${counts.maxNodePartitionToPartsRatio.toFixed(2)} avg_node=${counts.avgNodePartitionToPartsRatio.toFixed(2)}`,
          },
        },
        {
          description: "partition key is configured",
          evaluation: {
            matched: String(evidence.tableMeta.metrics["partition_key"] ?? "").length > 0,
            actual: String(evidence.tableMeta.metrics["partition_key"] ?? "") || "none",
          },
        },
      ],
    }),
    evaluateCandidate({
      cause: "wrong_engine_settings",
      next_check_hints: ["review merge-tree table settings and per-table insert patterns"],
      indicators: [
        {
          description: "engine is MergeTree family",
          blocker: true,
          evaluation: {
            matched: /MergeTree/i.test(String(evidence.tableMeta.metrics["engine"] ?? "unknown")),
            actual: String(evidence.tableMeta.metrics["engine"] ?? "unknown"),
          },
        },
        {
          description: `max active parts per node > ${t.total_active_parts_gt}`,
          required: true,
          evaluation: {
            matched: counts.maxActivePartsPerNode > t.total_active_parts_gt,
            actual: counts.maxActivePartsPerNode,
          },
        },
        {
          description: `max parts in one partition > ${t.max_parts_per_partition_gt}`,
          required: true,
          evaluation: {
            matched: counts.maxPartsPerPartition > t.max_parts_per_partition_gt,
            actual: counts.maxPartsPerPartition,
          },
        },
      ],
    }),
  ];
}

function computeHighPartCountRelatedSymptoms(
  evidence: HighPartCountEvidence,
  candidates: CauseCandidate[],
  thresholds: RcaThresholds
): CanonicalSymptom[] {
  const t = thresholds.high_part_count;
  const counts = getHighPartCounts(evidence);
  const partitionPressureCandidate = candidates.find(
    (candidate) => candidate.cause === "partition_granularity_pressure"
  );

  if (
    counts.distinctPartitions >= t.related_symptom_distinct_partitions_gte ||
    (partitionPressureCandidate?.signal_strength ?? 0) >= t.related_symptom_signal_strength_gte
  ) {
    return ["high_partition_count"];
  }

  return [];
}

export const handleHighPartCount: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context = await prepareHighPartCountContext(baseContext);
  const evidence = await collectHighPartCountEvidence(context);
  const { candidates, excludedCandidates } = scoreCauseEvaluations(
    evaluateHighPartCountCandidates(evidence, context.thresholds)
  );

  const observations = [
    evidence.logicalPartitionStats,
    evidence.nodePartitionRatio,
    evidence.nodeTotals,
    evidence.merges,
    evidence.insertPattern,
    evidence.tableMeta,
  ];

  await enrichPartitionKeyColumns(
    context,
    context.resolvedTarget ?? context.target,
    observations,
    "rca high_part_count: partition_key_columns",
    60
  );

  return {
    observations,
    candidates,
    excluded_candidates: excludedCandidates,
    possible_actions: HIGH_PART_COUNT_ACTIONS,
    target: context.resolvedTarget,
    related_symptoms: computeHighPartCountRelatedSymptoms(
      evidence,
      candidates,
      context.thresholds
    ),
  };
};

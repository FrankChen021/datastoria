import {
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  discoverTargetTableByParts,
  enrichPartitionKeyColumns,
  runQuery,
  type Observation,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
  type Target,
} from "../evidence-collector-common";
import { executeRcaTemplate } from "../template-runtime";
import { HIGH_PARTITION_COUNT_TEMPLATE_SOURCE } from "../templates/high-partition-count.yaml";

type HighPartitionCountContext = SymptomContext & {
  resolvedTarget: Target | undefined;
  partsTablePredicate: string;
  queryLogTablePredicate: string;
};

async function prepareHighPartitionCountContext(
  baseContext: SymptomContext
): Promise<HighPartitionCountContext> {
  const resolvedTarget = await runQuery(
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

export const handleHighPartitionCount: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context = await prepareHighPartitionCountContext(baseContext);
  const result = await executeRcaTemplate({
    cacheKey: "high_partition_count",
    templateSource: HIGH_PARTITION_COUNT_TEMPLATE_SOURCE,
    thresholdSet: "high_partition_count",
    context,
  });
  const observations = dedupeObservations(result.observations);

  await enrichPartitionKeyColumns(
    context,
    context.resolvedTarget ?? context.target,
    observations,
    "rca high_partition_count: partition_key_columns",
    58
  );

  return {
    observations,
    candidates: result.candidates,
    excluded_candidates: result.excludedCandidates,
    possible_actions: result.possibleActions,
    target: context.resolvedTarget,
  };
};

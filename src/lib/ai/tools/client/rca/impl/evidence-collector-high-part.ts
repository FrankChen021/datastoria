import {
  buildNodePredicate,
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
import { HIGH_PART_COUNT_TEMPLATE_SOURCE } from "../templates/high-part-count.yaml";

type HighPartCountContext = SymptomContext & {
  resolvedTarget: Target | undefined;
  partsTablePredicate: string;
  queryLogTablePredicate: string;
  nodePredicate: string;
};

async function prepareHighPartCountContext(
  baseContext: SymptomContext
): Promise<HighPartCountContext> {
  const resolvedTarget = await runQuery(
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
    nodePredicate: buildNodePredicate(baseContext.scope, resolvedTarget, "hostName()"),
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

export const handleHighPartCount: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context = await prepareHighPartCountContext(baseContext);
  const result = await executeRcaTemplate({
    cacheKey: "high_part_count",
    templateSource: HIGH_PART_COUNT_TEMPLATE_SOURCE,
    thresholdSet: "high_part_count",
    context,
  });
  const observations = dedupeObservations(result.observations);
  await enrichPartitionKeyColumns(
    context,
    context.resolvedTarget ?? context.target,
    observations,
    "rca high_part_count: partition_key_columns",
    60
  );

  return {
    observations,
    candidates: result.candidates,
    excluded_candidates: result.excludedCandidates,
    possible_actions: result.possibleActions,
    target: context.resolvedTarget,
    related_symptoms: result.relatedSymptoms,
  };
};

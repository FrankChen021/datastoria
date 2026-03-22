import {
  buildNodePredicate,
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  discoverTargetTableByParts,
  enrichPartitionKeyColumns,
  runQuery,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
} from "../evidence-collector-common";
import { executeRcaTemplate, type TemplateRuntimeContext } from "../template-runtime";

async function prepareHighPartCountContext(
  baseContext: SymptomContext
): Promise<TemplateRuntimeContext> {
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

export const handleHighPartCount: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context = await prepareHighPartCountContext(baseContext);
  const result = await executeRcaTemplate({
    cacheKey: "high_part_count",
    templatePath: "high-part-count.yaml",
    thresholdSet: "high_part_count",
    context,
  });
  await enrichPartitionKeyColumns(
    context,
    context.resolvedTarget ?? context.target,
    result.observations,
    "rca high_part_count: partition_key_columns",
    60
  );

  return {
    observations: result.observations,
    candidates: result.candidates,
    excluded_candidates: result.excludedCandidates,
    possible_actions: result.possibleActions,
    target: result.target,
    related_symptoms: result.relatedSymptoms,
  };
};

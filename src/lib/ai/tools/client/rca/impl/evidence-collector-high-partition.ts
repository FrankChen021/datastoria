import {
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

async function prepareHighPartitionCountContext(
  baseContext: SymptomContext
): Promise<TemplateRuntimeContext> {
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

export const handleHighPartitionCount: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context = await prepareHighPartitionCountContext(baseContext);
  const result = await executeRcaTemplate({
    templateName: "high_partition_count",
    context,
  });

  await enrichPartitionKeyColumns(
    context,
    context.resolvedTarget ?? context.target,
    result.observations,
    "rca high_partition_count: partition_key_columns",
    58
  );

  return {
    observations: result.observations,
    candidates: result.candidates,
    excluded_candidates: result.excludedCandidates,
    possible_actions: result.possibleActions,
    target: result.target,
  };
};

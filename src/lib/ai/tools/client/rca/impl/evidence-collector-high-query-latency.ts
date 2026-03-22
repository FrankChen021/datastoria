import {
  buildQueryLogPredicate,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
} from "../evidence-collector-common";
import { executeRcaTemplate, type TemplateRuntimeContext } from "../template-runtime";

export const handleHighQueryLatency: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context: TemplateRuntimeContext = {
    ...baseContext,
    scopePredicate: buildQueryLogPredicate(baseContext.scope, baseContext.target),
  };
  const result = await executeRcaTemplate({
    cacheKey: "high_query_latency",
    templatePath: "high-query-latency.yaml",
    thresholdSet: "high_query_latency",
    context,
  });

  return {
    observations: result.observations,
    candidates: result.candidates,
    excluded_candidates: result.excludedCandidates,
    possible_actions: result.possibleActions,
    target: result.target,
  };
};

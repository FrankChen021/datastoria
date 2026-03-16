import {
  buildQueryLogPredicate,
  type Observation,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
} from "../evidence-collector-common";
import { executeRcaTemplate } from "../template-runtime";
import { HIGH_QUERY_LATENCY_TEMPLATE_SOURCE } from "../templates/high-query-latency.yaml";

type HighQueryLatencyContext = SymptomContext & {
  scopePredicate: string;
};

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

export const handleHighQueryLatency: SymptomEvidenceCollector = async (
  baseContext
): Promise<SymptomEvidence> => {
  const context: HighQueryLatencyContext = {
    ...baseContext,
    scopePredicate: buildQueryLogPredicate(baseContext.scope, baseContext.target),
  };
  const result = await executeRcaTemplate({
    cacheKey: "high_query_latency",
    templateSource: HIGH_QUERY_LATENCY_TEMPLATE_SOURCE,
    thresholdSet: "high_query_latency",
    context,
  });
  const observations = dedupeObservations(result.observations);
  const queryLog = observations.find((observation) => observation.source === "system.query_log");
  if (!queryLog) {
    return {
      observations,
      candidates: result.candidates,
      excluded_candidates: result.excludedCandidates,
      possible_actions: result.possibleActions,
      target: context.target,
    };
  }
  const sampleQueryHash = String(queryLog?.metrics["sample_query_hash"] ?? "");

  return {
    observations,
    candidates: result.candidates,
    excluded_candidates: result.excludedCandidates,
    possible_actions: result.possibleActions,
    target:
      context.scope === "query_pattern" && sampleQueryHash
        ? {
            ...context.target,
            query_hash: context.target?.query_hash || sampleQueryHash,
          }
        : context.target,
  };
};

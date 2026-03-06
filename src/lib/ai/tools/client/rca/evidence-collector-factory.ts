import {
  type CanonicalSymptom,
  type Observation,
  type PossibleAction,
  type RcaContextExtension,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
} from "./evidence-collector-common";
import { getRcaContextExtension } from "./evidence-collector-extension";
import { handleHighPartCount } from "./impl/evidence-collector-high-part";
import { handleHighPartitionCount } from "./impl/evidence-collector-high-partition";
import { handleHighQueryLatency } from "./impl/evidence-collector-high-query-latency";
import { collectUnknownEvidence } from "./impl/evidence-collector-unknown";

export type RcaEvidenceProvider = {
  collect(symptom: CanonicalSymptom, context: SymptomContext): Promise<SymptomEvidence | undefined>;
};

export type RcaContextPayload = {
  available: boolean;
  source: "none" | "extension";
  observations?: Observation[];
  possible_actions?: PossibleAction[];
  related_symptoms?: CanonicalSymptom[];
};

const DETERMINISTIC_SYMPTOM_HANDLERS: Partial<Record<CanonicalSymptom, SymptomEvidenceCollector>> =
  {
    high_query_latency: handleHighQueryLatency,
    high_part_count: handleHighPartCount,
    high_partition_count: handleHighPartitionCount,
    unknown: collectUnknownEvidence,
  };

function createDeterministicRcaEvidenceProvider(): RcaEvidenceProvider {
  return {
    async collect(
      symptom: CanonicalSymptom,
      context: SymptomContext
    ): Promise<SymptomEvidence | undefined> {
      const handler = DETERMINISTIC_SYMPTOM_HANDLERS[symptom];
      if (!handler) {
        return undefined;
      }
      return handler(context);
    },
  };
}

function attachContextExtension(input: {
  baseProvider: RcaEvidenceProvider;
  extension: RcaContextExtension;
}): RcaEvidenceProvider {
  return {
    async collect(
      symptom: CanonicalSymptom,
      context: SymptomContext
    ): Promise<SymptomEvidence | undefined> {
      const baseEvidence = await input.baseProvider.collect(symptom, context);
      if (!baseEvidence) {
        return undefined;
      }
      const resolverContext = await input.extension.resolve({
        symptom,
        context,
        evidence: baseEvidence,
      });
      if (!resolverContext.available) {
        return baseEvidence;
      }

      return {
        ...baseEvidence,
        observations: dedupeObservations([
          ...baseEvidence.observations,
          ...(resolverContext.observations ?? []),
        ]),
        possible_actions: dedupePossibleActions([
          ...baseEvidence.possible_actions,
          ...(resolverContext.possible_actions ?? []),
        ]),
        related_symptoms: dedupeValues([
          ...(baseEvidence.related_symptoms ?? []),
          ...(resolverContext.related_symptoms ?? []),
        ]),
      };
    },
  };
}

export function createRcaEvidenceProvider(): RcaEvidenceProvider {
  const baseProvider = createDeterministicRcaEvidenceProvider();
  const extension = getRcaContextExtension();
  return extension
    ? attachContextExtension({
        baseProvider,
        extension,
      })
    : baseProvider;
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

function dedupePossibleActions(actions: PossibleAction[]): PossibleAction[] {
  const byKey = new Map<string, PossibleAction>();
  for (const action of actions) {
    const key = `${action.tied_to}::${action.title}`;
    if (!byKey.has(key)) {
      byKey.set(key, action);
    }
  }
  return [...byKey.values()];
}

function dedupeValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

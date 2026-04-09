import {
  type CanonicalSymptom,
  type Observation,
  type PossibleAction,
  type RcaContextExtension,
  type RcaEvidenceCollector,
  type SymptomContext,
  type SymptomEvidence,
} from "./evidence-collector-common";
import { getRcaContextExtension } from "./evidence-collector-extension";
import { TemplateBasedEvidenceCollector } from "./impl/template-based-collector";
import { UnknownSymptomEvidenceCollector } from "./impl/unknown-symptom-evidence-collector";

export type RcaContextPayload = {
  available: boolean;
  source: "none" | "extension";
  observations?: Observation[];
  possible_actions?: PossibleAction[];
  related_symptoms?: CanonicalSymptom[];
};

const DETERMINISTIC_SYMPTOM_COLLECTORS: Partial<Record<CanonicalSymptom, RcaEvidenceCollector>> = {
  unknown: UnknownSymptomEvidenceCollector,
};

export class EvidenceCollectorFactory {
  static create(): RcaEvidenceCollector {
    const baseCollector: RcaEvidenceCollector = {
      async collect(symptom: CanonicalSymptom, context: SymptomContext) {
        const collector =
          DETERMINISTIC_SYMPTOM_COLLECTORS[symptom] ?? new TemplateBasedEvidenceCollector();
        return collector.collect(symptom, context);
      },
    };
    const extension = getRcaContextExtension();
    return extension
      ? attachContextExtension({
          baseCollector: baseCollector,
          extension,
        })
      : baseCollector;
  }
}

function attachContextExtension(input: {
  baseCollector: RcaEvidenceCollector;
  extension: RcaContextExtension;
}): RcaEvidenceCollector {
  return {
    async collect(
      symptom: CanonicalSymptom,
      context: SymptomContext
    ): Promise<SymptomEvidence | undefined> {
      const baseEvidence = await input.baseCollector.collect(symptom, context);
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

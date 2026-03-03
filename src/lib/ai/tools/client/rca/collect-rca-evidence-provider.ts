import {
  type CanonicalSymptom,
  type Observation,
  type PossibleAction,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
} from "./collect-rca-evidence-common";
import { handleHighPartCount } from "./collect-rca-evidence-high-part";
import { handleHighPartitionCount } from "./collect-rca-evidence-high-partition";
import { handleHighQueryLatency } from "./collect-rca-evidence-high-query-latency";
import { collectUnknownEvidence } from "./collect-rca-evidence-unknown";

export type RcaEvidenceProvider = {
  collect(
    symptom: CanonicalSymptom,
    context: SymptomContext
  ): Promise<SymptomEvidence | undefined>;
};

export type RcaEvidenceEnricher = {
  name: string;
  enrich(input: {
    symptom: CanonicalSymptom;
    context: SymptomContext;
    evidence: SymptomEvidence;
  }): Promise<SymptomEvidence>;
};

export type GraphRcaContext = {
  available: boolean;
  source: "none" | "commercial";
  observations?: Observation[];
  possible_actions?: PossibleAction[];
  related_symptoms?: CanonicalSymptom[];
};

export type GraphRcaContextResolver = {
  name: string;
  resolve(input: {
    symptom: CanonicalSymptom;
    context: SymptomContext;
    evidence: SymptomEvidence;
  }): Promise<GraphRcaContext>;
};

const DETERMINISTIC_SYMPTOM_HANDLERS: Partial<Record<CanonicalSymptom, SymptomEvidenceCollector>> = {
  high_query_latency: handleHighQueryLatency,
  high_part_count: handleHighPartCount,
  high_partition_count: handleHighPartitionCount,
  unknown: collectUnknownEvidence,
};

export function createDeterministicRcaEvidenceProvider(): RcaEvidenceProvider {
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

export function createComposableRcaEvidenceProvider(input: {
  baseProvider: RcaEvidenceProvider;
  enrichers?: RcaEvidenceEnricher[];
}): RcaEvidenceProvider {
  const enrichers = input.enrichers ?? [];

  return {
    async collect(
      symptom: CanonicalSymptom,
      context: SymptomContext
    ): Promise<SymptomEvidence | undefined> {
      const baseEvidence = await input.baseProvider.collect(symptom, context);
      if (!baseEvidence) {
        return undefined;
      }

      let enrichedEvidence = baseEvidence;
      for (const enricher of enrichers) {
        enrichedEvidence = await enricher.enrich({
          symptom,
          context,
          evidence: enrichedEvidence,
        });
      }

      return enrichedEvidence;
    },
  };
}

export function createNoopGraphRcaContextResolver(): GraphRcaContextResolver {
  return {
    name: "noop-graph-context",
    async resolve(): Promise<GraphRcaContext> {
      return {
        available: false,
        source: "none",
      };
    },
  };
}

export function createGraphContextEnricher(input: {
  resolver: GraphRcaContextResolver;
}): RcaEvidenceEnricher {
  return {
    name: `graph-context:${input.resolver.name}`,
    async enrich(args): Promise<SymptomEvidence> {
      const graphContext = await input.resolver.resolve(args);
      if (!graphContext.available) {
        return args.evidence;
      }

      return {
        ...args.evidence,
        observations: dedupeObservations([
          ...args.evidence.observations,
          ...(graphContext.observations ?? []),
        ]),
        possible_actions: dedupePossibleActions([
          ...args.evidence.possible_actions,
          ...(graphContext.possible_actions ?? []),
        ]),
        related_symptoms: dedupeValues([
          ...(args.evidence.related_symptoms ?? []),
          ...(graphContext.related_symptoms ?? []),
        ]),
      };
    },
  };
}

export function createDefaultRcaEvidenceProvider(): RcaEvidenceProvider {
  return createComposableRcaEvidenceProvider({
    baseProvider: createDeterministicRcaEvidenceProvider(),
    enrichers: [
      createGraphContextEnricher({
        resolver: createNoopGraphRcaContextResolver(),
      }),
    ],
  });
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

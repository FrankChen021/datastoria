import {
  buildNodePredicate,
  buildPartsTablePredicate,
  buildQueryLogPredicate,
  discoverTargetTableByParts,
  enrichPartitionKeyColumns,
  runQuery,
  type CanonicalSymptom,
  type Observation,
  type PossibleAction,
  type RcaContextExtension,
  type SymptomContext,
  type SymptomEvidence,
  type SymptomEvidenceCollector,
} from "./evidence-collector-common";
import { getRcaContextExtension } from "./evidence-collector-extension";
import { collectUnknownEvidence } from "./impl/evidence-collector-unknown";
import {
  executeRcaTemplate,
  getRcaTemplateMetadata,
  type TemplateRuntimeContext,
} from "./template-runtime";

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
    unknown: collectUnknownEvidence,
  };

async function buildTemplateRuntimeContext(
  symptom: CanonicalSymptom,
  context: SymptomContext
): Promise<{
  templateName: string;
  thresholdSet: keyof SymptomContext["thresholds"];
  context: TemplateRuntimeContext;
  enrichments: string[];
}> {
  const metadata = await getRcaTemplateMetadata(symptom);
  if (!metadata) {
    throw new Error(`No RCA template registered for symptom '${symptom}'`);
  }

  let resolvedTarget = context.target;
  if (metadata.requires?.resolved_target === "table") {
    resolvedTarget = await runQuery(context, `rca ${symptom}: target_table`, 35, async () =>
      discoverTargetTableByParts(context.connection, context.scope, context.target)
    );
  }

  const runtimeContext: TemplateRuntimeContext = {
    ...context,
    resolvedTarget,
  };

  for (const predicate of metadata.requires?.predicates ?? []) {
    if (predicate === "parts_table") {
      runtimeContext.partsTablePredicate = buildPartsTablePredicate(resolvedTarget);
    } else if (predicate === "query_log_table") {
      runtimeContext.queryLogTablePredicate = buildQueryLogPredicate("table", resolvedTarget);
    } else if (predicate === "node") {
      runtimeContext.nodePredicate = buildNodePredicate(
        context.scope,
        resolvedTarget,
        "hostName()"
      );
    } else if (predicate === "scope_query_log") {
      runtimeContext.scopePredicate = buildQueryLogPredicate(context.scope, context.target);
    }
  }

  return {
    templateName: metadata.templateId,
    thresholdSet: metadata.thresholdSet,
    context: runtimeContext,
    enrichments: metadata.requires?.enrichments ?? [],
  };
}

async function collectTemplateSymptomEvidence(
  symptom: CanonicalSymptom,
  baseContext: SymptomContext
): Promise<SymptomEvidence | undefined> {
  const runtime = await buildTemplateRuntimeContext(symptom, baseContext);
  const result = await executeRcaTemplate({
    templateName: runtime.templateName,
    thresholdSet: runtime.thresholdSet,
    context: runtime.context,
  });

  if (runtime.enrichments.includes("partition_key_columns")) {
    await enrichPartitionKeyColumns(
      runtime.context,
      runtime.context.resolvedTarget ?? runtime.context.target,
      result.observations,
      `rca ${symptom}: partition_key_columns`,
      60
    );
  }

  return {
    observations: result.observations,
    candidates: result.candidates,
    excluded_candidates: result.excludedCandidates,
    possible_actions: result.possibleActions,
    target: result.target,
    related_symptoms: result.relatedSymptoms,
  };
}

function createDeterministicRcaEvidenceProvider(): RcaEvidenceProvider {
  return {
    async collect(
      symptom: CanonicalSymptom,
      context: SymptomContext
    ): Promise<SymptomEvidence | undefined> {
      const handler = DETERMINISTIC_SYMPTOM_HANDLERS[symptom];
      if (handler) {
        return handler(context);
      }
      return collectTemplateSymptomEvidence(symptom, context);
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

import yaml from "js-yaml";
import {
  asNumber,
  collectObservation,
  evaluateCandidate,
  scoreCauseEvaluations,
  type CanonicalSymptom,
  type CauseCandidate,
  type CauseEvaluation,
  type Observation,
  type PossibleAction,
  type RcaThresholds,
  type Scope,
  type SymptomContext,
  type Target,
} from "./evidence-collector-common";

type ThresholdSetName = keyof RcaThresholds;

type ObservationMetricTemplate = {
  name: string;
  type: "number" | "string";
  decimals?: number;
  derive?: {
    use: "divide_by_time_window_minutes";
    from: string;
  };
};

type ObservationScopeSummaryTemplate = {
  level: "cluster" | "node" | "table";
  aggregation_semantics: "additive" | "ratio" | "quantile" | "inventory";
  cluster_aggregation?: string;
};

type ObservationTopNodesTemplate = {
  use: "single_metric_node";
  node_metric: string;
  metric_name: string;
  value_metric: string;
};

type ObservationNodesOverThresholdTemplate = {
  use: "single_metric_threshold";
  node_metric: string;
  metric_name: string;
  value_metric: string;
  threshold: string;
};

type ObservationTemplate = {
  id: string;
  kind: "sql_observation";
  stage: string;
  progress: number;
  source: string;
  description: string;
  sql: string;
  metrics: ObservationMetricTemplate[];
  scope_summary?: ObservationScopeSummaryTemplate;
  top_nodes?: ObservationTopNodesTemplate;
  nodes_over_threshold?: ObservationNodesOverThresholdTemplate;
};

type CandidateTemplate = {
  cause: string;
  observations: string[];
  next_checks?: string[];
  indicators: IndicatorTemplate[];
};

type IndicatorTemplate = {
  description: string;
  required?: boolean;
  blocker?: boolean;
  actual_template?: string;
  match: ConditionTemplate;
};

type MetricRef = {
  observation: string;
  metric: string;
};

type ComparisonCondition = {
  kind: "comparison";
  left: MetricRef;
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  right: {
    threshold?: string;
    value?: number | string;
  };
};

type RegexCondition = {
  kind: "regex";
  observation: string;
  metric: string;
  pattern: string;
  flags?: string;
};

type NonEmptyCondition = {
  kind: "non_empty";
  observation: string;
  metric: string;
};

type AllCondition = {
  kind: "all";
  conditions: ConditionTemplate[];
};

type CandidateScoreCondition = {
  kind: "candidate_score";
  cause: string;
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  threshold: string;
};

type ConditionTemplate =
  | ComparisonCondition
  | RegexCondition
  | NonEmptyCondition
  | AllCondition
  | CandidateScoreCondition;

type RelatedSymptomTemplate = {
  symptom: CanonicalSymptom;
  when_any: ConditionTemplate[];
};

export type RcaTemplate = {
  symptom: CanonicalSymptom;
  observations: ObservationTemplate[];
  candidates: CandidateTemplate[];
  actions: PossibleAction[];
  related_symptoms?: RelatedSymptomTemplate[];
};

export type TemplateRuntimeContext = SymptomContext & {
  resolvedTarget?: Target;
  partsTablePredicate?: string;
  queryLogTablePredicate?: string;
  nodePredicate?: string;
  scopePredicate?: string;
};

const templateCache = new Map<string, RcaTemplate>();

function loadTemplate(cacheKey: string, source: string): RcaTemplate {
  const cached = templateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const parsed = yaml.load(source) as RcaTemplate;
  templateCache.set(cacheKey, parsed);
  return parsed;
}

function renderTemplate(
  template: string,
  observationsById: Map<string, Observation>,
  thresholds: Record<string, number>
): string {
  return template
    .replaceAll(
      /\{([^}:|]+)\.([^}:|]+)(?::\.(\d+)f)?(?:\|default:([^}]+))?\}/g,
      (_, observationId, metric, decimals, defaultValue) => {
        const observation = observationsById.get(observationId);
        const value = observation?.metrics[metric];
        if (value === undefined || value === null || value === "") {
          return defaultValue ?? "";
        }
        if (typeof value === "number" && decimals) {
          return value.toFixed(Number(decimals));
        }
        return String(value);
      }
    )
    .replaceAll(/\{threshold\.([^}]+)\}/g, (_, key) => String(thresholds[key] ?? ""));
}

function compare(
  operator: ComparisonCondition["operator"],
  left: unknown,
  right: unknown
): boolean {
  switch (operator) {
    case "gt":
      return Number(left) > Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "lte":
      return Number(left) <= Number(right);
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
  }
}

function getMetricValue(observationsById: Map<string, Observation>, ref: MetricRef): unknown {
  return observationsById.get(ref.observation)?.metrics[ref.metric];
}

function evaluateCondition(input: {
  condition: ConditionTemplate;
  observationsById: Map<string, Observation>;
  thresholds: Record<string, number>;
  candidatesByCause?: Map<string, CauseCandidate>;
}): boolean {
  const { condition, observationsById, thresholds, candidatesByCause } = input;
  switch (condition.kind) {
    case "comparison": {
      const left = getMetricValue(observationsById, condition.left);
      const right =
        condition.right.threshold !== undefined
          ? thresholds[condition.right.threshold]
          : condition.right.value;
      return compare(condition.operator, left, right);
    }
    case "regex": {
      const value = String(
        observationsById.get(condition.observation)?.metrics[condition.metric] ?? ""
      );
      return new RegExp(condition.pattern, condition.flags).test(value);
    }
    case "non_empty": {
      const value = observationsById.get(condition.observation)?.metrics[condition.metric];
      return String(value ?? "").length > 0;
    }
    case "all":
      return condition.conditions.every((child) =>
        evaluateCondition({ condition: child, observationsById, thresholds, candidatesByCause })
      );
    case "candidate_score": {
      const supportScore = candidatesByCause?.get(condition.cause)?.support_score ?? 0;
      const threshold = thresholds[condition.threshold] ?? 0;
      return compare(condition.operator, supportScore, threshold);
    }
  }
}

function buildTopNodes(
  template: ObservationTopNodesTemplate | undefined,
  metrics: Observation["metrics"]
): Observation["top_nodes"] | undefined {
  if (!template) {
    return undefined;
  }
  const node = String(metrics[template.node_metric] ?? "");
  const value = metrics[template.value_metric];
  if (!node) {
    return undefined;
  }
  return [
    {
      node,
      metrics: {
        [template.metric_name]: value,
      },
    },
  ];
}

function buildNodesOverThreshold(input: {
  template: ObservationNodesOverThresholdTemplate | undefined;
  metrics: Observation["metrics"];
  thresholds: Record<string, number>;
}): Observation["nodes_over_threshold"] | undefined {
  const { template, metrics, thresholds } = input;
  if (!template) {
    return undefined;
  }

  const node = String(metrics[template.node_metric] ?? "");
  const value = asNumber(metrics[template.value_metric]);
  const threshold = thresholds[template.threshold];
  if (!node || threshold === undefined || value < threshold) {
    return [];
  }

  return [
    {
      node,
      metric: template.metric_name,
      value,
      threshold,
    },
  ];
}

async function collectObservationFromTemplate(
  context: TemplateRuntimeContext,
  template: ObservationTemplate,
  thresholds: Record<string, number>
): Promise<Observation> {
  const directMetrics = template.metrics.filter((metric) => !metric.derive);
  return collectObservation({
    context,
    stage: template.stage,
    progress: template.progress,
    sqlTemplate: template.sql,
    toObservation: (row, ctx) => {
      const metrics: Observation["metrics"] = {};
      directMetrics.forEach((metric, index) => {
        const rawValue = row?.[index];
        if (metric.type === "number") {
          const numericValue = asNumber(rawValue);
          metrics[metric.name] =
            metric.decimals !== undefined
              ? Number(numericValue.toFixed(metric.decimals))
              : numericValue;
        } else {
          metrics[metric.name] = String(rawValue ?? "");
        }
      });

      for (const metric of template.metrics.filter((item) => item.derive)) {
        if (metric.derive?.use === "divide_by_time_window_minutes") {
          const baseValue = asNumber(metrics[metric.derive.from]);
          const derivedValue =
            ctx.timeWindowMinutes > 0 ? baseValue / ctx.timeWindowMinutes : baseValue;
          metrics[metric.name] =
            metric.decimals !== undefined
              ? Number(derivedValue.toFixed(metric.decimals))
              : derivedValue;
        }
      }

      return {
        source: template.source,
        description: template.description.replaceAll(
          "{timeWindowMinutes}",
          String(ctx.timeWindowMinutes)
        ),
        metrics,
        scope_summary: template.scope_summary,
        top_nodes: buildTopNodes(template.top_nodes, metrics),
        nodes_over_threshold: buildNodesOverThreshold({
          template: template.nodes_over_threshold,
          metrics,
          thresholds,
        }),
      };
    },
  });
}

export async function executeRcaTemplate(input: {
  cacheKey: string;
  templateSource: string;
  thresholdSet: ThresholdSetName;
  context: TemplateRuntimeContext;
}): Promise<{
  observations: Observation[];
  candidates: CauseCandidate[];
  excludedCandidates: ReturnType<typeof scoreCauseEvaluations>["excludedCandidates"];
  possibleActions: PossibleAction[];
  relatedSymptoms: CanonicalSymptom[];
}> {
  const template = loadTemplate(input.cacheKey, input.templateSource);
  const thresholdValues = input.context.thresholds[input.thresholdSet] as Record<string, number>;

  const observations = await Promise.all(
    template.observations.map((observation) =>
      collectObservationFromTemplate(input.context, observation, thresholdValues)
    )
  );
  const observationsById = new Map(
    template.observations.map((item, index) => [item.id, observations[index]])
  );

  const evaluations: CauseEvaluation[] = template.candidates.map((candidate) =>
    evaluateCandidate({
      cause: candidate.cause,
      next_check_hints: candidate.next_checks,
      indicators: candidate.indicators.map((indicator) => {
        const actual = indicator.actual_template
          ? renderTemplate(indicator.actual_template, observationsById, thresholdValues)
          : "n/a";
        return {
          description: renderTemplate(indicator.description, observationsById, thresholdValues),
          required: indicator.required,
          blocker: indicator.blocker,
          evaluation: {
            matched: evaluateCondition({
              condition: indicator.match,
              observationsById,
              thresholds: thresholdValues,
            }),
            actual,
          },
        };
      }),
    })
  );

  const { candidates, excludedCandidates } = scoreCauseEvaluations(evaluations);
  const candidatesByCause = new Map(candidates.map((candidate) => [candidate.cause, candidate]));
  const relatedSymptoms = Array.from(
    new Set(
      (template.related_symptoms ?? [])
        .filter((item) =>
          item.when_any.some((condition) =>
            evaluateCondition({
              condition,
              observationsById,
              thresholds: thresholdValues,
              candidatesByCause,
            })
          )
        )
        .map((item) => item.symptom)
    )
  );

  return {
    observations,
    candidates,
    excludedCandidates,
    possibleActions: template.actions,
    relatedSymptoms,
  };
}

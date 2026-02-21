import { QueryError, type JSONCompactFormatResponse } from "@/lib/connection/connection";
import {
  escapeSqlString,
  type ToolExecutor,
  type ToolProgressCallback,
} from "../client-tool-types";
import type { HealthCategorySummary } from "../status/collect-cluster-status";

export type CanonicalSymptom =
  | "high_query_latency"
  | "high_part_count"
  | "high_partition_count"
  | "replication_lag"
  | "merge_backlog"
  | "mutation_backlog"
  | "unknown";

export type Scope = "cluster" | "node" | "table" | "query_pattern";
type StatusContextScope = "single_node" | "cluster";
type Risk = "low" | "medium" | "high";

export type Target = {
  database?: string;
  table?: string;
  node?: string;
  query_hash?: string;
};

type TimeRange = {
  from: string;
  to: string;
};

export type RcaEvidenceInput = {
  symptom: CanonicalSymptom;
  scope?: Scope;
  target?: Target;
  symptom_text?: string;
  time_window?: number;
  time_range?: TimeRange;
  status_context?: {
    generated_at: string;
    status_analysis_mode: "snapshot" | "windowed";
    scope: StatusContextScope;
    window?: {
      time_window?: number;
      time_range?: TimeRange;
    };
    categories?: Record<string, HealthCategorySummary>;
  };
};

export type Observation = {
  source: string;
  description: string;
  metrics: Record<string, number | string | null>;
};

export type CauseCandidate = {
  cause: string;
  signal_strength: number;
  indicators_matched: number;
  indicators_checked: number;
  evidence_for: string[];
  evidence_against: string[];
  next_checks: string[];
};

export type PossibleAction = {
  title: string;
  command?: string;
  risk: Risk;
  tied_to: string;
};

export type EvidenceGap = {
  description: string;
  reason: string;
};

export type RcaEvidenceOutput = {
  schema_version: 1;
  success: boolean;
  symptom: CanonicalSymptom;
  scope: Scope;
  target?: Target;
  related_symptoms?: CanonicalSymptom[];
  observations: Observation[];
  candidates: CauseCandidate[];
  possible_actions: PossibleAction[];
  gaps: EvidenceGap[];
  generated_at: string;
  error?: string;
};

type IndicatorResult = {
  matched: boolean;
  description?: string;
  required?: boolean;
  blocker?: boolean;
};

type CandidateRule = {
  cause: string;
  indicators: IndicatorResult[];
  next_check_hints?: string[];
};

export type QueryResults = Record<string, Observation>;

export type QuerySpec<Ctx> = {
  id: string;
  progressStage: string;
  progressWeight: number;
  sqlTemplate: string;
  toObservation: (row: (string | number | null)[] | undefined, ctx: Ctx) => Observation;
};

type TemplateContext = SymptomContext & {
  partsTablePredicate?: string;
  queryLogTablePredicate?: string;
  nodePredicate?: string;
  scopePredicate?: string;
  resolvedTarget?: Target;
};

const TEMPLATE_PLACEHOLDERS: Record<string, (ctx: TemplateContext) => string | undefined> = {
  partsTableFilterExpression: (ctx) => ctx.partsTablePredicate,
  queryLogTableFilterExpression: (ctx) => ctx.queryLogTablePredicate,
  nodeFilterExpression: (ctx) => ctx.nodePredicate,
  timeFilterExpression: (ctx) => ctx.timeFilter.whereClause,
  scopeFilterExpression: (ctx) => ctx.scopePredicate,
  timeWindowMinutes: (ctx) => String(ctx.timeWindowMinutes),
  resolvedTargetDatabase: (ctx) => escapeSqlString(ctx.resolvedTarget?.database ?? ""),
  resolvedTargetTable: (ctx) => escapeSqlString(ctx.resolvedTarget?.table ?? ""),
};

function substituteTemplate(template: string, ctx: TemplateContext): string {
  let result = template;
  for (const [placeholder, getter] of Object.entries(TEMPLATE_PLACEHOLDERS)) {
    const needle = `{${placeholder}}`;
    if (result.includes(needle)) {
      const value = getter(ctx);
      if (value === undefined) {
        throw new Error(
          `Template placeholder {${placeholder}} requires context value but none provided`
        );
      }
      result = result.replaceAll(needle, value);
    }
  }
  return result;
}

type IndicatorMatchResult = {
  matched: boolean;
  actual: string | number;
};

type IndicatorMatcher = (results: QueryResults) => IndicatorMatchResult;

export type RuleSpec = {
  cause: string;
  next_check_hints?: string[];
  indicators: Array<{
    description: string;
    match: IndicatorMatcher;
    required?: boolean;
    blocker?: boolean;
  }>;
};

export type TimeFilter = {
  whereClause: string;
};

export type SymptomContext = {
  connection: Parameters<ToolExecutor<RcaEvidenceInput, RcaEvidenceOutput>>[1];
  scope: Scope;
  target?: Target;
  timeFilter: TimeFilter;
  timeWindowMinutes: number;
  gaps: EvidenceGap[];
  progressCallback?: ToolProgressCallback;
};

export type SymptomResult = {
  observations: Observation[];
  candidates: CauseCandidate[];
  possible_actions: PossibleAction[];
  target?: Target;
  related_symptoms?: CanonicalSymptom[];
};

export type SymptomHandler = (context: SymptomContext) => Promise<SymptomResult>;

export async function queryJsonCompact(
  connection: Parameters<ToolExecutor<RcaEvidenceInput, RcaEvidenceOutput>>[1],
  sql: string
): Promise<JSONCompactFormatResponse> {
  const { response } = connection.query(sql, { default_format: "JSONCompact" });
  const apiResponse = await response;
  return apiResponse.data.json<JSONCompactFormatResponse>();
}

function stringifyError(error: unknown): string {
  if (error instanceof QueryError && error.data) {
    return typeof error.data === "string" ? error.data : JSON.stringify(error.data);
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function runProbe<T>(
  context: SymptomContext,
  stage: string,
  progress: number,
  fn: () => Promise<T>
): Promise<T> {
  context.progressCallback?.(stage, progress, "started");
  try {
    const result = await fn();
    context.progressCallback?.(stage, progress, "success");
    return result;
  } catch (error) {
    context.progressCallback?.(stage, progress, "failed", stringifyError(error));
    throw error;
  }
}

export function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildNodePredicate(
  scope: Scope,
  target: Target | undefined,
  expr = "FQDN()"
): string {
  if (scope === "node" && target?.node) {
    return `${expr} = '${escapeSqlString(target.node)}'`;
  }
  return "1 = 1";
}

export function buildQueryLogPredicate(scope: Scope, target: Target | undefined): string {
  if (!target) return "1 = 1";
  if (scope === "query_pattern" && target.query_hash) {
    return `toString(normalized_query_hash) = '${escapeSqlString(target.query_hash)}'`;
  }
  if (scope === "table" && target.table) {
    const table = escapeSqlString(target.table);
    if (target.database) {
      const database = escapeSqlString(target.database);
      return `has(databases, '${database}') AND has(tables, '${table}')`;
    }
    return `has(tables, '${table}')`;
  }
  if (scope === "node" && target.node) {
    return buildNodePredicate(scope, target, "FQDN()");
  }
  return "1 = 1";
}

export function buildPartsTablePredicate(target: Target | undefined): string {
  if (!target?.table) return "1 = 1";
  const table = escapeSqlString(target.table);
  if (target.database) {
    return `database = '${escapeSqlString(target.database)}' AND table = '${table}'`;
  }
  return `table = '${table}'`;
}

/**
 * Normalizes target table name so downstream predicates can use consistent database/table fields.
 * Examples:
 * - { table: "@events" } -> { table: "events" }
 * - { table: "analytics.events" } -> { database: "analytics", table: "events" }
 */
function normalizeTargetTable(target: Target | undefined): Target | undefined {
  if (!target?.table) return target;

  const normalized: Target = { ...target };
  let rawTable = target.table.trim();
  if (rawTable.startsWith("@")) rawTable = rawTable.slice(1);

  let database = normalized.database?.trim();
  let table = rawTable;

  const firstDot = rawTable.indexOf(".");
  if (firstDot > 0) {
    const dbFromTable = rawTable.slice(0, firstDot).trim();
    const tableFromTable = rawTable.slice(firstDot + 1).trim();
    if (dbFromTable && tableFromTable) {
      if (!database) database = dbFromTable;
      table = tableFromTable;
    }
  }

  if (table.startsWith("@")) table = table.slice(1);
  normalized.database = database || undefined;
  normalized.table = table;

  return normalized;
}

export function scoreCandidate(rule: CandidateRule): CauseCandidate {
  const matched = rule.indicators.filter((item) => item.matched).length;
  const total = rule.indicators.length;
  const rawRatio = total > 0 ? matched / total : 0;
  const caps: number[] = [rawRatio];

  const blockers = rule.indicators.filter((ind) => ind.blocker && ind.matched);
  if (blockers.length > 0) caps.push(0.29);

  const missingRequired = rule.indicators.filter((ind) => ind.required && !ind.matched);
  if (missingRequired.length > 0) caps.push(0.49);

  if (total < 3) caps.push(0.39);

  const signalStrength = Math.min(...caps);

  const nextChecks = [
    ...missingRequired.map((item) => `verify: ${item.description ?? "required indicator"}`),
    ...(rule.next_check_hints ?? []),
  ];

  return {
    cause: rule.cause,
    signal_strength: Number(signalStrength.toFixed(2)),
    indicators_matched: matched,
    indicators_checked: total,
    evidence_for: rule.indicators
      .filter((item) => item.matched)
      .map((item) => item.description ?? "matched indicator"),
    evidence_against: [
      ...rule.indicators
        .filter((item) => !item.matched)
        .map((item) => item.description ?? "unmatched indicator"),
      ...blockers.map((item) => `[blocker] ${item.description ?? "blocker indicator"}`),
    ],
    next_checks: Array.from(new Set(nextChecks)).filter((item) => item.length > 0),
  };
}

export async function runQueries<Ctx extends SymptomContext>(
  ctx: Ctx,
  specs: QuerySpec<Ctx>[]
): Promise<QueryResults> {
  const entries = await Promise.all(
    specs.map(async (spec) => {
      const sql = substituteTemplate(spec.sqlTemplate, ctx as TemplateContext);
      const data = await runProbe(ctx, spec.progressStage, spec.progressWeight, () =>
        queryJsonCompact(ctx.connection, sql)
      );
      const row = data.data?.[0] as (string | number | null)[] | undefined;
      const observation = spec.toObservation(row, ctx);
      return [spec.id, observation] as const;
    })
  );
  return Object.fromEntries(entries);
}

export function evaluateRules(ruleSpecs: RuleSpec[], results: QueryResults): CandidateRule[] {
  return ruleSpecs.map((spec) => ({
    cause: spec.cause,
    indicators: spec.indicators.map((ind) => {
      const { matched, actual } = ind.match(results);
      return {
        matched,
        description: `${ind.description} (actual ${actual})`,
        required: ind.required,
        blocker: ind.blocker,
      };
    }),
    next_check_hints: spec.next_check_hints,
  }));
}

export async function discoverTargetTableByParts(
  connection: Parameters<ToolExecutor<RcaEvidenceInput, RcaEvidenceOutput>>[1],
  scope: Scope,
  target: Target | undefined
): Promise<Target | undefined> {
  const normalizedTarget = normalizeTargetTable(target);
  if (scope === "table" && normalizedTarget?.table) return normalizedTarget;

  let whereClause = "active";
  if (scope === "node" && target?.node) {
    whereClause += ` AND FQDN() = '${escapeSqlString(target.node)}'`;
  }

  const data = await queryJsonCompact(
    connection,
    `
SELECT
  ifNull(any(database), '') AS database,
  ifNull(any(table), '') AS table,
  max(parts) AS parts
FROM (
  SELECT
    FQDN() AS host_name,
    database,
    table,
    count() AS parts
  FROM {clusterAllReplicas:system.parts}
  WHERE ${whereClause}
  GROUP BY host_name, database, table
)
ORDER BY parts DESC
LIMIT 1`
  );

  const row = data.data?.[0] as (string | number | null)[] | undefined;
  if (!row) return normalizedTarget;
  const database = String(row[0] ?? "");
  const table = String(row[1] ?? "");

  if (!table) return normalizedTarget;
  return {
    ...normalizedTarget,
    database,
    table,
  };
}

const SUPPORTED_SCOPES: Record<CanonicalSymptom, Scope[]> = {
  high_query_latency: ["cluster", "node", "table", "query_pattern"],
  high_part_count: ["cluster", "node", "table"],
  high_partition_count: ["cluster", "table"],
  replication_lag: ["cluster", "node", "table"],
  merge_backlog: ["cluster", "node", "table"],
  mutation_backlog: ["cluster", "node", "table"],
  unknown: ["cluster", "node", "table", "query_pattern"],
};

const SCOPE_FALLBACK_ORDER: Record<Scope, Scope[]> = {
  query_pattern: ["table", "cluster"],
  table: ["cluster"],
  node: ["cluster"],
  cluster: [],
};

export function resolveScope(
  symptom: CanonicalSymptom,
  requestedScope: Scope,
  gaps: EvidenceGap[]
): Scope {
  const supported = SUPPORTED_SCOPES[symptom];
  if (supported.includes(requestedScope)) return requestedScope;

  for (const candidate of SCOPE_FALLBACK_ORDER[requestedScope]) {
    if (supported.includes(candidate)) {
      gaps.push({
        description: "scope downgraded",
        reason: `symptom=${symptom} does not support scope=${requestedScope}; downgraded to ${candidate}`,
      });
      return candidate;
    }
  }

  const fallback = supported[0] ?? "cluster";
  gaps.push({
    description: "scope downgraded",
    reason: `symptom=${symptom} does not support scope=${requestedScope}; downgraded to ${fallback}`,
  });
  return fallback;
}

export function buildTimeFilter(input: RcaEvidenceInput): { filter: TimeFilter; minutes: number } {
  if (input.time_range?.from && input.time_range?.to) {
    const from = escapeSqlString(input.time_range.from);
    const to = escapeSqlString(input.time_range.to);
    const fromDate = input.time_range.from;
    const toDate = input.time_range.to;
    const minutes = Math.max(
      1,
      Math.floor((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 60000)
    );
    return {
      filter: {
        whereClause:
          `event_date >= toDate('${from}') AND event_date <= toDate('${to}') ` +
          `AND event_time >= toDateTime('${from}') AND event_time <= toDateTime('${to}')`,
      },
      minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 60,
    };
  }

  const minutes = input.time_window ?? 60;
  return {
    filter: {
      whereClause:
        `event_date >= now() - INTERVAL ${minutes} MINUTE ` +
        `AND event_time >= now() - INTERVAL ${minutes} MINUTE`,
    },
    minutes,
  };
}

export function isStatusContextReusable(
  input: RcaEvidenceInput,
  scope: Scope,
  gaps: EvidenceGap[]
): boolean {
  const context = input.status_context;
  if (!context) return false;

  if (context.scope === "single_node" && scope === "cluster") {
    gaps.push({
      description: "status_context ignored",
      reason: "scope mismatch: single_node context cannot serve cluster RCA",
    });
    return false;
  }

  const generatedAt = new Date(context.generated_at).getTime();
  if (!Number.isFinite(generatedAt)) {
    gaps.push({
      description: "status_context ignored",
      reason: "invalid generated_at in status_context",
    });
    return false;
  }

  const ageMinutes = (Date.now() - generatedAt) / 60000;
  const stalenessLimit =
    context.status_analysis_mode === "snapshot"
      ? 5
      : input.time_range?.from && input.time_range?.to
        ? Math.max(
          1,
          Math.floor(
            (new Date(input.time_range.to).getTime() -
              new Date(input.time_range.from).getTime()) /
            60000
          )
        )
        : (input.time_window ?? context.window?.time_window ?? 60);

  if (ageMinutes > stalenessLimit) {
    gaps.push({
      description: "status_context ignored",
      reason: `stale: generated_at older than ${stalenessLimit} minutes`,
    });
    return false;
  }

  return true;
}

function mapSymptomTextToDimensions(symptomText: string): string[] {
  const lower = symptomText.toLowerCase();
  const dimensions = new Set<string>();

  if (/(slow|latency|timeout|duration|lag)/.test(lower)) dimensions.add("latency");
  if (/(error|fail|exception)/.test(lower)) dimensions.add("errors");
  if (/(insert|ingest|batch|part)/.test(lower)) dimensions.add("ingestion");
  if (/(replica|replication|readonly)/.test(lower)) dimensions.add("replication");
  if (/(disk|storage|space|partition)/.test(lower)) dimensions.add("storage");
  if (/(cpu|memory|resource|pressure)/.test(lower)) dimensions.add("resources");
  if (/(query|workload|throughput|qps)/.test(lower)) dimensions.add("workload");

  if (dimensions.size === 0) dimensions.add("workload");
  return Array.from(dimensions);
}

export async function handleUnknown(
  context: SymptomContext,
  symptomText: string
): Promise<SymptomResult> {
  const dimensions = mapSymptomTextToDimensions(symptomText);
  const observations: Observation[] = [];

  if (dimensions.includes("workload") || dimensions.includes("latency")) {
    const processes = await queryJsonCompact(
      context.connection,
      `
SELECT
  count() AS active_queries,
  max(now() - query_start_time) AS max_running_seconds
FROM {clusterAllReplicas:system.processes}`
    );
    const row = processes.data?.[0] as (number | null)[] | undefined;
    observations.push({
      source: "system.processes",
      description: "Active query pressure snapshot",
      metrics: {
        active_queries: asNumber(row?.[0]),
        max_running_seconds: asNumber(row?.[1]),
      },
    });
  }

  if (dimensions.includes("errors")) {
    const errors = await queryJsonCompact(
      context.connection,
      `
SELECT
  sum(value) AS error_count
FROM {clusterAllReplicas:system.errors}`
    );
    const row = errors.data?.[0] as (number | null)[] | undefined;
    observations.push({
      source: "system.errors",
      description: "Error counter snapshot",
      metrics: {
        error_count: asNumber(row?.[0]),
      },
    });
  }

  if (dimensions.includes("storage") || dimensions.includes("ingestion")) {
    const parts = await queryJsonCompact(
      context.connection,
      `
SELECT
  count() AS active_parts,
  uniqExact(concat(database, '.', table)) AS tables_with_parts
FROM {clusterAllReplicas:system.parts}
WHERE active`
    );
    const row = parts.data?.[0] as (number | null)[] | undefined;
    observations.push({
      source: "system.parts",
      description: "Global part inventory snapshot",
      metrics: {
        active_parts: asNumber(row?.[0]),
        tables_with_parts: asNumber(row?.[1]),
      },
    });
  }

  const candidates: CauseCandidate[] = [
    {
      cause: "insufficient_specific_signal",
      signal_strength: 0.25,
      indicators_matched: 1,
      indicators_checked: 4,
      evidence_for: ["generic probes detected broad pressure signals"],
      evidence_against: ["symptom did not map cleanly to a canonical RCA module"],
      next_checks: [
        "refine symptom using one of: high_query_latency, high_part_count, high_partition_count",
        "run collect_cluster_status with focused checks before RCA",
      ],
    },
  ];

  const possibleActions: PossibleAction[] = [
    {
      title: "Run focused RCA with a canonical symptom key",
      risk: "low",
      tied_to: "insufficient_specific_signal",
    },
  ];

  return {
    observations,
    candidates,
    possible_actions: possibleActions,
  };
}

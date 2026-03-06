import {
  QueryError,
  type Connection,
  type JSONCompactFormatResponse,
} from "@/lib/connection/connection";
import { escapeSqlString, type ToolProgressCallback } from "../client-tool-types";
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

export type RcaThresholds = {
  high_query_latency: {
    avg_read_rows_gte: number;
    avg_read_bytes_gte: number;
    p99_latency_ms_gte: number;
    active_merges_gt: number;
    max_merge_elapsed_seconds_gt: number;
    p95_latency_ms_gte: number;
    memory_used_percent_gte: number;
    avg_query_memory_bytes_gte: number;
  };
  high_part_count: {
    inserts_per_minute_gt: number;
    avg_rows_per_insert_lt: number;
    total_active_parts_gt: number;
    active_merges_gt: number;
    max_merge_elapsed_seconds_gt: number;
    distinct_partitions_gt: number;
    partition_to_parts_ratio_gt: number;
    max_parts_per_partition_gt: number;
    related_symptom_distinct_partitions_gte: number;
    related_symptom_signal_strength_gte: number;
  };
  high_partition_count: {
    partition_count_gt: number;
    recent_partitions_gt: number;
    partition_to_parts_ratio_gt: number;
    avg_rows_per_insert_lt: number;
    unbounded_growth_partition_count_gt: number;
  };
};

export type RcaThresholdOverrides = {
  high_query_latency?: Partial<RcaThresholds["high_query_latency"]>;
  high_part_count?: Partial<RcaThresholds["high_part_count"]>;
  high_partition_count?: Partial<RcaThresholds["high_partition_count"]>;
};

export const DEFAULT_RCA_THRESHOLDS: RcaThresholds = {
  high_query_latency: {
    avg_read_rows_gte: 1_000_000,
    avg_read_bytes_gte: 1_000_000_000,
    p99_latency_ms_gte: 2000,
    active_merges_gt: 10,
    max_merge_elapsed_seconds_gt: 600,
    p95_latency_ms_gte: 1000,
    memory_used_percent_gte: 85,
    avg_query_memory_bytes_gte: 1_000_000_000,
  },
  high_part_count: {
    inserts_per_minute_gt: 10,
    avg_rows_per_insert_lt: 10_000,
    total_active_parts_gt: 3000,
    active_merges_gt: 20,
    max_merge_elapsed_seconds_gt: 600,
    distinct_partitions_gt: 500,
    partition_to_parts_ratio_gt: 0.2,
    max_parts_per_partition_gt: 1000,
    related_symptom_distinct_partitions_gte: 100,
    related_symptom_signal_strength_gte: 0.3,
  },
  high_partition_count: {
    partition_count_gt: 1000,
    recent_partitions_gt: 100,
    partition_to_parts_ratio_gt: 0.3,
    avg_rows_per_insert_lt: 10_000,
    unbounded_growth_partition_count_gt: 500,
  },
};

export type RcaEvidenceInput = {
  symptom: CanonicalSymptom;
  scope?: Scope;
  target?: Target;
  symptom_text?: string;
  thresholds?: RcaThresholdOverrides;
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
  partition_key_columns?: Array<{
    name: string;
    data_type: string;
    sample_values?: Array<string | number | null>;
  }>;
  scope_summary?: {
    level: "cluster" | "node" | "table";
    aggregation_semantics: "additive" | "ratio" | "quantile" | "inventory";
    cluster_aggregation?: string;
  };
  top_nodes?: Array<{
    node: string;
    metrics: Record<string, number | string | null>;
  }>;
  nodes_over_threshold?: Array<{
    node: string;
    metric: string;
    value: number;
    threshold: number;
  }>;
};

export type CauseCandidate = {
  cause: string;
  support_score: number;
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

export type ExcludedCandidate = {
  cause: string;
  missing_required: string[];
  evidence_against: string[];
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
  excluded_candidates?: ExcludedCandidate[];
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

export type CauseEvaluation = {
  cause: string;
  indicators: IndicatorResult[];
  next_check_hints?: string[];
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

export type TimeFilter = {
  whereClause: string;
};

export type RcaQueryConnection = {
  queryJsonCompact(sql: string): Promise<JSONCompactFormatResponse>;
};

export function createCachedRcaConnection(connection: Connection): RcaQueryConnection {
  const queryCache = new Map<string, Promise<JSONCompactFormatResponse>>();

  return {
    queryJsonCompact(sql: string): Promise<JSONCompactFormatResponse> {
      const cached = queryCache.get(sql);
      if (cached) {
        return cached;
      }

      const request = connection.queryJsonCompact(sql).catch((error) => {
        queryCache.delete(sql);
        throw error;
      });
      queryCache.set(sql, request);
      return request;
    },
  };
}

export type SymptomContext = {
  connection: RcaQueryConnection;
  scope: Scope;
  target?: Target;
  symptomText?: string;
  thresholds: RcaThresholds;
  timeFilter: TimeFilter;
  timeWindowMinutes: number;
  gaps: EvidenceGap[];
  progressCallback?: ToolProgressCallback;
};

export type SymptomEvidence = {
  observations: Observation[];
  candidates: CauseCandidate[];
  excluded_candidates?: ExcludedCandidate[];
  possible_actions: PossibleAction[];
  target?: Target;
  related_symptoms?: CanonicalSymptom[];
};

export type RcaContextExtension = {
  name: string;
  resolve(input: {
    symptom: CanonicalSymptom;
    context: SymptomContext;
    evidence: SymptomEvidence;
  }): Promise<{
    available: boolean;
    source: "none" | "extension";
    observations?: Observation[];
    possible_actions?: PossibleAction[];
    related_symptoms?: CanonicalSymptom[];
  }>;
};

export type SymptomEvidenceCollector = (context: SymptomContext) => Promise<SymptomEvidence>;

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function quoteIdentifier(name: string): string {
  return `\`${name.replaceAll("`", "``")}\``;
}

function truncateSampleValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value);
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

export async function enrichPartitionKeyColumns(
  context: SymptomContext,
  target: Target | undefined,
  observations: Observation[],
  stage: string,
  progress: number
): Promise<void> {
  if (!target?.database || !target.table) return;
  const partitionObservation = observations.find(
    (obs) =>
      typeof obs.metrics["partition_key"] === "string" &&
      String(obs.metrics["partition_key"]).length > 0
  );
  if (!partitionObservation) return;

  await runQuery(context, stage, progress, async () => {
    const database = escapeSqlLiteral(target.database!);
    const table = escapeSqlLiteral(target.table!);

    const columnsData = await context.connection.queryJsonCompact(`
SELECT name, type
FROM system.columns
WHERE database = '${database}'
  AND table = '${table}'
  AND is_in_partition_key = 1
ORDER BY position`);

    const columnRows = (columnsData.data ?? []) as (string | number | null)[][];
    if (columnRows.length === 0) return;

    const columns = columnRows.map((row) => ({
      name: String(row[0] ?? ""),
      data_type: String(row[1] ?? "unknown"),
    }));

    const selectList = columns.map((col) => quoteIdentifier(col.name)).join(", ");
    const sampleData = await context.connection.queryJsonCompact(`
SELECT ${selectList}
FROM ${quoteIdentifier(target.database!)}.${quoteIdentifier(target.table!)}
LIMIT 3`);
    const sampleRows = (sampleData.data ?? []) as (string | number | null)[][];

    partitionObservation.partition_key_columns = columns.map((col, idx) => ({
      name: col.name,
      data_type: col.data_type,
      sample_values: sampleRows.slice(0, 3).map((row) => truncateSampleValue(row[idx])),
    }));
  });
}

function stringifyError(error: unknown): string {
  if (error instanceof QueryError && error.data) {
    return typeof error.data === "string" ? error.data : JSON.stringify(error.data);
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function runQuery<T>(
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
  expr = "hostName()"
): string {
  if (scope === "node" && target?.node) {
    const node = escapeSqlString(target.node);
    return `${expr} = '${node}'`;
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
    return buildNodePredicate(scope, target, "hostName()");
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

export function scoreCandidate(rule: CauseEvaluation): CauseCandidate {
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
    support_score: Number(signalStrength.toFixed(2)),
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

export async function collectObservation<Ctx extends SymptomContext>(input: {
  context: Ctx;
  stage: string;
  progress: number;
  sqlTemplate: string;
  toObservation: (row: (string | number | null)[] | undefined, ctx: Ctx) => Observation;
}): Promise<Observation> {
  const { context, stage, progress, sqlTemplate, toObservation } = input;
  const sql = substituteTemplate(sqlTemplate, context as TemplateContext);
  const data = await runQuery(context, stage, progress, () =>
    context.connection.queryJsonCompact(sql)
  );
  const row = data.data?.[0] as (string | number | null)[] | undefined;
  return toObservation(row, context);
}

export function evaluateCandidate(input: {
  cause: string;
  next_check_hints?: string[];
  indicators: Array<{
    description: string;
    evaluation: IndicatorMatchResult;
    required?: boolean;
    blocker?: boolean;
  }>;
}): CauseEvaluation {
  return {
    cause: input.cause,
    next_check_hints: input.next_check_hints,
    indicators: input.indicators.map((indicator) => ({
      matched: indicator.evaluation.matched,
      description: `${indicator.description} (actual ${indicator.evaluation.actual})`,
      required: indicator.required,
      blocker: indicator.blocker,
    })),
  };
}

export function scoreCauseEvaluations(evaluations: CauseEvaluation[]): {
  candidates: CauseCandidate[];
  excludedCandidates: ExcludedCandidate[];
} {
  const includedRules = evaluations.filter((rule) =>
    rule.indicators.filter((ind) => ind.required).every((ind) => ind.matched)
  );
  const excludedCandidates: ExcludedCandidate[] = evaluations
    .filter((rule) => rule.indicators.some((ind) => ind.required && !ind.matched))
    .map((rule) => {
      const scored = scoreCandidate(rule);
      return {
        cause: rule.cause,
        missing_required: rule.indicators
          .filter((ind) => ind.required && !ind.matched)
          .map((ind) => ind.description ?? "required indicator"),
        evidence_against: scored.evidence_against,
      };
    });
  const candidates = includedRules
    .map(scoreCandidate)
    .sort((a, b) => b.support_score - a.support_score);
  return { candidates, excludedCandidates };
}

export async function discoverTargetTableByParts(
  connection: RcaQueryConnection,
  scope: Scope,
  target: Target | undefined
): Promise<Target | undefined> {
  const normalizedTarget = normalizeTargetTable(target);
  if (scope === "table" && normalizedTarget?.table) return normalizedTarget;

  let whereClause = "active";
  if (scope === "node" && target?.node) {
    whereClause += ` AND ${buildNodePredicate(scope, target, "hostName()")}`;
  }

  const data = await connection.queryJsonCompact(`
SELECT
  ifNull(any(database), '') AS database,
  ifNull(any(table), '') AS table,
  max(parts) AS parts
FROM (
  SELECT
    hostName() AS host_name,
    database,
    table,
    count() AS parts
  FROM {clusterAllReplicas:system.parts}
  WHERE ${whereClause}
  GROUP BY host_name, database, table
)
ORDER BY parts DESC
LIMIT 1`);

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

export function resolveRcaThresholds(overrides?: RcaThresholdOverrides): RcaThresholds {
  return {
    high_query_latency: {
      ...DEFAULT_RCA_THRESHOLDS.high_query_latency,
      ...(overrides?.high_query_latency ?? {}),
    },
    high_part_count: {
      ...DEFAULT_RCA_THRESHOLDS.high_part_count,
      ...(overrides?.high_part_count ?? {}),
    },
    high_partition_count: {
      ...DEFAULT_RCA_THRESHOLDS.high_partition_count,
      ...(overrides?.high_partition_count ?? {}),
    },
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

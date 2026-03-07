import {
  QueryError,
  type Connection,
  type JSONCompactFormatResponse,
} from "@/lib/connection/connection";
import { SqlUtils } from "@/lib/sql-utils";
import { escapeSqlString, type ToolExecutor } from "./client-tool-types";

export type SearchQueryLogMode = "patterns" | "executions";
export type SearchQueryLogMetric =
  | "cpu"
  | "memory"
  | "disk"
  | "duration"
  | "read_rows"
  | "read_bytes";
export type SearchQueryLogMetricAggregation = "sum" | "avg" | "max";
export type SearchQueryLogPredicateField =
  | "user"
  | "query_kind"
  | "query"
  | "query_id"
  | "normalized_query_hash"
  | "database"
  | "table"
  | "type"
  | "is_initial_query"
  | "has_error"
  | "exception"
  | "query_duration_ms"
  | "read_rows"
  | "read_bytes"
  | "memory_usage"
  | "result_rows";
export type SearchQueryLogPredicateOp =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "contains_ci"
  | "not_contains_ci"
  | "has"
  | "not_has"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_null"
  | "not_null";

export type SearchQueryLogPredicateValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

export type SearchQueryLogPredicate = {
  field: SearchQueryLogPredicateField;
  op: SearchQueryLogPredicateOp;
  value?: SearchQueryLogPredicateValue;
};

export type SearchQueryLogInput = {
  mode?: SearchQueryLogMode;
  metric?: SearchQueryLogMetric;
  metric_aggregation?: SearchQueryLogMetricAggregation;
  limit?: number;
  time_window?: number;
  time_range?: {
    from: string;
    to: string;
  };
  predicates?: SearchQueryLogPredicate[];
};

export type SearchQueryLogOutput = {
  success: boolean;
  mode: SearchQueryLogMode;
  metric?: SearchQueryLogMetric;
  metric_aggregation?: SearchQueryLogMetricAggregation;
  time_window?: number;
  time_range?: {
    from: string;
    to: string;
  };
  defaults_applied: string[];
  filters_applied: string[];
  rowCount: number;
  rows: Array<Record<string, unknown>>;
  message?: string;
};

type MetricConfig = {
  label: string;
  column: string;
};

type BuildQueryResult = {
  sql: string;
  defaultsApplied: string[];
  filtersApplied: string[];
};

type TimeFilterInfo = {
  filter: string;
  window?: number;
  range?: { from: string; to: string };
};

const METRIC_CONFIG: Record<SearchQueryLogMetric, MetricConfig> = {
  cpu: {
    label: "CPU Time (us)",
    column: "ProfileEvents['OSCPUVirtualTimeMicroseconds']",
  },
  memory: {
    label: "Memory (bytes)",
    column: "memory_usage",
  },
  disk: {
    label: "Disk Read (bytes)",
    column: "ProfileEvents['OSReadBytes']",
  },
  duration: {
    label: "Duration (ms)",
    column: "query_duration_ms",
  },
  read_rows: {
    label: "Read Rows",
    column: "read_rows",
  },
  read_bytes: {
    label: "Read Bytes",
    column: "read_bytes",
  },
};

const queryLogColumnsCache = new WeakMap<Connection, Set<string>>();
const queryLogColumnsPromiseCache = new WeakMap<Connection, Promise<Set<string>>>();

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toTimeFilter(
  time_window?: number,
  time_range?: { from: string; to: string }
): TimeFilterInfo {
  if (time_range?.from && time_range?.to) {
    const fromExpr = `toDateTime('${time_range.from}')`;
    const toExpr = isDateOnly(time_range.to)
      ? `toDateTime('${time_range.to}') + INTERVAL 1 DAY`
      : `toDateTime('${time_range.to}')`;
    const toOperator = isDateOnly(time_range.to) ? "<" : "<=";

    return {
      filter: `event_date >= toDate('${time_range.from}') AND event_date <= toDate('${time_range.to}') AND event_time >= ${fromExpr} AND event_time ${toOperator} ${toExpr}`,
      range: time_range,
    };
  }

  const minutes = time_window ?? 60;
  return {
    filter: `event_date >= toDate(now() - INTERVAL ${minutes} MINUTE) AND event_time >= now() - INTERVAL ${minutes} MINUTE`,
    window: minutes,
  };
}

function asArray(
  value: SearchQueryLogPredicateValue | undefined
): Array<string | number | boolean> {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function quoteValue(value: string | number | boolean): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Numeric filter value must be finite. Received: ${value}`);
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return `'${escapeSqlString(value)}'`;
}

function requireScalarValue(predicate: SearchQueryLogPredicate): string | number | boolean {
  if (predicate.value == null || Array.isArray(predicate.value)) {
    throw new Error(`Predicate ${predicate.field} ${predicate.op} requires a scalar value.`);
  }
  return predicate.value;
}

function requireArrayValue(predicate: SearchQueryLogPredicate): Array<string | number | boolean> {
  const values = asArray(predicate.value);
  if (values.length === 0) {
    throw new Error(`Predicate ${predicate.field} ${predicate.op} requires at least one value.`);
  }
  return values;
}

function compileScalarPredicate(expression: string, predicate: SearchQueryLogPredicate): string {
  switch (predicate.op) {
    case "eq":
      return `${expression} = ${quoteValue(requireScalarValue(predicate))}`;
    case "neq":
      return `${expression} != ${quoteValue(requireScalarValue(predicate))}`;
    case "in": {
      const values = requireArrayValue(predicate).map(quoteValue).join(", ");
      return `${expression} IN (${values})`;
    }
    case "not_in": {
      const values = requireArrayValue(predicate).map(quoteValue).join(", ");
      return `${expression} NOT IN (${values})`;
    }
    case "contains_ci":
      return `positionCaseInsensitive(${expression}, ${quoteValue(requireScalarValue(predicate))}) > 0`;
    case "not_contains_ci":
      return `positionCaseInsensitive(${expression}, ${quoteValue(requireScalarValue(predicate))}) = 0`;
    case "is_null":
      return `${expression} IS NULL`;
    case "not_null":
      return `${expression} IS NOT NULL`;
    default:
      throw new Error(`Predicate ${predicate.field} does not support operator ${predicate.op}.`);
  }
}

function compileNumericPredicate(expression: string, predicate: SearchQueryLogPredicate): string {
  switch (predicate.op) {
    case "eq":
      return `${expression} = ${quoteValue(requireScalarValue(predicate))}`;
    case "neq":
      return `${expression} != ${quoteValue(requireScalarValue(predicate))}`;
    case "in": {
      const values = requireArrayValue(predicate).map(quoteValue).join(", ");
      return `${expression} IN (${values})`;
    }
    case "not_in": {
      const values = requireArrayValue(predicate).map(quoteValue).join(", ");
      return `${expression} NOT IN (${values})`;
    }
    case "gt":
      return `${expression} > ${quoteValue(requireScalarValue(predicate))}`;
    case "gte":
      return `${expression} >= ${quoteValue(requireScalarValue(predicate))}`;
    case "lt":
      return `${expression} < ${quoteValue(requireScalarValue(predicate))}`;
    case "lte":
      return `${expression} <= ${quoteValue(requireScalarValue(predicate))}`;
    default:
      throw new Error(`Predicate ${predicate.field} does not support operator ${predicate.op}.`);
  }
}

function compileArrayPredicate(expression: string, predicate: SearchQueryLogPredicate): string {
  switch (predicate.op) {
    case "has":
    case "eq":
      return `has(${expression}, ${quoteValue(requireScalarValue(predicate))})`;
    case "not_has":
    case "neq":
      return `NOT has(${expression}, ${quoteValue(requireScalarValue(predicate))})`;
    case "in": {
      const values = requireArrayValue(predicate).map(quoteValue).join(", ");
      return `hasAny(${expression}, [${values}])`;
    }
    case "not_in": {
      const values = requireArrayValue(predicate).map(quoteValue).join(", ");
      return `NOT hasAny(${expression}, [${values}])`;
    }
    default:
      throw new Error(`Predicate ${predicate.field} does not support operator ${predicate.op}.`);
  }
}

function compilePredicate(predicate: SearchQueryLogPredicate): string {
  switch (predicate.field) {
    case "user":
    case "query_kind":
    case "query_id":
    case "normalized_query_hash":
    case "type":
      return compileScalarPredicate(predicate.field, predicate);
    case "query":
      return compileScalarPredicate("query", predicate);
    case "exception":
      return compileScalarPredicate("ifNull(exception, '')", predicate);
    case "database":
      return compileArrayPredicate("databases", predicate);
    case "table":
      return compileArrayPredicate("tables", predicate);
    case "is_initial_query":
      return compileNumericPredicate("is_initial_query", predicate);
    case "has_error": {
      if (!["eq", "neq"].includes(predicate.op)) {
        throw new Error(`Predicate has_error only supports eq and neq.`);
      }
      const value = requireScalarValue(predicate);
      if (typeof value !== "boolean") {
        throw new Error(`Predicate has_error requires a boolean value.`);
      }
      const expression = `ifNull(exception, '') != ''`;
      return predicate.op === "eq"
        ? `(${expression}) = ${quoteValue(value)}`
        : `(${expression}) != ${quoteValue(value)}`;
    }
    case "query_duration_ms":
    case "read_rows":
    case "read_bytes":
    case "memory_usage":
    case "result_rows":
      return compileNumericPredicate(predicate.field, predicate);
    default:
      throw new Error(`Unsupported predicate field: ${predicate.field}`);
  }
}

function describePredicate(predicate: SearchQueryLogPredicate): string {
  if (predicate.value == null) {
    return `${predicate.field} ${predicate.op}`;
  }
  return `${predicate.field} ${predicate.op} ${JSON.stringify(predicate.value)}`;
}

async function loadQueryLogColumns(connection: Connection): Promise<Set<string>> {
  const cachedColumns = queryLogColumnsCache.get(connection);
  if (cachedColumns) {
    return cachedColumns;
  }

  const inFlightPromise = queryLogColumnsPromiseCache.get(connection);
  if (inFlightPromise) {
    return inFlightPromise;
  }

  const loadPromise = (async () => {
    const { response } = connection.query(
      `
SELECT name
FROM system.columns
WHERE database = 'system' AND table = 'query_log'
`,
      { default_format: "JSONCompact" }
    );
    const rows = (await response).data.json<JSONCompactFormatResponse>().data;
    const columns = new Set(rows.map((row) => String(row[0] ?? "")));
    queryLogColumnsCache.set(connection, columns);
    return columns;
  })();
  queryLogColumnsPromiseCache.set(connection, loadPromise);

  try {
    return await loadPromise;
  } finally {
    queryLogColumnsPromiseCache.delete(connection);
  }
}

export function resolveMetricExpression(
  metric: SearchQueryLogMetric | undefined,
  availableColumns: Set<string>
): { expression?: string; label?: string } {
  if (!metric) {
    return {};
  }

  const config = METRIC_CONFIG[metric];
  if (
    (config.column.startsWith("ProfileEvents[") && availableColumns.has("ProfileEvents")) ||
    availableColumns.has(config.column)
  ) {
    return {
      expression: config.column,
      label: config.label,
    };
  }

  throw new Error(`Metric '${metric}' is not available in system.query_log on this server.`);
}

export function buildSearchQueryLogSql(
  input: SearchQueryLogInput,
  availableColumns: Set<string>
): BuildQueryResult {
  const mode = input.mode ?? "patterns";
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 100);
  const predicates = input.predicates ?? [];
  const timeInfo = toTimeFilter(input.time_window, input.time_range);
  const metricAggregation = input.metric_aggregation ?? "sum";
  const { expression: metricExpression } = resolveMetricExpression(input.metric, availableColumns);

  const conditions = [timeInfo.filter];
  const defaultsApplied: string[] = [];
  const filtersApplied: string[] = predicates.map(describePredicate);
  const touchedFields = new Set(predicates.map((predicate) => predicate.field));

  if (!touchedFields.has("type")) {
    conditions.push(`type = 'QueryFinish'`);
    defaultsApplied.push("type = QueryFinish");
  }
  if (!touchedFields.has("is_initial_query")) {
    conditions.push("is_initial_query = 1");
    defaultsApplied.push("is_initial_query = 1");
  }
  if (!touchedFields.has("query_kind")) {
    conditions.push(`query_kind = 'Select'`);
    defaultsApplied.push("query_kind = Select");
  }

  for (const predicate of predicates) {
    conditions.push(compilePredicate(predicate));
  }

  if (mode === "patterns") {
    const metricProjection = metricExpression
      ? `,\n  ${metricAggregation}(${metricExpression}) AS metric_value`
      : "";
    const metricOrderBy = metricExpression
      ? `metric_value DESC, last_execution_time DESC`
      : `execution_count DESC, last_execution_time DESC`;

    return {
      sql: `
SELECT
  normalized_query_hash,
  any(query_id) AS sample_query_id,
  any(user) AS sample_user,
  substring(any(query), 1, 300) AS sql_preview,
  max(event_time) AS last_execution_time,
  count() AS execution_count,
  avg(query_duration_ms) AS avg_duration_ms,
  max(query_duration_ms) AS max_duration_ms,
  max(memory_usage) AS max_memory_usage,
  sum(read_rows) AS sum_read_rows,
  sum(read_bytes) AS sum_read_bytes,
  any(tables) AS tables${metricProjection}
FROM {clusterAllReplicas:system.query_log}
WHERE
  ${conditions.join("\n  AND ")}
GROUP BY normalized_query_hash
ORDER BY ${metricOrderBy}
LIMIT ${limit}
`,
      defaultsApplied,
      filtersApplied,
    };
  }

  const metricProjection = metricExpression ? `,\n  ${metricExpression} AS metric_value` : "";
  const metricOrderBy = metricExpression ? `metric_value DESC, event_time DESC` : `event_time DESC`;

  return {
    sql: `
SELECT
  query_id,
  user,
  event_time,
  query_kind,
  query_duration_ms,
  memory_usage,
  read_rows,
  read_bytes,
  result_rows,
  exception,
  normalized_query_hash,
  substring(query, 1, 300) AS sql_preview,
  tables${metricProjection}
FROM {clusterAllReplicas:system.query_log}
WHERE
  ${conditions.join("\n  AND ")}
ORDER BY ${metricOrderBy}
LIMIT ${limit}
`,
    defaultsApplied,
    filtersApplied,
  };
}

function qualifyPreviewSql(row: Record<string, unknown>) {
  const sqlPreview = typeof row.sql_preview === "string" ? row.sql_preview : undefined;
  const tables = Array.isArray(row.tables) ? (row.tables as string[]) : undefined;
  if (sqlPreview && tables && tables.length > 0) {
    row.sql_preview = SqlUtils.qualifyTableNames(sqlPreview, tables);
  }
  delete row.tables;
}

export const searchQueryLogExecutor: ToolExecutor<
  SearchQueryLogInput,
  SearchQueryLogOutput
> = async (input, connection) => {
  const mode = input.mode ?? "patterns";
  const metricAggregation = input.metric_aggregation ?? "sum";
  const timeInfo = toTimeFilter(input.time_window, input.time_range);

  try {
    const availableColumns = await loadQueryLogColumns(connection);
    const query = buildSearchQueryLogSql(input, availableColumns);
    const { response } = connection.query(query.sql, { default_format: "JSONCompact" });
    const payload = (await response).data.json<JSONCompactFormatResponse>();
    const meta = payload.meta ?? [];
    const data = payload.data ?? [];

    const rows = data.map((row) => {
      const shaped: Record<string, unknown> = {};
      meta.forEach((column, index) => {
        shaped[column.name] = row[index];
      });
      qualifyPreviewSql(shaped);
      return shaped;
    });

    return {
      success: true,
      mode,
      metric: input.metric,
      metric_aggregation: input.metric ? metricAggregation : undefined,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      defaults_applied: query.defaultsApplied,
      filters_applied: query.filtersApplied,
      rowCount: rows.length,
      rows,
      message: rows.length === 0 ? "No query_log rows matched the requested filters." : undefined,
    };
  } catch (error) {
    let errorMessage: string;
    if (error instanceof QueryError && error.data) {
      errorMessage = typeof error.data === "string" ? error.data : JSON.stringify(error.data);
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    return {
      success: false,
      mode,
      metric: input.metric,
      metric_aggregation: input.metric ? metricAggregation : undefined,
      time_window: timeInfo.window,
      time_range: timeInfo.range,
      defaults_applied: [],
      filters_applied: (input.predicates ?? []).map(describePredicate),
      rowCount: 0,
      rows: [],
      message: `Failed to query system.query_log: ${errorMessage}`,
    };
  }
};

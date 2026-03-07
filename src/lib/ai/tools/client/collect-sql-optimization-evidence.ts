import { QueryError, type Connection } from "@/lib/connection/connection";
import { SqlUtils } from "@/lib/sql-utils";
import { escapeSqlString, type ToolExecutor, type ToolProgressCallback } from "./client-tool-types";

type CollectMode = "light" | "full";

type TableStatsEvidence = {
  rows?: number;
  bytes?: number;
  parts?: number;
  partitions?: number;
};

type TableStructureEvidence = {
  columns: Array<[string, string]>;
  engine?: string;
  partition_key?: string | null;
  primary_key?: string | null;
  sorting_key?: string | null;
  secondary_indexes?: string[];
};

type OptimizationTargetEvidence = TableStructureEvidence & {
  database: string;
  table: string;
  cluster?: string;
  stats?: TableStatsEvidence;
};

type QueryLogResourceSummary = Record<string, number>;

type ExplainPruningMetric = {
  selected: number;
  total: number;
  ratio: number;
};

type ExplainIndexDetail = {
  name: string;
  keys: string[];
  index_name?: string;
  description?: string;
  condition?: string;
  parts?: ExplainPruningMetric;
  granules?: ExplainPruningMetric;
  search_algorithm?: string;
};

type ExplainIndexEvidence = {
  table?: string;
  indexes: ExplainIndexDetail[];
  summary: string[];
  raw_text?: string;
};

type ExplainPipelineEvidence = {
  max_parallelism?: number;
  operators: string[];
  summary: string[];
  raw_text?: string;
};

type DistributedTableTarget = {
  cluster?: string;
  database: string;
  table: string;
};

/**
 * Evidence payload structure returned by collect_sql_optimization_evidence tool.
 */
export interface EvidenceContext {
  goal: string;
  sql?: string;
  query_id?: string;
  symptoms?: {
    latency_ms?: number;
    read_rows?: number;
    read_bytes?: number;
    result_rows?: number;
    peak_memory_bytes?: number;
    spilled?: boolean;
    errors?: string | null;
  };
  tables?: Array<{ database: string; table: string; engine: string }>;
  table_schema?: Record<
    string,
    TableStructureEvidence & {
      optimization_target?: OptimizationTargetEvidence;
    }
  >;
  table_stats?: Record<string, TableStatsEvidence>;
  explain_index?: ExplainIndexEvidence;
  explain_pipeline?: ExplainPipelineEvidence;
  query_log?: {
    duration_ms?: number;
    read_rows?: number;
    read_bytes?: number;
    memory_usage?: number;
    result_rows?: number;
    exception?: string | null;
    resource_summary?: QueryLogResourceSummary;
    profile_events?: Record<string, number>;
  };
  settings?: Record<string, string | number>;
  constraints?: string[];
  cluster?: {
    mode?: string;
    shards?: number;
    replicas?: number;
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof QueryError && error.data) {
    return typeof error.data === "string" ? error.data : JSON.stringify(error.data);
  }
  return error instanceof Error ? error.message : String(error);
}

export type CollectSqlOptimizationEvidenceInput = {
  sql?: string;
  query_id?: string;
  goal?: "latency" | "memory" | "bytes" | "dashboard" | "other";
  mode?: CollectMode;
  time_window?: number;
  time_range?: {
    from: string;
    to: string;
  };
  requested?: {
    required?: string[];
    optional?: string[];
  };
};

type JsonCompactResponse = {
  data: unknown[][];
};

type TableName = {
  database: string;
  table: string;
};

type TableMetadata = {
  engine: string;
  partition_key: string | null;
  primary_key: string | null;
  sorting_key: string | null;
  create_table_query: string | null;
};

type TableStats = {
  rows: number;
  bytes: number;
  parts: number;
  partitions: number;
};

const IMPORTANT_PROFILE_EVENTS = new Set([
  "OSCPUVirtualTimeMicroseconds",
  "OSCPUWaitMicroseconds",
  "OSReadBytes",
  "OSWriteBytes",
  "NetworkSendBytes",
  "NetworkReceiveBytes",
  "SelectedMarks",
  "SelectedRows",
  "MarkCacheHits",
  "MarkCacheMisses",
  "DiskReadElapsedMicroseconds",
  "DiskWriteElapsedMicroseconds",
]);

/**
 * Extract INDEX expressions from CREATE TABLE query
 * @param createTableQuery - The CREATE TABLE query string
 * @returns Array of index expressions (e.g., ["INDEX idx_name expr TYPE type GRANULARITY n"])
 *
 * ClickHouse INDEX syntax:
 *   INDEX index_name expr TYPE type[(params)] [GRANULARITY granularity]
 *
 * Examples:
 *   INDEX idx_user user_id TYPE bloom_filter GRANULARITY 1
 *   INDEX idx_name lower(name) TYPE ngrambf_v1(3, 256, 2, 0) GRANULARITY 4
 *   INDEX idx_date date TYPE minmax
 */
function extractSecondaryIndexes(createTableQuery: string | null): string[] {
  if (!createTableQuery) {
    return [];
  }

  const indexRegex = /INDEX \w+ .+? TYPE .+? GRANULARITY \d+/gi;

  const indexes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = indexRegex.exec(createTableQuery)) !== null) {
    indexes.push(match[0]);
  }

  return indexes;
}

function buildTableKey(database: string, table: string): string {
  return `${database}.${table}`;
}

function dedupeTableNames(tableNames: TableName[]): TableName[] {
  const seen = new Set<string>();
  return tableNames.filter(({ database, table }) => {
    const key = buildTableKey(database, table);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toStatsEvidence(stats?: TableStats): TableStatsEvidence | undefined {
  if (!stats) {
    return undefined;
  }

  return {
    rows: stats.rows,
    bytes: stats.bytes,
    parts: stats.parts,
    partitions: stats.partitions,
  };
}

function tryParseMetric(value: string): ExplainPruningMetric | undefined {
  const match = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return undefined;
  }

  const selected = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(selected) || !Number.isFinite(total) || total <= 0) {
    return undefined;
  }

  return {
    selected,
    total,
    ratio: selected / total,
  };
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`;
}

function formatPruningMetric(label: string, metric?: ExplainPruningMetric): string | undefined {
  if (!metric) {
    return undefined;
  }

  return `${label} ${metric.selected}/${metric.total} (${formatPercent(metric.ratio)} scanned)`;
}

export function buildQueryLogResourceSummary(
  profileEvents?: Record<string, number>
): QueryLogResourceSummary | undefined {
  if (!profileEvents) {
    return undefined;
  }

  const summary: QueryLogResourceSummary = {};
  for (const eventName of IMPORTANT_PROFILE_EVENTS) {
    const value = profileEvents[eventName];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      summary[eventName] = value;
    }
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function shouldFlagSpill(profileEvents?: Record<string, number>): boolean {
  if (!profileEvents) {
    return false;
  }

  return Object.entries(profileEvents).some(([key, value]) => /external/i.test(key) && value > 0);
}

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^['"`]|['"`]$/g, "");
}

export function parseDistributedTableTarget(
  createTableQuery: string | null
): DistributedTableTarget | undefined {
  if (!createTableQuery) {
    return undefined;
  }

  const match = createTableQuery.match(
    /Distributed\s*\(\s*(?:'([^']+)'|"([^"]+)"|([^,\s]+))\s*,\s*(?:'([^']+)'|"([^"]+)"|([^,\s]+))\s*,\s*(?:'([^']+)'|"([^"]+)"|([^,\s)]+))/i
  );

  if (!match) {
    return undefined;
  }

  const cluster = stripWrappingQuotes(match[1] ?? match[2] ?? match[3] ?? "");
  const database = stripWrappingQuotes(match[4] ?? match[5] ?? match[6] ?? "");
  const table = stripWrappingQuotes(match[7] ?? match[8] ?? match[9] ?? "");

  if (!database || !table) {
    return undefined;
  }

  return {
    cluster: cluster || undefined,
    database,
    table,
  };
}

export function parseExplainIndexText(
  explainText: string,
  mode: CollectMode = "light"
): ExplainIndexEvidence {
  const lines = explainText
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0);

  const table =
    lines.map((line) => line.trim().match(/^ReadFromMergeTree\s+\((.+)\)$/)).find(Boolean)?.[1] ??
    undefined;

  const indexesStart = lines.findIndex((line) => line.trim() === "Indexes:");
  if (indexesStart === -1) {
    return {
      table,
      indexes: [],
      summary: table ? [`Read from ${table}`] : ["No index pruning details were returned."],
      raw_text: mode === "full" ? explainText : undefined,
    };
  }

  const indexes: ExplainIndexDetail[] = [];
  let currentIndex: ExplainIndexDetail | undefined;
  let readingKeys = false;

  for (const rawLine of lines.slice(indexesStart + 1)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line === "Keys:") {
      readingKeys = true;
      continue;
    }

    const attributeMatch = line.match(
      /^(Name|Description|Condition|Parts|Granules|Search Algorithm):\s*(.+)$/
    );
    if (attributeMatch && currentIndex) {
      readingKeys = false;
      const [, attribute, value] = attributeMatch;
      if (attribute === "Name") {
        currentIndex.index_name = value;
      } else if (attribute === "Description") {
        currentIndex.description = value;
      } else if (attribute === "Condition") {
        currentIndex.condition = value;
      } else if (attribute === "Parts") {
        currentIndex.parts = tryParseMetric(value);
      } else if (attribute === "Granules") {
        currentIndex.granules = tryParseMetric(value);
      } else if (attribute === "Search Algorithm") {
        currentIndex.search_algorithm = value;
      }
      continue;
    }

    if (readingKeys && currentIndex) {
      currentIndex.keys.push(line);
      continue;
    }

    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(line)) {
      readingKeys = false;
      currentIndex = {
        name: line,
        keys: [],
      };
      indexes.push(currentIndex);
      continue;
    }
  }

  const summary = indexes.map((index) => {
    const segments = [
      index.description ? `description ${index.description}` : undefined,
      index.keys.length > 0 ? `keys ${index.keys.join(", ")}` : undefined,
      formatPruningMetric("parts", index.parts),
      formatPruningMetric("granules", index.granules),
      index.search_algorithm ? `algorithm ${index.search_algorithm}` : undefined,
    ].filter(Boolean);

    const label = index.index_name ? `${index.name} (${index.index_name})` : index.name;
    return `${label}: ${segments.join("; ")}`;
  });

  if (table) {
    summary.unshift(`Read from ${table}`);
  }

  return {
    table,
    indexes,
    summary: summary.length > 0 ? summary : ["No index pruning details were returned."],
    raw_text: mode === "full" ? explainText : undefined,
  };
}

function normalizePipelineOperator(line: string): string {
  return line
    .trim()
    .replace(/\s+[x×]\s+\d+.*$/i, "")
    .replace(/\s+\d+\s+→\s+\d+.*$/u, "")
    .trim();
}

export function shouldCollectExplainPipeline(sql: string, mode: CollectMode): boolean {
  if (mode === "full") {
    return true;
  }

  return /\b(JOIN|GROUP\s+BY|ORDER\s+BY|DISTINCT|UNION|FINAL|OVER)\b/i.test(sql);
}

export function parseExplainPipelineText(
  explainText: string,
  mode: CollectMode = "light"
): ExplainPipelineEvidence {
  const lines = explainText
    .split("\n")
    .map((line) => line.replace(/\r$/, "").trim())
    .filter(Boolean);

  let maxParallelism = 0;
  const operators = Array.from(
    new Set(
      lines
        .map(normalizePipelineOperator)
        .filter((line) => line.length > 0 && !line.startsWith("("))
    )
  );

  for (const line of lines) {
    for (const match of line.matchAll(/[x×]\s*(\d+)/gi)) {
      maxParallelism = Math.max(maxParallelism, Number(match[1]));
    }
  }

  const summary: string[] = [];
  if (maxParallelism > 0) {
    summary.push(`Pipeline fan-out reaches ${maxParallelism} parallel streams.`);
  }
  if (operators.some((operator) => operator.includes("MergeTreeSelect"))) {
    summary.push("Reads originate from MergeTree scan processors.");
  }
  if (operators.some((operator) => /MergingSorted|MergeSorting|PartialSorting/i.test(operator))) {
    summary.push("Sorting stages are present in the execution pipeline.");
  }
  if (operators.some((operator) => /Aggregating|Aggregated/i.test(operator))) {
    summary.push("Aggregation stages are present in the execution pipeline.");
  }
  if (operators.some((operator) => /Join/i.test(operator))) {
    summary.push("Join stages are present in the execution pipeline.");
  }

  return {
    max_parallelism: maxParallelism > 0 ? maxParallelism : undefined,
    operators,
    summary: summary.length > 0 ? summary : ["Pipeline shape was collected for reference."],
    raw_text: mode === "full" ? explainText : undefined,
  };
}

/**
 * Build time filter SQL clause for query_log lookups
 */
function buildQueryLogTimeFilter(
  time_window?: number,
  time_range?: { from: string; to: string }
): string {
  if (time_range?.from && time_range?.to) {
    return `AND event_date >= toDate('${time_range.from}') AND event_date <= toDate('${time_range.to}') AND event_time >= toDateTime('${time_range.from}') AND event_time <= toDateTime('${time_range.to}')`;
  }

  if (time_window) {
    return `AND event_date >= toDate(now() - INTERVAL ${time_window} MINUTE) AND event_time >= now() - INTERVAL ${time_window} MINUTE`;
  }

  return "";
}

/**
 * Step 1: Collect query log from system.query_log
 * Also retrieves SQL text if not provided in input
 */
async function collectQueryLog(
  queryId: string,
  context: EvidenceContext,
  connection: Connection,
  progressCallback?: ToolProgressCallback,
  mode: CollectMode = "light",
  time_window?: number,
  time_range?: { from: string; to: string }
): Promise<{ score: number; sql?: string }> {
  const stageId = "collect query log";
  progressCallback?.(stageId, 10, "started");
  try {
    const isCluster = connection.cluster!.length > 0;
    const timeFilter = buildQueryLogTimeFilter(time_window, time_range);
    const { response } = connection.query(
      `
SELECT
  query_duration_ms,
  read_rows,
  read_bytes,
  memory_usage,
  result_rows,
  exception,
  ProfileEvents,
  query,
  tables
FROM ${isCluster ? `clusterAllReplicas("${connection.cluster}", system.query_log)` : "system.query_log"}
WHERE
query_id = '${escapeSqlString(queryId)}'
${timeFilter}
ORDER BY event_time DESC
LIMIT 1
SETTINGS max_execution_time = 0
`,
      { default_format: "JSONCompact" }
    );
    const apiResponse = await response;
    const responseData = apiResponse.data.json() as JsonCompactResponse;

    if (responseData?.data && Array.isArray(responseData.data) && responseData.data.length > 0) {
      const row = responseData.data[0] as unknown[];

      let profileEvents: Record<string, number> | undefined;
      const profileEventsRaw = row[6];
      if (profileEventsRaw != null) {
        if (typeof profileEventsRaw === "object" && !Array.isArray(profileEventsRaw)) {
          profileEvents = {};
          for (const [key, value] of Object.entries(profileEventsRaw)) {
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              profileEvents[key] = numValue;
            }
          }
        } else if (Array.isArray(profileEventsRaw)) {
          profileEvents = {};
          for (const pair of profileEventsRaw) {
            if (Array.isArray(pair) && pair.length >= 2) {
              const key = String(pair[0]);
              const numValue = Number(pair[1]);
              if (!isNaN(numValue)) {
                profileEvents[key] = numValue;
              }
            }
          }
        }
      }

      let sqlFromLog = row[7] ? String(row[7]) : undefined;
      const tables = row[8] as string[] | undefined;

      if (sqlFromLog && tables && tables.length > 0) {
        sqlFromLog = SqlUtils.qualifyTableNames(sqlFromLog, tables);
      }

      context.query_log = {
        duration_ms: Number(row[0]) || undefined,
        read_rows: Number(row[1]) || undefined,
        read_bytes: Number(row[2]) || undefined,
        memory_usage: Number(row[3]) || undefined,
        result_rows: Number(row[4]) || undefined,
        exception: row[5] ? String(row[5]) : null,
        resource_summary: buildQueryLogResourceSummary(profileEvents),
        profile_events: mode === "full" ? profileEvents : undefined,
      };
      context.symptoms = {
        latency_ms: context.query_log.duration_ms,
        read_rows: context.query_log.read_rows,
        read_bytes: context.query_log.read_bytes,
        peak_memory_bytes: context.query_log.memory_usage,
        spilled: shouldFlagSpill(profileEvents),
        errors: context.query_log.exception,
      };
      progressCallback?.(stageId, 10, "success");
      return { score: 3, sql: sqlFromLog };
    }

    progressCallback?.(stageId, 10, "failed", "query_log: not found");
    return { score: 0 };
  } catch (error) {
    console.error("Error fetching query log:", error);
    progressCallback?.("Collecting query log...", 10, "failed", getErrorMessage(error));
    return { score: 0 };
  }
}

/**
 * Step 2a: Run EXPLAIN PLAN (index usage)
 */
async function collectExplainIndex(
  sql: string,
  context: EvidenceContext,
  connection: Connection,
  progressCallback?: ToolProgressCallback,
  mode: CollectMode = "light"
): Promise<number> {
  const stageId = "explain indexes";
  progressCallback?.(stageId, 30, "started");
  try {
    const { response: planResponse } = connection.query(`EXPLAIN PLAN indexes=1 ${sql}`, {
      default_format: "TabSeparatedRaw",
    });
    const planApiResponse = await planResponse;
    context.explain_index = parseExplainIndexText(planApiResponse.data.text(), mode);
    progressCallback?.(stageId, 30, "success");
    return 2;
  } catch (error) {
    console.error("Error running EXPLAIN PLAN:", error);
    progressCallback?.(stageId, 30, "failed", getErrorMessage(error));
    return 0;
  }
}

/**
 * Step 2b: Run EXPLAIN PIPELINE (execution pipeline)
 */
async function collectExplainPipeline(
  sql: string,
  context: EvidenceContext,
  connection: Connection,
  progressCallback?: ToolProgressCallback,
  mode: CollectMode = "light"
): Promise<number> {
  const stageId = "explain pipeline";
  progressCallback?.(stageId, 40, "started");
  try {
    const { response: pipelineResponse } = connection.query(`EXPLAIN PIPELINE ${sql}`, {
      default_format: "TabSeparatedRaw",
    });
    const pipelineApiResponse = await pipelineResponse;
    context.explain_pipeline = parseExplainPipelineText(pipelineApiResponse.data.text(), mode);
    progressCallback?.(stageId, 40, "success");
    return 2;
  } catch (error) {
    console.error("Error running EXPLAIN PIPELINE:", error);
    progressCallback?.(stageId, 40, "failed", getErrorMessage(error));
    return 0;
  }
}

/**
 * Step 3: Parse table names and referenced columns from SQL using EXPLAIN AST
 */
async function parseTableNames(
  sql: string,
  connection: Connection,
  progressCallback?: ToolProgressCallback
): Promise<{ tableNames: TableName[]; referencedColumns: Set<string> }> {
  const stageId = "analyze table names";
  progressCallback?.(stageId, 50, "started");
  const tableNames: TableName[] = [];
  const referencedColumns = new Set<string>();

  try {
    const { response: astResponse } = connection.query(`EXPLAIN AST ${sql}`, {
      default_format: "TabSeparatedRaw",
    });
    const astApiResponse = await astResponse;
    const astText = astApiResponse.data.text();

    const tableIdRegex = /TableIdentifier\s+(\S+)/g;
    const seenTables = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = tableIdRegex.exec(astText)) !== null) {
      const fullName = match[1]!;
      const dotIndex = fullName.indexOf(".");
      const database = dotIndex > 0 ? fullName.slice(0, dotIndex) : "default";
      const table = dotIndex > 0 ? fullName.slice(dotIndex + 1) : fullName;
      const key = buildTableKey(database, table);
      if (!seenTables.has(key)) {
        seenTables.add(key);
        tableNames.push({ database, table });
      }
    }

    const columnIdRegex = /Identifier\s+(\S+)/g;
    while ((match = columnIdRegex.exec(astText)) !== null) {
      const columnName = match[1]!;
      if (columnName) {
        referencedColumns.add(columnName);
      }
    }

    progressCallback?.(stageId, 50, "success");
  } catch (error) {
    console.error("Error running EXPLAIN AST for table discovery:", error);
    progressCallback?.(stageId, 50, "failed", getErrorMessage(error));
  }

  return { tableNames, referencedColumns };
}

/**
 * Build WHERE clause for batched table queries
 */
function buildTableWhereClause(tableNames: TableName[]): string {
  const tablesByDatabase = new Map<string, string[]>();
  for (const { database, table } of tableNames) {
    if (!tablesByDatabase.has(database)) {
      tablesByDatabase.set(database, []);
    }
    tablesByDatabase.get(database)!.push(table);
  }

  const conditions: string[] = [];
  for (const [database, tables] of tablesByDatabase.entries()) {
    const tableList = tables.map((table) => `'${escapeSqlString(table)}'`).join(", ");
    conditions.push(`(database = '${escapeSqlString(database)}' AND table IN (${tableList}))`);
  }

  return conditions.join(" OR ");
}

/**
 * Fetch table metadata (engine, keys) from system.tables
 */
async function fetchTableMetadata(
  whereClause: string,
  connection: Connection,
  progressCallback?: ToolProgressCallback
): Promise<Map<string, TableMetadata>> {
  const stageId = "fetch table metadata";
  progressCallback?.(stageId, 60, "started");

  const metaByTable = new Map<string, TableMetadata>();

  try {
    const { response: tableInfoResponse } = connection.query(
      `
SELECT database, table, engine, partition_key, primary_key, sorting_key, create_table_query
FROM system.tables
WHERE ${whereClause}`,
      {
        default_format: "JSONCompact",
      }
    );
    const tableInfoApiResponse = await tableInfoResponse;
    const tableInfoData = tableInfoApiResponse.data.json() as JsonCompactResponse;

    if (tableInfoData?.data && Array.isArray(tableInfoData.data)) {
      for (const row of tableInfoData.data) {
        const rowArray = row as unknown[];
        const database = String(rowArray[0] || "");
        const table = String(rowArray[1] || "");
        const engine = String(rowArray[2] || "Unknown");
        const partitionKey = rowArray[3] != null ? String(rowArray[3]) : null;
        const primaryKey = rowArray[4] != null ? String(rowArray[4]) : null;
        const sortingKey = rowArray[5] != null ? String(rowArray[5]) : null;
        const createTableQuery = rowArray[6] != null ? String(rowArray[6]) : null;
        metaByTable.set(buildTableKey(database, table), {
          engine,
          partition_key: partitionKey,
          primary_key: primaryKey,
          sorting_key: sortingKey,
          create_table_query: createTableQuery,
        });
      }
    }
    progressCallback?.(stageId, 60, "success");
  } catch (error) {
    console.error("Error fetching table metadata from system.tables:", error);
    progressCallback?.(stageId, 60, "failed", getErrorMessage(error));
  }

  return metaByTable;
}

/**
 * Fetch columns from system.columns
 * @param referencedColumns - Optional set of column names to filter by (only fetch these columns)
 */
async function fetchTableColumns(
  whereClause: string,
  connection: Connection,
  progressCallback?: ToolProgressCallback,
  referencedColumns?: Set<string>
): Promise<Map<string, Array<[string, string]>>> {
  const stageId = "fetch table columns";
  progressCallback?.(stageId, 65, "started");
  const columnsByTable = new Map<string, Array<[string, string]>>();

  try {
    let columnNameFilter = "";
    if (referencedColumns && referencedColumns.size > 0) {
      const columnList = Array.from(referencedColumns)
        .map((column) => `'${escapeSqlString(column)}'`)
        .join(", ");
      columnNameFilter = ` AND name IN (${columnList})`;
    }

    const { response: columnsResponse } = connection.query(
      `
SELECT database, table, name, type
FROM system.columns
WHERE ${whereClause}${columnNameFilter}
ORDER BY database, table, position`,
      {
        default_format: "JSONCompact",
      }
    );
    const columnsApiResponse = await columnsResponse;
    const columnsData = columnsApiResponse.data.json() as JsonCompactResponse;

    if (columnsData?.data && Array.isArray(columnsData.data)) {
      for (const row of columnsData.data) {
        const rowArray = row as unknown[];
        const database = String(rowArray[0] || "");
        const table = String(rowArray[1] || "");
        const name = String(rowArray[2] || "");
        const type = String(rowArray[3] || "");
        const key = buildTableKey(database, table);
        if (!columnsByTable.has(key)) {
          columnsByTable.set(key, []);
        }
        columnsByTable.get(key)!.push([name, type]);
      }
    }

    progressCallback?.(stageId, 65, "success");
  } catch (error) {
    console.error("Error fetching columns from system.columns:", error);
    progressCallback?.(stageId, 65, "failed", getErrorMessage(error));
  }

  return columnsByTable;
}

/**
 * Fetch stats from system.parts
 */
async function fetchTableStats(
  whereClause: string,
  connection: Connection,
  progressCallback?: ToolProgressCallback
): Promise<Map<string, TableStats>> {
  const statsByTable = new Map<string, TableStats>();
  const stageId = "fetch table stats";
  progressCallback?.(stageId, 70, "started");
  try {
    const { response } = connection.query(
      `
SELECT
  database,
  table,
  sum(rows) as total_rows,
  sum(bytes_on_disk) as total_bytes,
  count() as parts,
  uniqExact(partition) as partitions
FROM system.parts
WHERE active = 1 AND (${whereClause})
GROUP BY database, table`,
      {
        default_format: "JSONCompact",
      }
    );
    const statsData = (await response).data.json() as JsonCompactResponse;

    if (statsData?.data && Array.isArray(statsData.data)) {
      for (const row of statsData.data) {
        const rowArray = row as unknown[];
        const database = String(rowArray[0] || "");
        const table = String(rowArray[1] || "");
        const rows = Number(rowArray[2]) || 0;
        const bytes = Number(rowArray[3]) || 0;
        const parts = Number(rowArray[4]) || 0;
        const partitions = Number(rowArray[5]) || 0;
        statsByTable.set(buildTableKey(database, table), {
          rows,
          bytes,
          parts,
          partitions,
        });
      }
    }

    progressCallback?.(stageId, 70, "success");
  } catch (error) {
    console.error("Error fetching stats from system.parts:", error);
    progressCallback?.(stageId, 70, "failed", getErrorMessage(error));
  }

  return statsByTable;
}

/**
 * Step 4: Fetch table DDL and stats (batched)
 * @param referencedColumns - Optional set of column names to limit column fetching
 */
async function collectTableSchemas(
  tableNames: TableName[],
  context: EvidenceContext,
  connection: Connection,
  progressCallback?: ToolProgressCallback,
  referencedColumns?: Set<string>
): Promise<number> {
  const requestedTables = dedupeTableNames(tableNames);
  if (requestedTables.length === 0) {
    return 0;
  }

  context.table_schema = {};
  context.table_stats = {};

  const initialWhereClause = buildTableWhereClause(requestedTables);
  const metaByTable = await fetchTableMetadata(initialWhereClause, connection, progressCallback);
  const optimizationTargets = new Map<string, DistributedTableTarget>();

  const additionalTables = dedupeTableNames(
    requestedTables.flatMap(({ database, table }) => {
      const meta = metaByTable.get(buildTableKey(database, table));
      if (meta?.engine !== "Distributed") {
        return [];
      }

      const target = parseDistributedTableTarget(meta.create_table_query);
      if (!target) {
        return [];
      }

      optimizationTargets.set(buildTableKey(database, table), target);
      return [{ database: target.database, table: target.table }];
    })
  );

  if (additionalTables.length > 0) {
    const targetMeta = await fetchTableMetadata(
      buildTableWhereClause(additionalTables),
      connection,
      progressCallback
    );
    for (const [key, value] of targetMeta.entries()) {
      metaByTable.set(key, value);
    }
  }

  const allTables = dedupeTableNames([...requestedTables, ...additionalTables]);
  const whereClause = buildTableWhereClause(allTables);
  const [columnsByTable, statsByTable] = await Promise.all([
    fetchTableColumns(whereClause, connection, progressCallback, referencedColumns),
    fetchTableStats(whereClause, connection, progressCallback),
  ]);

  let score = 0;
  context.tables = requestedTables.map(({ database, table }) => ({
    database,
    table,
    engine: metaByTable.get(buildTableKey(database, table))?.engine ?? "Unknown",
  }));

  for (const { database, table } of requestedTables) {
    const key = buildTableKey(database, table);
    const tableId = `\`${database}\`.\`${table}\``;

    const meta = metaByTable.get(key);
    const engine = meta?.engine ?? "Unknown";
    const partitionKey = meta?.partition_key ?? null;
    const primaryKey = meta?.primary_key ?? null;
    const sortingKey = meta?.sorting_key ?? null;
    const secondaryIndexes = extractSecondaryIndexes(meta?.create_table_query ?? null);
    const columns = columnsByTable.get(key) ?? [];
    const stats = statsByTable.get(key);

    context.table_schema[tableId] = {
      columns,
      engine,
      partition_key: partitionKey,
      primary_key: primaryKey,
      sorting_key: sortingKey,
      secondary_indexes: secondaryIndexes,
    };

    const optimizationTarget = optimizationTargets.get(key);
    if (optimizationTarget) {
      const targetKey = buildTableKey(optimizationTarget.database, optimizationTarget.table);
      const targetMeta = metaByTable.get(targetKey);
      const targetStats = statsByTable.get(targetKey);

      context.table_schema[tableId].optimization_target = {
        database: optimizationTarget.database,
        table: optimizationTarget.table,
        cluster: optimizationTarget.cluster,
        columns: columnsByTable.get(targetKey) ?? [],
        engine: targetMeta?.engine ?? "Unknown",
        partition_key: targetMeta?.partition_key ?? null,
        primary_key: targetMeta?.primary_key ?? null,
        sorting_key: targetMeta?.sorting_key ?? null,
        secondary_indexes: extractSecondaryIndexes(targetMeta?.create_table_query ?? null),
        stats: toStatsEvidence(targetStats),
      };
    }

    if (stats) {
      context.table_stats[tableId] = toStatsEvidence(stats)!;
    }

    if (columns.length > 0 || stats || context.table_schema[tableId].optimization_target != null) {
      score += 1;
    }
  }

  return score;
}

/**
 * Step 5: Fetch relevant settings (if mode is "full")
 */
async function collectSettings(
  context: EvidenceContext,
  connection: Connection,
  progressCallback?: ToolProgressCallback
): Promise<number> {
  const stageId = "fetch settings";
  progressCallback?.(stageId, 80, "started");
  try {
    const settingsSql = `
SELECT name, value
FROM system.settings
WHERE name IN ('max_threads', 'max_memory_usage', 'max_bytes_before_external_group_by', 'max_bytes_before_external_sort')
`;

    const { response: settingsResponse } = connection.query(settingsSql, {
      default_format: "JSONCompact",
    });
    const settingsApiResponse = await settingsResponse;
    const settingsData = settingsApiResponse.data.json() as JsonCompactResponse;

    if (settingsData?.data && Array.isArray(settingsData.data)) {
      context.settings = {};
      for (const row of settingsData.data) {
        const rowArray = row as unknown[];
        const name = String(rowArray[0] || "");
        const value = String(rowArray[1] || "");
        const numValue = Number(value);
        context.settings[name] = isNaN(numValue) ? value : numValue;
      }
      progressCallback?.(stageId, 80, "success");
      return 1;
    }
  } catch (error) {
    console.error("Error fetching settings:", error);
    progressCallback?.(stageId, 80, "failed", getErrorMessage(error));
  }

  return 0;
}

/**
 * Main executor function
 */
export const collectSqlOptimizationEvidenceExecutor: ToolExecutor<
  CollectSqlOptimizationEvidenceInput,
  EvidenceContext
> = async (input, connection, progressCallback) => {
  const { sql: inputSql, query_id, goal, mode = "light", time_window, time_range } = input;
  const context: EvidenceContext = {
    goal: goal || "latency",
  };

  let sql = inputSql;

  if (sql) {
    context.sql = sql;
  }
  if (query_id) {
    context.query_id = query_id;
  }

  try {
    if (query_id) {
      const queryLogResult = await collectQueryLog(
        query_id,
        context,
        connection,
        progressCallback,
        mode,
        time_window,
        time_range
      );

      if (!sql && queryLogResult.sql) {
        sql = queryLogResult.sql;
        context.sql = sql;
      }
    }

    const parallelTasks: Promise<number>[] = [];

    if (sql) {
      parallelTasks.push(collectExplainIndex(sql, context, connection, progressCallback, mode));
      if (shouldCollectExplainPipeline(sql, mode)) {
        parallelTasks.push(
          collectExplainPipeline(sql, context, connection, progressCallback, mode)
        );
      } else {
        progressCallback?.(
          "explain pipeline",
          40,
          "skipped",
          "Only collected in full mode or for complex query shapes"
        );
      }
    }

    if (mode === "full") {
      parallelTasks.push(collectSettings(context, connection, progressCallback));
    } else {
      progressCallback?.("fetch settings", 80, "skipped", "Only collected in full mode");
    }

    await Promise.all(parallelTasks);

    if (sql) {
      const { tableNames, referencedColumns } = await parseTableNames(
        sql,
        connection,
        progressCallback
      );
      if (tableNames.length > 0) {
        await collectTableSchemas(
          tableNames,
          context,
          connection,
          progressCallback,
          referencedColumns.size > 0 ? referencedColumns : undefined
        );
      }
    }

    return context;
  } catch (error) {
    console.error("Error in collect_sql_optimization_evidence:", error);
    progressCallback?.("Error", 0, "failed", getErrorMessage(error));
    return context;
  }
};

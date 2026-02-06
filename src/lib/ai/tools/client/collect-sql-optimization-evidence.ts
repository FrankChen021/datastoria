import { QueryError, type Connection } from "@/lib/connection/connection";
import { SqlUtils } from "@/lib/sql-utils";
import { escapeSqlString, type ToolExecutor, type ToolProgressCallback } from "./client-tool-types";

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
    {
      columns: Array<[string, string]>;
      engine?: string;
      partition_key?: string | null;
      primary_key?: string | null;
      sorting_key?: string | null;
      secondary_indexes?: string[];
    }
  >;
  table_stats?: Record<
    string,
    {
      rows?: number;
      bytes?: number;
      parts?: number;
      partitions?: number;
    }
  >;
  explain_index?: string;
  explain_pipeline?: string;
  query_log?: {
    duration_ms?: number;
    read_rows?: number;
    read_bytes?: number;
    memory_usage?: number;
    result_rows?: number;
    exception?: string | null;
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

type CollectSqlOptimizationEvidenceInput = {
  sql?: string;
  query_id?: string;
  goal?: "latency" | "memory" | "bytes" | "dashboard" | "other";
  mode?: "light" | "full";
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

  // Match INDEX definitions in CREATE TABLE query
  // Pattern: INDEX name expression TYPE type[(params)] [GRANULARITY n]
  // The expression can be a column name, function call, or tuple like (col1, col2)
  const indexRegex = /INDEX \w+ .+? TYPE .+? GRANULARITY \d+/gi;

  const indexes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = indexRegex.exec(createTableQuery)) !== null) {
    indexes.push(match[0]);
  }

  return indexes;
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
  time_window?: number,
  time_range?: { from: string; to: string }
): Promise<{ score: number; sql?: string }> {
  const stageId = "collect query log";
  progressCallback?.(stageId, 10, "started");
  try {
    const isCluster = connection.cluster!.length > 0;
    // Build time filter clause for faster query_log lookups
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

      // Parse ProfileEvents (Map type from ClickHouse)
      let profileEvents: Record<string, number> | undefined;
      const profileEventsRaw = row[6];
      if (profileEventsRaw != null) {
        if (typeof profileEventsRaw === "object" && !Array.isArray(profileEventsRaw)) {
          // If it's already an object, convert values to numbers
          profileEvents = {};
          for (const [key, value] of Object.entries(profileEventsRaw)) {
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              profileEvents[key] = numValue;
            }
          }
        } else if (Array.isArray(profileEventsRaw)) {
          // If it's an array of [key, value] pairs
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

      // Extract SQL text from query_log (row[7]) and tables array (row[8])
      let sqlFromLog = row[7] ? String(row[7]) : undefined;
      const tables = row[8] as string[] | undefined;

      // Qualify table names in SQL if tables array is available
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
        profile_events: profileEvents,
      };
      context.symptoms = {
        latency_ms: context.query_log.duration_ms,
        read_rows: context.query_log.read_rows,
        read_bytes: context.query_log.read_bytes,
        peak_memory_bytes: context.query_log.memory_usage,
        errors: context.query_log.exception,
      };
      progressCallback?.(stageId, 10, "success");
      return { score: 3, sql: sqlFromLog }; // Return SQL for further analysis
    } else {
      progressCallback?.(stageId, 10, "failed", "query_log: not found");
      return { score: 0 };
    }
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
  progressCallback?: ToolProgressCallback
): Promise<number> {
  const stageId = "explain indexes";
  progressCallback?.(stageId, 30, "started");
  try {
    const { response: planResponse } = connection.query(`EXPLAIN PLAN indexes=1 ${sql}`, {
      default_format: "TabSeparatedRaw",
    });
    const planApiResponse = await planResponse;
    context.explain_index = planApiResponse.data.text();
    progressCallback?.(stageId, 30, "success");
    return 2; // Evidence score contribution
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
  progressCallback?: ToolProgressCallback
): Promise<number> {
  const stageId = "explain pipeline";
  progressCallback?.(stageId, 40, "started");
  try {
    const { response: pipelineResponse } = connection.query(`EXPLAIN PIPELINE ${sql}`, {
      default_format: "TabSeparatedRaw",
    });
    const pipelineApiResponse = await pipelineResponse;
    context.explain_pipeline = pipelineApiResponse.data.text();
    progressCallback?.(stageId, 40, "success");
    return 2; // Evidence score contribution
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

    // Example lines:
    // - TableIdentifier system.databases (qualified)
    // - TableIdentifier mytable (unqualified)
    // - TableIdentifier log.1995-log
    // the identifier is complicated, just capture all characters after the keyword
    const tableIdRegex = /TableIdentifier\s+(\S+)/g;
    const seenTables = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = tableIdRegex.exec(astText)) !== null) {
      const fullName = match[1]!;
      const dotIndex = fullName.indexOf(".");
      const database = dotIndex > 0 ? fullName.slice(0, dotIndex) : "default";
      const table = dotIndex > 0 ? fullName.slice(dotIndex + 1) : fullName;
      const key = `${database}.${table}`;
      if (!seenTables.has(key)) {
        seenTables.add(key);
        tableNames.push({ database, table });
      }
    }

    // Extract column identifiers (leading with 'Identifier ')
    // Example: "Identifier user_id", "Identifier created_at"
    // The SQL query to system.columns will naturally filter out non-existent columns
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
  // Group tables by database for efficient WHERE clauses
  const tablesByDatabase = new Map<string, string[]>();
  for (const { database, table } of tableNames) {
    if (!tablesByDatabase.has(database)) {
      tablesByDatabase.set(database, []);
    }
    tablesByDatabase.get(database)!.push(table);
  }

  // Build WHERE conditions like:
  // (database = 'db1' AND table IN ('t1','t2')) OR (database = 'db2' AND table IN ('t3'))
  const conditions: string[] = [];
  for (const [database, tables] of tablesByDatabase.entries()) {
    const tableList = tables.map((t) => `'${escapeSqlString(t)}'`).join(", ");
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
        const key = `${database}.${table}`;
        metaByTable.set(key, {
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
    // Build column name filter if referenced columns are provided
    let columnNameFilter = "";
    if (referencedColumns && referencedColumns.size > 0) {
      const columnList = Array.from(referencedColumns)
        .map((col) => `'${escapeSqlString(col)}'`)
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
        const key = `${database}.${table}`;
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
        const tableId = `${database}.${table}`;
        statsByTable.set(tableId, {
          rows: rows,
          bytes: bytes,
          parts: parts,
          partitions: partitions,
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
  if (tableNames.length === 0) {
    return 0;
  }
  context.table_schema = {};
  context.table_stats = {};

  const whereClause = buildTableWhereClause(tableNames);

  // Fetch all table data in parallel
  const [metaByTable, columnsByTable, statsByTable] = await Promise.all([
    fetchTableMetadata(whereClause, connection, progressCallback),
    fetchTableColumns(whereClause, connection, progressCallback, referencedColumns),
    fetchTableStats(whereClause, connection, progressCallback),
  ]);

  // Assemble table metadata, DDL, and stats into context
  let score = 0;
  for (const { database, table } of tableNames) {
    const key = `${database}.${table}`;
    const tableId = `\`${database}\`.\`${table}\``;

    const meta = metaByTable.get(key);
    const engine = meta?.engine ?? "Unknown";
    const partitionKey = meta?.partition_key ?? null;
    const primaryKey = meta?.primary_key ?? null;
    const sortingKey = meta?.sorting_key ?? null;
    const secondaryIndexes = extractSecondaryIndexes(meta?.create_table_query ?? null);

    const columns = columnsByTable.get(key) ?? [];
    const stats = statsByTable.get(key);

    // DDL-like structured info
    context.table_schema![tableId] = {
      columns,
      engine,
      partition_key: partitionKey,
      primary_key: primaryKey,
      sorting_key: sortingKey,
      secondary_indexes: secondaryIndexes,
    };

    // Stats, if available
    if (stats) {
      context.table_stats![tableId] = {
        rows: stats.rows,
        bytes: stats.bytes,
        parts: stats.parts,
        partitions: stats.partitions,
      };
    }

    // Increase evidence score if we have at least columns or stats
    if (columns.length > 0 || stats) {
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
        // Try to parse as number, fallback to string
        const numValue = Number(value);
        context.settings[name] = isNaN(numValue) ? value : numValue;
      }
      progressCallback?.(stageId, 80, "success");
      return 1; // Evidence score contribution
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
  const { sql: inputSql, query_id, goal, mode: _mode = "light", time_window, time_range } = input;
  const context: EvidenceContext = {
    goal: goal || "latency",
  };

  // Track SQL - may come from input or be retrieved from query_log
  let sql = inputSql;

  if (sql) {
    context.sql = sql;
  }
  if (query_id) {
    context.query_id = query_id;
  }

  try {
    // Step 1: Collect query log if query_id is provided
    // This also retrieves SQL text if not provided in input
    if (query_id) {
      const queryLogResult = await collectQueryLog(
        query_id,
        context,
        connection,
        progressCallback,
        time_window,
        time_range
      );

      // If SQL was not provided but found in query_log, use it for further analysis
      if (!sql && queryLogResult.sql) {
        sql = queryLogResult.sql;
        context.sql = sql;
      }
    }

    // Collect remaining evidence in parallel
    const parallelTasks: Promise<number>[] = [];

    // Step 2: Run EXPLAIN if SQL is available (from input or query_log)
    if (sql) {
      parallelTasks.push(collectExplainIndex(sql, context, connection, progressCallback));
      parallelTasks.push(collectExplainPipeline(sql, context, connection, progressCallback));
    }

    parallelTasks.push(collectSettings(context, connection, progressCallback));

    // Wait for all parallel tasks to complete
    await Promise.all(parallelTasks);

    // Step 3: Parse table names and referenced columns from SQL using EXPLAIN AST
    // Step 4: Fetch table DDL and stats
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
    // Signal error - progressCallback will handle setting status to "error"
    progressCallback?.("Error", 0, "failed", getErrorMessage(error));
    return context;
  }
};

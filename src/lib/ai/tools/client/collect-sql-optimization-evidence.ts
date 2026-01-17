import type { Connection } from "@/lib/connection/connection";
import type { EvidenceContext } from "../../common-types";
import { escapeSqlString, type ToolExecutor, type ToolProgressCallback } from "./client-tool-types";

type CollectSqlOptimizationEvidenceInput = {
  sql?: string;
  query_id?: string;
  goal?: "latency" | "memory" | "bytes" | "dashboard" | "other";
  mode?: "light" | "full";
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
};

type TableStats = {
  rows: number;
  bytes: number;
  parts: number;
  partitions: number;
};

/**
 * Step 1: Collect query log from system.query_log
 */
async function collectQueryLog(
  queryId: string,
  context: EvidenceContext,
  connection: Connection,
  progressCallback?: ToolProgressCallback
): Promise<number> {
  const stageId = "collect query log";
  progressCallback?.(stageId, 10, "started");
  try {
    const isCluster = connection.cluster!.length > 0;
    const { response } = connection.query(
      `
SELECT
  query_duration_ms,
  read_rows,
  read_bytes,
  memory_usage,
  result_rows,
  exception,
  ProfileEvents
FROM ${isCluster ? `clusterAllReplicas("${connection.cluster}", system.query_log)` : "system.query_log"}
WHERE 
query_id = '${escapeSqlString(queryId)}'
ORDER BY event_time DESC
LIMIT 1`,
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
      return 3; // Evidence score contribution
    } else {
      progressCallback?.(stageId, 10, "failed", "query_log: not found");
      return 0;
    }
  } catch (error) {
    console.error("Error fetching query log:", error);
    progressCallback?.(
      "Collecting query log...",
      10,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
    return 0;
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
    progressCallback?.(
      stageId,
      30,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
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
    progressCallback?.(
      stageId,
      40,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
    return 0;
  }
}

/**
 * Step 3: Parse table names from SQL using EXPLAIN AST
 */
async function parseTableNames(
  sql: string,
  connection: Connection,
  progressCallback?: ToolProgressCallback
): Promise<TableName[]> {
  const stageId = "analyze table names";
  progressCallback?.(stageId, 50, "started");
  const tableNames: TableName[] = [];

  try {
    const { response: astResponse } = connection.query(`EXPLAIN AST ${sql}`, {
      default_format: "TabSeparatedRaw",
    });
    const astApiResponse = await astResponse;
    const astText = astApiResponse.data.text();

    // Example lines:
    // - TableIdentifier system.databases (qualified)
    // - TableIdentifier mytable (unqualified)
    // Match both patterns: database.table or just table
    const tableIdRegex = /TableIdentifier\s+(([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)/g;
    const seen = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = tableIdRegex.exec(astText)) !== null) {
      const database = match[2] || "default"; // Use "default" if no database prefix
      const table = match[3]!;
      const key = `${database}.${table}`;
      if (!seen.has(key)) {
        seen.add(key);
        tableNames.push({ database, table });
      }
    }

    progressCallback?.(stageId, 50, "success");
  } catch (error) {
    console.error("Error running EXPLAIN AST for table discovery:", error);
    progressCallback?.(
      stageId,
      50,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  return tableNames;
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
SELECT database, table, engine, partition_key, primary_key, sorting_key
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
        const key = `${database}.${table}`;
        metaByTable.set(key, {
          engine,
          partition_key: partitionKey,
          primary_key: primaryKey,
          sorting_key: sortingKey,
        });
      }
    }
    progressCallback?.(stageId, 60, "success");
  } catch (error) {
    console.error("Error fetching table metadata from system.tables:", error);
    progressCallback?.(
      stageId,
      60,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  return metaByTable;
}

/**
 * Fetch columns from system.columns
 */
async function fetchTableColumns(
  whereClause: string,
  connection: Connection,
  progressCallback?: ToolProgressCallback
): Promise<Map<string, Array<[string, string]>>> {
  const stageId = "fetch table columns";
  progressCallback?.(stageId, 65, "started");
  const columnsByTable = new Map<string, Array<[string, string]>>();

  try {
    const { response: columnsResponse } = connection.query(
      `
SELECT database, table, name, type
FROM system.columns
WHERE ${whereClause}
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
    progressCallback?.(
      stageId,
      65,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
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
  sum(rows) as rows,
  sum(bytes_on_disk) as bytes,
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
    progressCallback?.(
      stageId,
      70,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  return statsByTable;
}

/**
 * Step 4: Fetch table DDL and stats (batched)
 */
async function collectTableSchemas(
  tableNames: TableName[],
  context: EvidenceContext,
  connection: Connection,
  progressCallback?: ToolProgressCallback
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
    fetchTableColumns(whereClause, connection, progressCallback),
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

    const columns = columnsByTable.get(key) ?? [];
    const stats = statsByTable.get(key);

    // DDL-like structured info
    context.table_schema![tableId] = {
      columns,
      engine,
      partition_key: partitionKey,
      primary_key: primaryKey,
      sorting_key: sortingKey,
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
    progressCallback?.(
      stageId,
      80,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
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
  const { sql, query_id, goal, mode: _mode = "light" } = input;
  const context: EvidenceContext = {
    goal: goal || "latency",
    evidence_score: 0,
  };

  if (sql) {
    context.sql = sql;
  }
  if (query_id) {
    context.query_id = query_id;
  }

  let evidenceScore = 0;
  const maxScore = 10;

  try {
    // Collect all independent evidence in parallel
    const parallelTasks: Promise<number>[] = [];

    // Step 1: Collect query log if query_id is provided
    if (query_id) {
      parallelTasks.push(collectQueryLog(query_id, context, connection, progressCallback));
    }

    // Step 2: Run EXPLAIN if SQL is provided
    if (sql) {
      parallelTasks.push(collectExplainIndex(sql, context, connection, progressCallback));
      parallelTasks.push(collectExplainPipeline(sql, context, connection, progressCallback));
    }

    parallelTasks.push(collectSettings(context, connection, progressCallback));

    // Wait for all parallel tasks to complete
    const parallelResults = await Promise.all(parallelTasks);
    evidenceScore += parallelResults.reduce((sum, score) => sum + score, 0);

    // Step 4: Fetch table DDL and stats (depends on Step 3)
    // Step 3: Parse table names from SQL using EXPLAIN AST
    if (sql) {
      const tableNames = await parseTableNames(sql, connection, progressCallback);
      if (tableNames.length > 0) {
        evidenceScore += await collectTableSchemas(
          tableNames,
          context,
          connection,
          progressCallback
        );
      }
    }

    // Calculate final evidence score (0-1)
    context.evidence_score = Math.min(evidenceScore / maxScore, 1);

    return context;
  } catch (error) {
    console.error("Error in collect_sql_optimization_evidence:", error);
    // Signal error - progressCallback will handle setting status to "error"
    progressCallback?.(
      "Error",
      0,
      "failed",
      error instanceof Error ? error.message : String(error)
    );
    context.evidence_score = 0;
    return context;
  }
};

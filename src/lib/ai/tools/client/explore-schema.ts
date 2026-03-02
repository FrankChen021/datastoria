import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import { escapeSqlString, type ToolExecutor } from "./client-tool-types";

const MAX_COLUMNS_WITHOUT_FILTER = 100;

export type TableSchemaInput = {
  /** Fully qualified 'database.table' name */
  table: string;
  columns?: string[];
};

function parseTableName(qualified: string): { database: string; table: string } {
  const dot = qualified.indexOf(".");
  if (dot <= 0 || dot === qualified.length - 1) {
    throw new Error(
      `Invalid explore_schema table '${qualified}'. Use fully qualified 'database.table' format.`
    );
  }
  return { database: qualified.slice(0, dot), table: qualified.slice(dot + 1) };
}

// NOTE: the input MUST be a JSON object instead of JSON array like the output
// This is a constraint from the LLM provider
export type ExploreSchemaInput = {
  tables: Array<TableSchemaInput>;
};

export type TableSchemaOutput = {
  database: string;
  table: string;
  columns: Array<{ name: string; type: string }>;
  primaryKey: string;
  partitionBy: string;
  engine: string;
  sortingKey: string;
  totalColumns: number;
  truncated: boolean;
  guidance?: string;
};
export type ExploreSchemaOutput = Array<TableSchemaOutput>;

export const exploreSchemaExecutor: ToolExecutor<ExploreSchemaInput, ExploreSchemaOutput> = async (
  input,
  connection
) => {
  const { tables } = input;

  const normalizedTables = new Map<
    string,
    { database: string; table: string; includeAllColumns: boolean; columns: Set<string> }
  >();

  for (const { table: qualified, columns } of tables) {
    const { database, table: tableName } = parseTableName(qualified);
    const key = `${database}.${tableName}`;
    const existing = normalizedTables.get(key);
    const hasRequestedColumns = Boolean(columns && columns.length > 0);

    if (!existing) {
      normalizedTables.set(key, {
        database,
        table: tableName,
        includeAllColumns: !hasRequestedColumns,
        columns: new Set(columns ?? []),
      });
      continue;
    }

    if (!hasRequestedColumns) {
      existing.includeAllColumns = true;
      existing.columns.clear();
      continue;
    }

    if (!existing.includeAllColumns) {
      for (const column of columns ?? []) {
        existing.columns.add(column);
      }
    }
  }

  //
  // Build SQL query to get columns for multiple tables
  // Handle per-table column filtering
  //
  const filteredColumnFilters: string[] = [];
  const unfilteredTableFilters: string[] = [];
  const requestedColumnMap = new Map<string, boolean>();

  for (const {
    database,
    table: tableName,
    includeAllColumns,
    columns,
  } of normalizedTables.values()) {
    const key = `${database}.${tableName}`;
    const hasRequestedColumns = !includeAllColumns;
    requestedColumnMap.set(key, hasRequestedColumns);

    if (hasRequestedColumns) {
      const columnList = Array.from(columns)
        .map((c) => `'${escapeSqlString(c)}'`)
        .join(", ");
      filteredColumnFilters.push(
        `(database = '${escapeSqlString(database)}' AND table = '${escapeSqlString(tableName)}' AND name IN (${columnList}))`
      );
    } else {
      unfilteredTableFilters.push(
        `(database = '${escapeSqlString(database)}' AND table = '${escapeSqlString(tableName)}')`
      );
    }
  }

  const columnsQueryParts: string[] = [];
  if (filteredColumnFilters.length > 0) {
    columnsQueryParts.push(`
SELECT
    database,
    table,
    name,
    type,
    CAST(count() OVER (PARTITION BY database, table) AS UInt32) AS total_columns
FROM system.columns
WHERE ${filteredColumnFilters.join(" OR ")}`);
  }

  if (unfilteredTableFilters.length > 0) {
    columnsQueryParts.push(`
SELECT
    database,
    table,
    name,
    type,
    total_columns
FROM
(
    SELECT
        database,
        table,
        name,
        type,
        row_number() OVER (PARTITION BY database, table ORDER BY position, name) AS row_num,
        CAST(count() OVER (PARTITION BY database, table) AS UInt32) AS total_columns
    FROM system.columns
    WHERE ${unfilteredTableFilters.join(" OR ")}
)
WHERE row_num <= ${MAX_COLUMNS_WITHOUT_FILTER}`);
  }

  const columnsSql = `${columnsQueryParts.join("\nUNION ALL\n")}
ORDER BY database, table, name`;

  // Build query for table metadata (engine, sorting_key, primary_key, partition_key)
  const tableFilters: string[] = [];
  for (const { database, table: tableName } of normalizedTables.values()) {
    tableFilters.push(
      `(database = '${escapeSqlString(database)}' AND name = '${escapeSqlString(tableName)}')`
    );
  }

  const tableMetaSql = `
SELECT 
    database, 
    name as table,
    engine,
    sorting_key,
    primary_key,
    partition_key
FROM system.tables
WHERE 
${tableFilters.join(" OR ")}`;

  try {
    // Execute both queries
    const [columnsResult, metaResult] = await Promise.all([
      connection.query(columnsSql, { default_format: "JSONCompact" }).response,
      connection.query(tableMetaSql, { default_format: "JSONCompact" }).response,
    ]);

    const columnsData = columnsResult.data.json<JSONCompactFormatResponse>();
    const metaData = metaResult.data.json<JSONCompactFormatResponse>();

    // Validate response structure
    if (!columnsData || !Array.isArray(columnsData.data)) {
      console.error("Unexpected response format from explore_schema (columns):", columnsData);
      return [];
    }

    if (!metaData || !Array.isArray(metaData.data)) {
      console.error("Unexpected response format from explore_schema (metadata):", metaData);
      return [];
    }

    // Build table metadata map
    const metaMap = new Map<
      string,
      {
        engine?: string;
        sorting_key?: string;
        primary_key?: string;
        partition_key?: string;
        create_table_query?: string;
      }
    >();
    for (const row of metaData.data) {
      const rowArray = row as unknown[];
      const database = String(rowArray[0] || "");
      const table = String(rowArray[1] || "");
      const engine = String(rowArray[2] || "");
      const sortingKey = String(rowArray[3] || "");
      const primaryKey = String(rowArray[4] || "");
      const partitionKey = String(rowArray[5] || "");
      const key = `${database}.${table}`;
      metaMap.set(key, {
        engine,
        sorting_key: sortingKey,
        primary_key: primaryKey,
        partition_key: partitionKey,
      });
    }

    // Group columns by database and table
    const schemaByTable = new Map<string, TableSchemaOutput>();

    for (const row of columnsData.data) {
      const rowArray = row as unknown[];
      const database = String(rowArray[0] || "");
      const table = String(rowArray[1] || "");
      const name = String(rowArray[2] || "");
      const type = String(rowArray[3] || "");
      const totalColumns = Number(rowArray[4] || 0);

      const key = `${database}.${table}`;

      if (!schemaByTable.has(key)) {
        const meta = metaMap.get(key);
        const hasRequestedColumns = requestedColumnMap.get(key) ?? false;
        const truncated = !hasRequestedColumns && totalColumns > MAX_COLUMNS_WITHOUT_FILTER;
        schemaByTable.set(key, {
          database,
          table,
          columns: [],
          primaryKey: meta?.primary_key ?? "",
          partitionBy: meta?.partition_key ?? "",
          engine: meta?.engine ?? "",
          sortingKey: meta?.sorting_key ?? "",
          totalColumns,
          truncated,
          guidance: truncated
            ? `Schema truncated for wide table. Retry explore_schema with a narrow columns list. Returned ${MAX_COLUMNS_WITHOUT_FILTER} of ${totalColumns} columns.`
            : undefined,
        });
      }

      schemaByTable.get(key)!.columns.push({ name, type });
    }

    return Array.from(schemaByTable.values());
  } catch (error) {
    console.error("Error executing explore_schema tool:", error);
    return [];
  }
};

import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import { escapeSqlString, type ToolExecutor } from "./client-tool-types";

export type TableSchemaInput = {
  database: string;
  table: string;
  columns?: string[];
};

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
};
export type ExploreSchemaOutput = Array<TableSchemaOutput>;

export const exploreSchemaExecutor: ToolExecutor<ExploreSchemaInput, ExploreSchemaOutput> = async (
  input,
  connection
) => {
  const { tables } = input;

  //
  // Build SQL query to get columns for multiple tables
  // Handle per-table column filtering
  //
  const columnFilters: string[] = [];
  for (const { table: tableName, database, columns } of tables) {
    let condition = `(database = '${escapeSqlString(database)}' AND table = '${escapeSqlString(tableName)}'`;

    // Add column filter if specific columns are requested for this table
    if (columns && columns.length > 0) {
      const columnList = columns.map((c) => `'${escapeSqlString(c)}'`).join(", ");
      condition += ` AND name IN (${columnList})`;
    }

    condition += ")";
    columnFilters.push(condition);
  }

  // Query for columns
  const columnsSql = `
SELECT 
    database, table, name, type
FROM system.columns 
WHERE 
${columnFilters.join(" OR ")}
ORDER BY database, table`;

  // Build query for table metadata (engine, sorting_key, primary_key, partition_key)
  const tableFilters: string[] = [];
  for (const { table: tableName, database } of tables) {
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

      const key = `${database}.${table}`;

      if (!schemaByTable.has(key)) {
        const meta = metaMap.get(key);
        schemaByTable.set(key, {
          database,
          table,
          columns: [],
          primaryKey: meta?.primary_key ?? "",
          partitionBy: meta?.partition_key ?? "",
          engine: meta?.engine ?? "",
          sortingKey: meta?.sorting_key ?? "",
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

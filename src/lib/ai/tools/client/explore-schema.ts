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
  primaryKey?: string;
  partitionBy?: string;
};
export type ExploreSchemaOutput = Array<TableSchemaOutput>;

export const exploreSchemaExecutor: ToolExecutor<
  ExploreSchemaInput,
  ExploreSchemaOutput
> = async (input, connection) => {
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

  // Build query for table metadata (primary_key, partition_by)
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
    const metaMap = new Map<string, { primary_key?: string; partition_by?: string }>();
    for (const row of metaData.data) {
      const rowArray = row as unknown[];
      const database = String(rowArray[0] || "");
      const table = String(rowArray[1] || "");
      const primaryKey = String(rowArray[2] || "");
      const partitionKey = String(rowArray[3] || "");

      const key = `${database}.${table}`;
      metaMap.set(key, {
        primary_key: primaryKey || undefined,
        partition_by: partitionKey || undefined,
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
          primaryKey: meta?.primary_key,
          partitionBy: meta?.partition_by,
        });
      }

      schemaByTable.get(key)!.columns.push({ name, type });
    }

    const result = Array.from(schemaByTable.values());

    // Log the result size for monitoring
    const totalColumns = result.reduce((sum, t) => sum + t.columns.length, 0);
    const tablesWithFilters = tables.filter((t) => t.columns && t.columns.length > 0).length;
    const filterInfo = tablesWithFilters > 0 ? ` (${tablesWithFilters} table(s) with column filters)` : "";
    console.log(
      `✅ explore_schema returned ${result.length} table(s) with ${totalColumns} total columns${filterInfo}`
    );

    return result;
  } catch (error) {
    console.error("Error executing explore_schema tool:", error);
    return [];
  }
};

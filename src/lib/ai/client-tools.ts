/**
 * Client-Side Tools for ClickHouse
 *
 * These tools are executed on the client via the onToolCall callback.
 * They provide schema introspection and query execution capabilities.
 */
import { QueryError, type Connection } from "@/lib/connection/connection";
import type { InferToolInput, InferToolOutput, UIMessage } from "ai";
import { tool } from "ai";
import * as z from "zod";
import type { AppUIMessage } from "./common-types";

export type ValidateSqlToolInput = {
  sql: string;
};

export type ValidateSqlToolOutput = {
  success: boolean;
  error?: string;
};

export const ClientTools = {
  get_table_columns: tool({
    description:
      "Use this tool if you need to get the list of columns in one or more tables. You can query multiple tables at once by providing an array of tables. IMPORTANT: If the user provides a fully qualified table name (e.g., 'system.metric_log'), you MUST split it into database='system' and table='metric_log'. The 'table' field should ONLY contain the table name without the database prefix.",
    inputSchema: z.object({
      tablesAndSchemas: z
        .array(
          z.object({
            table: z
              .string()
              .describe("The table name ONLY (without database prefix). For 'system.metric_log', use 'metric_log'."),
            database: z.string().describe("The database name. For 'system.metric_log', use 'system'."),
          })
        )
        .min(1)
        .describe(
          "An array of tables to query. Each entry must have separate 'database' and 'table' fields. If given a fully qualified name like 'database.table', split it into database='database' and table='table'."
        ),
    }),
    outputSchema: z.array(
      z.object({
        database: z.string(),
        table: z.string(),
        columns: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            comment: z.string().optional(),
          })
        ),
      })
    ),
  }),
  get_tables: tool({
    description:
      "Use this tool if you need to get the list of tables in a database. Optionally filter by database name.",
    inputSchema: z.object({
      database: z
        .string()
        .optional()
        .describe("The name of the database to query. If not provided, returns tables from all databases."),
    }),
    outputSchema: z.array(
      z.object({
        database: z.string(),
        table: z.string(),
        engine: z.string(),
        comment: z.string().nullable(),
      })
    ),
  }),
  execute_sql: tool({
    description:
      "Execute SQL query on ClickHouse database (client-side execution). Use this tool to select data from the database to improve your response.",
    inputSchema: z.object({
      sql: z.string().describe("The SQL query to execute"),
    }),
    outputSchema: z.object({
      columns: z.array(z.object({ name: z.string(), type: z.string() })),
      rows: z.array(z.any()).optional(),
      rowCount: z.number(),
      sampleRow: z.any().optional(),
      error: z.string().optional(),
    }),
  }),
  validate_sql: tool({
    description: "Validate ClickHouse SQL query syntax without executing it. Returns error message if invalid.",
    inputSchema: z.object({
      sql: z.string().describe("The SQL query to validate"),
    }) satisfies z.ZodType<ValidateSqlToolInput>,
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }) satisfies z.ZodType<ValidateSqlToolOutput>,
  }),
};

/**
 * Tool names for easy referencing without hardcoded strings
 */
export const CLIENT_TOOL_NAMES = {
  // Client-side introspection and execution tools
  GET_TABLE_COLUMNS: "get_table_columns",
  GET_TABLES: "get_tables",
  EXECUTE_SQL: "execute_sql",
  VALIDATE_SQL: "validate_sql",
} as const;

export function convertToAppUIMessage(message: UIMessage): AppUIMessage {
  return message as AppUIMessage;
}

/**
 * Escape single quotes in SQL strings to prevent SQL injection
 */
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Tool executor function type
 * Takes tool input and connection, returns tool output
 */
type ToolExecutor<TInput, TOutput> = (input: TInput, connection: Connection) => Promise<TOutput>;

/**
 * Tool registry - maps tool names to their executor functions
 */
export const ClientToolExecutors: {
  [K in keyof typeof ClientTools]: ToolExecutor<
    InferToolInput<(typeof ClientTools)[K]>,
    InferToolOutput<(typeof ClientTools)[K]>
  >;
} = {
  get_table_columns: async (input, connection) => {
    const { tablesAndSchemas } = input;

    // Build SQL query to get columns for multiple tables
    // Group tables by database to optimize the query
    const tablesByDatabase = new Map<string, string[]>();
    for (const { table: tableName, database } of tablesAndSchemas) {
      const db = database;
      if (!tablesByDatabase.has(db)) {
        tablesByDatabase.set(db, []);
      }
      tablesByDatabase.get(db)!.push(tableName);
    }

    // Build WHERE conditions for each database
    const conditions: string[] = [];
    for (const [database, tables] of tablesByDatabase.entries()) {
      const tableList = tables.map((t) => `'${escapeSqlString(t)}'`).join(", ");
      conditions.push(`(database = '${escapeSqlString(database)}' AND table IN (${tableList}))`);
    }

    const sql = `
SELECT 
    database, table, name, type
FROM system.columns 
WHERE 
${conditions.join(" OR ")}
ORDER BY database, table`;

    try {
      const { response } = connection.query(sql, { default_format: "JSONCompact" });
      const apiResponse = await response;
      const responseData = apiResponse.data.json<any>();

      // Validate response structure
      // JSONCompact format returns { data: [[...], [...]] }
      if (!responseData || !Array.isArray(responseData.data)) {
        console.error("Unexpected response format from get_table_columns:", responseData);
        return [];
      }

      const data = responseData.data;

      // Group columns by database and table
      const columnsByTable = new Map<
        string,
        { database: string; table: string; columns: Array<{ name: string; type: string }> }
      >();

      for (const row of data) {
        const rowArray = row as unknown[];
        const database = String(rowArray[0] || "");
        const table = String(rowArray[1] || "");
        const name = String(rowArray[2] || "");
        const type = String(rowArray[3] || "");

        const key = `${database}.${table}`;

        if (!columnsByTable.has(key)) {
          columnsByTable.set(key, {
            database,
            table,
            columns: [],
          });
        }

        columnsByTable.get(key)!.columns.push({ name, type });
      }

      const result = Array.from(columnsByTable.values());

      // Log the result size for monitoring
      const totalColumns = result.reduce((sum, t) => sum + t.columns.length, 0);
      console.log(`✅ get_table_columns returned ${result.length} table(s) with ${totalColumns} total columns`);

      return result;
    } catch (error) {
      console.error("Error executing get_table_columns tool:", error);
      return [];
    }
  },

  get_tables: async (input, connection) => {
    const { database } = input;

    // Build SQL query to get tables
    let sql = `
SELECT 
  database, table, engine, comment
FROM
  system.tables
WHERE NOT startsWith(table, '.inner')`;
    if (database) {
      sql += ` AND database = '${escapeSqlString(database)}'`;
    }
    sql += ` ORDER BY database, table`;

    try {
      const { response } = connection.query(sql, { default_format: "JSONCompact" });
      const apiResponse = await response;
      const responseData = apiResponse.data.json<any>();

      // Validate response structure
      // JSONCompact format returns { data: [[...], [...]] }
      if (!responseData || !Array.isArray(responseData.data)) {
        console.error("Unexpected response format from get_tables:", responseData);
        return [];
      }

      const data = responseData.data;
      const tables = data.map((row: unknown) => {
        const rowArray = row as unknown[];
        return {
          database: String(rowArray[0] || ""),
          table: String(rowArray[1] || ""),
          engine: String(rowArray[2] || ""),
          comment: rowArray[3] ? String(rowArray[3]) : null,
        };
      });

      return tables;
    } catch (error) {
      console.error("Error executing get_tables tool:", error);
      return [];
    }
  },

  execute_sql: async (input, connection) => {
    try {
      const { sql } = input;
      console.log("🔧 execute_sql tool executing:", sql);

      const { response } = connection.query(sql, {
        default_format: "JSONCompact",
      });
      const apiResponse = await response;
      const responseData = apiResponse.data.json<any>();

      // Transform ClickHouse JSONCompact response
      // JSONCompact response structure: { meta: [{name, type}, ...], data: [[...], ...], rows: number }
      const columns =
        (responseData?.meta as { name: string; type: string }[])?.map((m: { name: string; type: string }) => ({
          name: m.name,
          type: m.type,
        })) || [];

      const rowsData = (responseData?.data as unknown[][]) || [];
      const rows = rowsData.map((row: unknown[]) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col: { name: string }, idx: number) => {
          obj[col.name] = row[idx];
        });
        return obj;
      });

      return {
        columns,
        rows,
        rowCount: rows.length,
        sampleRow: rows[0] || {},
      };
    } catch (error) {
      if (error instanceof QueryError && (error as QueryError).data) {
        return {
          error: (error as QueryError).data,
          columns: [],
          rows: [],
          rowCount: 0,
          sampleRow: {},
        };
      }
      console.error("Error executing execute_sql tool:", error);
      return {
        error: error instanceof Error ? error.message : "Unknown error",
        columns: [],
        rows: [],
        rowCount: 0,
        sampleRow: {},
      };
    }
  },
  validate_sql: async (input, connection) => {
    try {
      const { sql } = input;
      console.log("🔧 validate_sql tool executing:", sql);

      const { response } = connection.query("EXPLAIN SYNTAX " + sql);
      await response;

      return {
        success: true,
      };
    } catch (error) {
      if (error instanceof QueryError && (error as QueryError).data) {
        return {
          error: (error as QueryError).data,
          success: false,
        };
      }
      console.error("Error executing validate_sql tool:", error);
      return {
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
      };
    }
  },
};

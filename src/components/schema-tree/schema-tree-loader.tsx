import { Connection, type JSONFormatResponse, type QueryError } from "@/lib/connection/connection";
import type { SchemaLoadResult, TableItemDO } from "./schema-tree-types";

// Re-export types for backward compatibility
export type {
  ColumnNodeData,
  DatabaseNodeData,
  HostNodeData,
  SchemaLoadResult,
  SchemaNodeData,
  TableItemDO,
  TableNodeData,
} from "./schema-tree-types";

export class SchemaTreeLoader {
  private apiCanceller: AbortController | null = null;

  /**
   * Aborts any ongoing loading request
   */
  abort() {
    if (this.apiCanceller) {
      this.apiCanceller.abort();
      this.apiCanceller = null;
    }
  }

  /**
   * Loads the schema data for a given connection
   */
  async load(connection: Connection): Promise<SchemaLoadResult> {
    this.abort(); // Abort previous

    const sql = `
SELECT 
    databases.name AS database,
    databases.engine AS dbEngine,
    databases.comment AS dbComment,
    tables.name AS table,
    tables.engine AS tableEngine,
    tables.comment AS tableComment,
    columns.name AS columnName,
    columns.type AS columnType,
    columns.comment AS columnComment
FROM
    system.databases
LEFT JOIN 
    system.tables
ON 
    databases.name = tables.database
LEFT JOIN
    system.columns
ON
    tables.database = columns.database AND tables.name = columns.table
WHERE
    (tables.name IS NULL OR (NOT startsWith(tables.name, '.inner.') AND NOT startsWith(tables.name, '.inner_id.')))
ORDER BY lower(database), database, table, columnName`;

    try {
      const { response, abortController } = connection.queryOnNode(sql, {
        default_format: "JSON",
        output_format_json_quote_64bit_integers: 0,
      });

      this.apiCanceller = abortController;

      const apiResponse = await response;

      const rows = (apiResponse.data.json<JSONFormatResponse>().data ||
        []) as unknown as TableItemDO[];

      // Extract server display name from HTTP header
      const serverDisplayName = apiResponse.httpHeaders?.["x-clickhouse-server-display-name"];

      return {
        rows,
        serverDisplayName: serverDisplayName || undefined,
      };
    } catch (error: unknown) {
      const apiError = error as QueryError;
      let errorMessage = `Failed to load databases: ${apiError.message}`;
      if (apiError.httpStatus) {
        errorMessage += ` (HTTP ${apiError.httpStatus})`;
      }
      const detailMessage =
        typeof apiError?.data === "string"
          ? apiError.data
          : apiError?.data && typeof apiError.data === "object" && "message" in apiError.data
            ? String(apiError.data.message)
            : apiError?.data
              ? JSON.stringify(apiError.data, null, 2)
              : undefined;
      if (detailMessage) {
        errorMessage += `\n${detailMessage}`;
      }
      throw new Error(errorMessage);
    } finally {
      this.apiCanceller = null;
    }
  }
}

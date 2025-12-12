import { Api, type ApiCanceller, type ApiErrorResponse } from "@/lib/api";
import { type Connection } from "@/lib/connection/Connection";
import type { SchemaLoadResult, TableItemDO } from "./schema-tree-types";

// Re-export types for backward compatibility
export type {
  DatabaseNodeData,
  TableNodeData,
  ColumnNodeData,
  HostNodeData,
  SchemaNodeData,
  SchemaLoadResult,
  TableItemDO,
} from "./schema-tree-types";

export class SchemaTreeLoader {
  private apiCanceller: ApiCanceller | null = null;

  /**
   * Cancels any ongoing loading request
   */
  cancel() {
    if (this.apiCanceller) {
      this.apiCanceller.cancel();
      this.apiCanceller = null;
    }
  }

  /**
   * Loads the schema data for a given connection
   */
  async load(connection: Connection): Promise<SchemaLoadResult> {
    this.cancel(); // Cancel previous

    const sql = `
SELECT 
    databases.name AS database,
    databases.engine AS dbEngine,
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
      const { response, abortController } = Api.create(connection).executeAsyncOnNode(
        connection.runtime?.targetNode,
        sql,
        { default_format: "JSON", output_format_json_quote_64bit_integers: 0 }
      );

      this.apiCanceller = {
        cancel: () => abortController.abort(),
      };

      const apiResponse = await response;

      const rows = (apiResponse.data.data || []) as TableItemDO[];

      return {
        rows,
      };
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;
      let errorMessage = `Failed to load databases: ${apiError.errorMessage}`;
      if (apiError.httpStatus) {
        errorMessage += ` (HTTP ${apiError.httpStatus})`;
      }
      const detailMessage =
        typeof apiError?.data === "object"
          ? apiError.data?.message
            ? apiError.data.message
            : JSON.stringify(apiError.data, null, 2)
          : apiError?.data;
      if (detailMessage) {
        errorMessage += `\n${detailMessage}`;
      }
      throw new Error(errorMessage);
    } finally {
      this.apiCanceller = null;
    }
  }
}

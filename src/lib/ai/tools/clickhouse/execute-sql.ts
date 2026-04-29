import { QueryError } from "@/lib/connection/connection";
import type { ToolExecutor } from "./clickhouse-tool-types";

type ExecuteSqlInput = {
  sql: string;
};

type ExecuteSqlOutput = {
  columns: Array<{ name: string; type: string }>;
  rows?: Array<Record<string, unknown>>;
  rowCount: number;
  sampleRow?: Record<string, unknown>;
  error?: string;
};

type JsonCompactResponse = {
  meta?: Array<{ name: string; type: string }>;
  data?: unknown[][];
};

export const executeSqlExecutor: ToolExecutor<ExecuteSqlInput, ExecuteSqlOutput> = async (
  input,
  connection
) => {
  try {
    const { sql } = input;

    const { response } = connection.query(sql, {
      default_format: "JSONCompact",
    });
    const apiResponse = await response;
    const responseData = apiResponse.data.json() as JsonCompactResponse;

    // Transform ClickHouse JSONCompact response
    // JSONCompact response structure: { meta: [{name, type}, ...], data: [[...], ...], rows: number }
    const columns =
      responseData?.meta?.map((m: { name: string; type: string }) => ({
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
    if (error instanceof QueryError && error.data) {
      const errorMessage = typeof error.data === "string" ? error.data : error.message;
      return {
        error: errorMessage,
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
};

import { CollapsibleSection } from "@/components/collapsible-section";
import FloatingProgressBar from "@/components/floating-progress-bar";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { toastManager } from "@/lib/toast";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface TableMetadataViewProps {
  database: string;
  table: string;
}

export interface TableMetadataViewRef {
  refresh: () => void;
}

interface ColumnInfo {
  name: string;
  type: string;
  default_type: string;
  default_expression: string;
  comment: string;
  codec_expression: string;
  ttl_expression: string;
}

function TableDDLView({
  database,
  table,
  refreshTrigger,
}: TableMetadataViewProps & { refreshTrigger?: number }) {
  const { selectedConnection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [tableData, setTableData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiCancellerRef = useRef<ApiCanceller | null>(null);
  const isMountedRef = useRef(true);

  const fetchDDL = useCallback(() => {
    if (!selectedConnection) {
      setError("No connection selected");
      return;
    }

    setIsLoading(true);
    setError(null);
    setTableData(null);

    const api = Api.create(selectedConnection);

    const canceller = api.executeSQL(
      {
        sql: `SELECT * FROM system.tables WHERE database = '${database}' AND name = '${table}'`,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
        },
      },
      (response: ApiResponse) => {
        if (!isMountedRef.current) {
          return;
        }

        try {
          // JSON format returns { data: [...] } structure
          const data = response.data.data || [];
          if (data.length > 0) {
            setTableData(data[0]);
          } else {
            setTableData(null);
          }
          setIsLoading(false);
        } catch (err) {
          console.error("Error processing table DDL response:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          setIsLoading(false);
          toastManager.show(`Failed to process table DDL: ${errorMessage}`, "error");
        }
      },
      (error: ApiErrorResponse) => {
        if (!isMountedRef.current) return;

        const errorMessage = error.errorMessage || "Unknown error occurred";
        const lowerErrorMessage = errorMessage.toLowerCase();
        if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
          setIsLoading(false);
          return;
        }

        console.error("API Error:", error);
        setError(errorMessage);
        setIsLoading(false);
        toastManager.show(`Failed to load table DDL: ${errorMessage}`, "error");
      },
      () => {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    );

    apiCancellerRef.current = canceller;
  }, [selectedConnection, database, table]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchDDL();

    return () => {
      isMountedRef.current = false;
      if (apiCancellerRef.current) {
        apiCancellerRef.current.cancel();
        apiCancellerRef.current = null;
      }
    };
  }, [fetchDDL, refreshTrigger]);

  const renderCellValue = (columnName: string, value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">-</span>;
    }

    // Use ThemedSyntaxHighlighter for create_table_query and as_select columns
    if (columnName === "create_table_query" || columnName === "as_select") {
      const valueStr = String(value);
      if (valueStr.length == 0) {
        return "-";
      }
      return (
        <div className="overflow-x-auto">
          <ThemedSyntaxHighlighter
            language="sql"
            customStyle={{ fontSize: "14px", margin: 0 }}
            showLineNumbers={false}
          >
            {valueStr}
          </ThemedSyntaxHighlighter>
        </div>
      );
    }

    return <span className="whitespace-nowrap">{String(value)}</span>;
  };

  return (
    <CollapsibleSection title="Table Metadata" className="relative">
      <FloatingProgressBar show={isLoading} />
      {error ? (
        <div className="p-4">
          <div className="text-sm text-destructive">
            <p className="font-semibold mb-2">Error loading table DDL:</p>
            <p>{error}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-auto">
          {tableData ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold whitespace-nowrap">Name</th>
                  <th className="text-left p-2 font-semibold whitespace-nowrap">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(tableData).map(([columnName, value]) => (
                  <tr key={columnName} className="border-b hover:bg-muted/50">
                    <td className="p-2 whitespace-nowrap font-medium">{columnName}</td>
                    <td className="p-2">{renderCellValue(columnName, value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              {isLoading ? "Loading..." : "No table data found"}
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

function TableStructureView({
  database,
  table,
  refreshTrigger,
}: TableMetadataViewProps & { refreshTrigger?: number }) {
  const { selectedConnection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const apiCancellerRef = useRef<ApiCanceller | null>(null);
  const isMountedRef = useRef(true);

  const fetchStructure = useCallback(() => {
    if (!selectedConnection) {
      setError("No connection selected");
      return;
    }

    const fullTableName = `${database}.${table}`;
    setIsLoading(true);
    setError(null);
    setColumns([]);

    const api = Api.create(selectedConnection);

    const canceller = api.executeSQL(
      {
        sql: `DESCRIBE TABLE ${fullTableName}`,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
        },
      },
      (response: ApiResponse) => {
        if (!isMountedRef.current) {
          return;
        }

        try {
          const data = response.data.data || [];
          setColumns(data as ColumnInfo[]);
          setIsLoading(false);
        } catch (err) {
          console.error("Error processing table structure response:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          setIsLoading(false);
          toastManager.show(`Failed to process table structure: ${errorMessage}`, "error");
        }
      },
      (error: ApiErrorResponse) => {
        if (!isMountedRef.current) return;

        const errorMessage = error.errorMessage || "Unknown error occurred";
        const lowerErrorMessage = errorMessage.toLowerCase();
        if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
          setIsLoading(false);
          return;
        }

        console.error("API Error:", error);
        setError(errorMessage);
        setIsLoading(false);
        toastManager.show(`Failed to load table structure: ${errorMessage}`, "error");
      },
      () => {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    );

    apiCancellerRef.current = canceller;
  }, [selectedConnection, database, table]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStructure();

    return () => {
      isMountedRef.current = false;
      if (apiCancellerRef.current) {
        apiCancellerRef.current.cancel();
        apiCancellerRef.current = null;
      }
    };
  }, [fetchStructure, refreshTrigger]);

  return (
    <CollapsibleSection title="Table Structure" className="relative">
      <FloatingProgressBar show={isLoading} />
      {error ? (
        <div className="p-4">
          <div className="text-sm text-destructive">
            <p className="font-semibold mb-2">Error loading table structure:</p>
            <p>{error}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-semibold">Name</th>
                <th className="text-left p-2 font-semibold">Type</th>
                <th className="text-left p-2 font-semibold">Default Type</th>
                <th className="text-left p-2 font-semibold">Default Expression</th>
                <th className="text-left p-2 font-semibold">Comment</th>
                <th className="text-left p-2 font-semibold">Codec Expression</th>
                <th className="text-left p-2 font-semibold">TTL Expression</th>
              </tr>
            </thead>
            <tbody>
              {columns.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    No columns found
                  </td>
                </tr>
              )}
              {columns.map((column, index) => (
                <tr key={index} className="border-b hover:bg-muted/50">
                  <td className="p-2 ">{column.name || "-"}</td>
                  <td className="p-2 ">{column.type || "-"}</td>
                  <td className="p-2">{column.default_type || "-"}</td>
                  <td className="p-2 ">{column.default_expression || "-"}</td>
                  <td className="p-2">{column.comment || "-"}</td>
                  <td className="p-2 ">{column.codec_expression || "-"}</td>
                  <td className="p-2 ">{column.ttl_expression || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleSection>
  );
}

export const TableMetadataView = forwardRef<TableMetadataViewRef, TableMetadataViewProps>(
  ({ database, table }, ref) => {
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useImperativeHandle(ref, () => ({
      refresh: () => {
        setRefreshTrigger((prev) => prev + 1);
      },
    }));

    return (
      <div className="space-y-2">
        <TableDDLView database={database} table={table} refreshTrigger={refreshTrigger} />
        <TableStructureView database={database} table={table} refreshTrigger={refreshTrigger} />
      </div>
    );
  }
);

TableMetadataView.displayName = "TableMetadataView";


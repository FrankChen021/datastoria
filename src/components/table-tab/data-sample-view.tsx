import FloatingProgressBar from "@/components/floating-progress-bar";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Dialog } from "@/components/use-dialog";
import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { toastManager } from "@/lib/toast";
import type { RefreshableTabViewRef } from "./table-tab";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface DataSampleViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

interface ColumnInfo {
  name: string;
  type: string;
}

const isComplexType = (type: string): boolean => {
  const lowerType = type.toLowerCase();
  return (
    lowerType.includes("array") ||
    lowerType.includes("map") ||
    lowerType.includes("tuple") ||
    lowerType === "json" ||
    lowerType.startsWith("json")
  );
};

const isStringType = (type: string): boolean => {
  const lowerType = type.toLowerCase();
  return (
    lowerType === "string" ||
    lowerType.startsWith("string") ||
    lowerType === "text" ||
    lowerType.includes("varchar") ||
    lowerType.includes("char")
  );
};

const isMapType = (type: string): boolean => {
  return type.startsWith("Map(");
};

// Parse Map data from ClickHouse JSON format
// Map comes as a JSON object: { "key1": value1, "key2": value2, ... }
const parseMapData = (value: unknown): Array<{ key: unknown; value: unknown }> | null => {
  if (value === null || value === undefined) {
    return null;
  }

  // In JSON format, Map is returned as an object (not array)
  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  try {
    // Convert object to array of key-value pairs
    return Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
      key,
      value: val,
    }));
  } catch {
    return null;
  }
};

// Try to parse string as JSON
const tryParseJSON = (str: string): unknown | null => {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
};

// Render dialog content based on column type
const renderDialogContent = (value: unknown, columnType: string): React.ReactNode => {
  // Map type - render as table
  if (isMapType(columnType)) {
    const mapData = parseMapData(value);
    if (mapData) {
      return (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-semibold">Key</th>
                <th className="text-left p-2 font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              {mapData.length === 0 ? (
                <tr>
                  <td colSpan={2} className="p-4 text-center text-muted-foreground">
                    Empty map
                  </td>
                </tr>
              ) : (
                mapData.map((entry, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="p-2 whitespace-nowrap">{formatValueForDisplay(entry.key)}</td>
                    <td className="p-2 break-words">{formatValueForDisplay(entry.value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      );
    }
  }

  // String type - try to parse as JSON
  if (isStringType(columnType)) {
    const stringValue = String(value);
    const parsedJSON = tryParseJSON(stringValue);
    if (parsedJSON !== null) {
      return (
        <ThemedSyntaxHighlighter language="json" customStyle={{ fontSize: "14px", margin: 0 }} showLineNumbers={true}>
          {JSON.stringify(parsedJSON, null, 2)}
        </ThemedSyntaxHighlighter>
      );
    }
    // Not valid JSON, render as plain text
    return (
      <div className="whitespace-pre-wrap break-words text-sm font-mono p-2 bg-muted rounded">
        {stringValue}
      </div>
    );
  }

  // Other complex types - render as JSON
  const jsonValue = typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value);
  return (
    <ThemedSyntaxHighlighter language="json" customStyle={{ fontSize: "14px", margin: 0 }} showLineNumbers={true}>
      {jsonValue}
    </ThemedSyntaxHighlighter>
  );
};

// Format a single value for display in table
const formatValueForDisplay = (val: unknown): string => {
  if (val === null || val === undefined) {
    return "NULL";
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
};

export const DataSampleView = forwardRef<RefreshableTabViewRef, DataSampleViewProps>(({ database, table, autoLoad = false }, ref) => {
  const { selectedConnection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const apiCancellerRef = useRef<ApiCanceller | null>(null);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(() => {
    if (!selectedConnection) {
      setError("No connection selected");
      return;
    }

    const fullTableName = `${database}.${table}`;
    setIsLoading(true);
    setError(null);

    const api = Api.create(selectedConnection);

    // First fetch column types
    const describeCanceller = api.executeSQL(
      {
        sql: `DESCRIBE TABLE ${fullTableName}`,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
        },
      },
      (describeResponse: ApiResponse) => {
        if (!isMountedRef.current) {
          return;
        }

        try {
          const describeData = describeResponse.data.data || [];
          const columnTypes = new Map<string, string>();
          (describeData as Array<{ name: string; type: string }>).forEach((col) => {
            columnTypes.set(col.name, col.type);
          });

          // Now fetch the actual data
          const dataCanceller = api.executeSQL(
            {
              sql: `SELECT * FROM ${fullTableName} LIMIT 1000`,
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
                const responseData = response.data;
                // JSON format returns { meta: [...], data: [...], rows: number, statistics: {...} }
                const rows = responseData.data || [];
                const meta = responseData.meta || [];

                // Extract column info with types
                const columnInfos: ColumnInfo[] = meta.map((col: { name: string }) => ({
                  name: col.name,
                  type: columnTypes.get(col.name) || "String",
                }));

                setColumns(columnInfos);
                setData(rows as Record<string, unknown>[]);
                setIsLoading(false);
              } catch (err) {
                console.error("Error processing data sample response:", err);
                const errorMessage = err instanceof Error ? err.message : String(err);
                setError(errorMessage);
                setIsLoading(false);
                toastManager.show(`Failed to process data sample: ${errorMessage}`, "error");
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
              toastManager.show(`Failed to load data sample: ${errorMessage}`, "error");
            },
            () => {
              if (isMountedRef.current) {
                setIsLoading(false);
              }
            }
          );

          apiCancellerRef.current = dataCanceller;
        } catch (err) {
          console.error("Error processing column types response:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          setIsLoading(false);
          toastManager.show(`Failed to process column types: ${errorMessage}`, "error");
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
        toastManager.show(`Failed to load column types: ${errorMessage}`, "error");
      },
      () => {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    );

    apiCancellerRef.current = describeCanceller;
  }, [selectedConnection, database, table]);

  useEffect(() => {
    isMountedRef.current = true;
    if (autoLoad) {
      fetchData();
    }

    return () => {
      isMountedRef.current = false;
      if (apiCancellerRef.current) {
        apiCancellerRef.current.cancel();
        apiCancellerRef.current = null;
      }
    };
  }, [fetchData, autoLoad]);

  useImperativeHandle(ref, () => ({
    refresh: () => {
      fetchData();
    },
  }));

  // Format cell value for display
  const formatCellValue = (value: unknown, columnType: string): { display: string; isClickable: boolean; isTruncated: boolean } => {
    if (value === null || value === undefined) {
      return { display: "NULL", isClickable: false, isTruncated: false };
    }

    // Special handling for Map types
    if (isMapType(columnType)) {
      const mapData = parseMapData(value);
      if (mapData) {
        return { display: `Map(${mapData.length} entries)`, isClickable: true, isTruncated: false };
      }
    }

    const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);

    // Check if string is too long (more than 200 characters)
    if (stringValue.length > 200) {
      return {
        display: stringValue.substring(0, 200) + "...",
        isClickable: true,
        isTruncated: true,
      };
    }

    if (isComplexType(columnType)) {
      // Show first 30 characters for complex types
      const truncated = stringValue.length > 30 ? stringValue.substring(0, 30) + "..." : stringValue;
      return { display: truncated, isClickable: true, isTruncated: stringValue.length > 30 };
    }

    return { display: stringValue, isClickable: false, isTruncated: false };
  };

  const handleCellClick = (value: unknown, columnName: string, columnType: string) => {
    const content = renderDialogContent(value, columnType);
    Dialog.alert({
      title: `${columnName} (${columnType})`,
      mainContent: content,
      className: "max-w-4xl max-h-[80vh]",
    });
  };

  return (
    <div className="h-full relative">
      <FloatingProgressBar show={isLoading} />
      {error ? (
        <div className="p-4">
          <div className="text-sm text-destructive">
            <p className="font-semibold mb-2">Error loading data sample:</p>
            <p>{error}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-auto h-full">
          {data.length === 0 && !isLoading ? (
            <div className="p-4 text-center text-muted-foreground">No data found</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold border-r whitespace-nowrap">#</th>
                  {columns.map((column) => (
                    <th
                      key={column.name}
                      className="text-left p-2 font-semibold border-r last:border-r-0 whitespace-nowrap"
                    >
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b hover:bg-muted/50">
                    <td className="p-2 border-r whitespace-nowrap text-muted-foreground">
                      {rowIndex + 1}
                    </td>
                    {columns.map((column) => {
                      const value = row[column.name];
                      const { display, isClickable } = formatCellValue(value, column.type);
                      return (
                        <td
                          key={column.name}
                          className={`p-2 border-r last:border-r-0 whitespace-nowrap ${
                            isClickable ? "cursor-pointer hover:bg-muted hover:underline" : ""
                          }`}
                          onClick={() => isClickable && handleCellClick(value, column.name, column.type)}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.length === 1000 && (
            <div className="p-2 text-xs text-muted-foreground text-center border-t">Showing first 1000 rows</div>
          )}
        </div>
      )}
    </div>
  );
});

DataSampleView.displayName = "DataSampleView";

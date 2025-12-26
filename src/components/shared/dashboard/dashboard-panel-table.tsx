"use client";

import { CardContent } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { QueryError } from "@/lib/connection/connection";
import { useConnection } from "@/lib/connection/connection-context";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { showQueryDialog } from "./dashboard-dialog-utils";
import type { FieldOption, SQLQuery, TableDescriptor } from "./dashboard-model";
import type { DashboardPanelComponent, RefreshOptions } from "./dashboard-panel-layout";
import { DashboardPanelLayout } from "./dashboard-panel-layout";
import { DataTable } from "./data-table";
import { replaceTimeSpanParams } from "./sql-time-utils";
import type { TimeSpan } from "./timespan-selector";
import { useRefreshable } from "./use-refreshable";

interface DashboardPanelTableProps {
  // The table descriptor configuration
  descriptor: TableDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;

  // Additional className for the Card component
  className?: string;

  // Initial loading state (useful for drilldown dialogs)
  initialLoading?: boolean;

  // Callback when collapsed state changes
  onCollapsedChange?: (isCollapsed: boolean) => void;
}

// Replace ORDER BY clause in SQL query
function replaceOrderByClause(
  sql: string,
  orderByColumn: string | null,
  orderDirection: "asc" | "desc" | null
): string {
  if (!orderByColumn || !orderDirection) {
    // Remove ORDER BY clause if sorting is cleared
    // Match ORDER BY ... (until LIMIT or end of string)
    return sql.replace(/\s+ORDER\s+BY\s+[^\s]+(?:\s+(?:ASC|DESC))?(?:\s*,\s*[^\s]+\s+(?:ASC|DESC)?)*/gi, "");
  }

  const orderByClause = `ORDER BY ${orderByColumn} ${orderDirection.toUpperCase()}`;

  // Check if ORDER BY exists (use a simple regex to avoid lastIndex side effects)
  const hasOrderBy = /\s+ORDER\s+BY\s+/i.test(sql);

  if (hasOrderBy) {
    // Replace existing ORDER BY - use a fresh regex for replace
    const replaceRegex =
      /\s+ORDER\s+BY\s+[^\s]+(?:\s+(?:ASC|DESC))?(?:\s*,\s*[^\s]+\s+(?:ASC|DESC)?)*(?=\s+LIMIT|\s*$)/gi;
    return sql.replace(replaceRegex, ` ${orderByClause}`);
  } else {
    // No ORDER BY exists - add it before LIMIT if exists, otherwise at the end
    const limitRegex = /\s+LIMIT\s+\d+/i;
    if (limitRegex.test(sql)) {
      // Reset regex lastIndex before replace
      limitRegex.lastIndex = 0;
      return sql.replace(limitRegex, ` ${orderByClause}$&`);
    } else {
      // No LIMIT clause - add ORDER BY at the end
      return sql.trim() + ` ${orderByClause}`;
    }
  }
}

const DashboardPanelTable = forwardRef<DashboardPanelComponent, DashboardPanelTableProps>(
  function DashboardPanelTable(props, ref) {
    const { descriptor } = props;
    const { connection } = useConnection();

    // State
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [meta, setMeta] = useState<{ name: string; type?: string }[]>([]);
    const [isLoading, setIsLoading] = useState(props.initialLoading ?? false);
    const [error, setError] = useState("");
    const [sort, setSort] = useState<{ column: string | null; direction: "asc" | "desc" | null }>({
      column: descriptor.sortOption?.initialSort?.column || null,
      direction: descriptor.sortOption?.initialSort?.direction || null,
    });

    // Refs
    const apiCancellerRef = useRef<AbortController | null>(null);
    // Ref to store current sort state for synchronous access in loadData
    const sortRef = useRef<{ column: string | null; direction: "asc" | "desc" | null }>({
      column: descriptor.sortOption?.initialSort?.column || null,
      direction: descriptor.sortOption?.initialSort?.direction || null,
    });
    // Ref to store refresh function
    const refreshRef = useRef<((param: RefreshOptions) => void) | null>(null);



    // Keep sortRef in sync with sort state
    useEffect(() => {
      sortRef.current = sort;
    }, [sort]);

    // Load data from API
    const loadData = useCallback(
      async (param: RefreshOptions = {}) => {
        if (!connection) {
          setError("No connection selected");
          return;
        }

        if (!descriptor.query) {
          setError("No query defined for this table component.");
          return;
        }

        setIsLoading(true);
        setError("");

        try {
          // Cancel previous request if any
          if (apiCancellerRef.current) {
            apiCancellerRef.current.abort();
            apiCancellerRef.current = null;
          }

          // Build query from descriptor
          const query = Object.assign({}, descriptor.query) as SQLQuery;

          // If query has interval (time series), we might need to update it with selectedTimeSpan
          if (param.selectedTimeSpan && query.interval) {
            query.interval = {
              ...query.interval,
              startISO8601: param.selectedTimeSpan.startISO8601,
              endISO8601: param.selectedTimeSpan.endISO8601,
            };
          }

          // Replace time span template parameters in SQL (e.g., {rounding:UInt32}, {seconds:UInt32}, etc.)
          let finalSql = replaceTimeSpanParams(query.sql, param.selectedTimeSpan, connection.metadata.timezone);

          // Apply server-side sorting if enabled
          // Use sortRef for synchronous access to current sort state
          if (descriptor.sortOption?.serverSideSorting && sortRef.current.column && sortRef.current.direction) {
            finalSql = replaceOrderByClause(finalSql, sortRef.current.column, sortRef.current.direction);
          }

          try {
            const { response, abortController } = connection.queryOnNode(
              finalSql,
              {
                default_format: "JSON",
                output_format_json_quote_64bit_integers: 0,
                ...query.params,
              },
              {
                "Content-Type": "text/plain",
                ...query.headers,
              }
            );

            // Set the canceller immediately after getting the abort controller
            apiCancellerRef.current = abortController;

            const apiResponse = await response;

            // Check if request was aborted
            if (abortController.signal.aborted) {
              setIsLoading(false);
              return;
            }

            const responseData = apiResponse.data;

            // JSON format returns { meta: [...], data: [...], rows: number, statistics: {...} }
            const rows = responseData.data || [];
            const meta = responseData.meta || [];

            setMeta(meta);
            setData(rows as Record<string, unknown>[]);
            setError("");
            setIsLoading(false);
          } catch (error) {
            // Check if request was aborted
            if (error instanceof DOMException && error.name === "AbortError") {
              setIsLoading(false);
              return;
            }

            // Handle QueryError
            if (error instanceof QueryError) {
              const errorMessage = error.message || "Unknown error occurred";
              const lowerErrorMessage = errorMessage.toLowerCase();

              if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
                setIsLoading(false);
                return;
              }

              setError(error.data);
              setIsLoading(false);
            } else {
              // Handle other errors
              const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
              console.error("Error processing table response:", error);
              setError(errorMessage);
              setIsLoading(false);
            }
          }
        } catch (error) {
          const errorMessage = (error as Error).message || "Unknown error occurred";
          setError(errorMessage);
          setIsLoading(false);
          console.error(error);
        }
      },
      [descriptor, connection]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshOptions) => {
        if (!descriptor.query) {
          console.error(`No query defined for table [${descriptor.titleOption?.title || "Unknown"}]`);
          setError("No query defined for this table component.");
          return;
        }

        loadData(param);
      },
      [descriptor, loadData]
    );

    // Use shared refreshable hook
    const getInitialParams = useCallback(() => {
      return props.selectedTimeSpan
        ? ({ selectedTimeSpan: props.selectedTimeSpan } as RefreshOptions)
        : ({} as RefreshOptions);
    }, [props.selectedTimeSpan]);

    const { componentRef, isCollapsed, setIsCollapsed, refresh, getLastRefreshParameter } = useRefreshable({
      initialCollapsed: descriptor.collapsed ?? false,
      refreshInternal,
      getInitialParams,
      onCollapsedChange: props.onCollapsedChange,
    });

    // Store refresh function in ref for use in handleSort
    useEffect(() => {
      refreshRef.current = refresh;
    }, [refresh]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
      getLastRefreshOptions: getLastRefreshParameter, // Alias for compatibility
    }));

    // Cleanup API canceller on unmount
    useEffect(() => {
      return () => {
        if (apiCancellerRef.current) {
          apiCancellerRef.current.abort();
          apiCancellerRef.current = null;
        }
      };
    }, []);

    // Handle sort change from DataTable
    const handleSortChange = useCallback(
      (column: string, direction: "asc" | "desc" | null) => {
        const newSort = { column, direction };
        // Update both state and ref synchronously
        setSort(newSort);
        sortRef.current = newSort;

        // If server-side sorting is enabled, trigger a refresh with the new sort
        if (descriptor.sortOption?.serverSideSorting && refreshRef.current) {
          const refreshParam = { inputFilter: `sort_${Date.now()}_${newSort.column}_${newSort.direction}` };
          refreshRef.current(refreshParam);
        }
      },
      [descriptor.sortOption]
    );



    // Handler for showing query dialog
    const handleShowQuery = useCallback(() => {
      showQueryDialog(descriptor.query, descriptor.titleOption?.title);
    }, [descriptor.query, descriptor.titleOption]);

    // Build dropdown menu items
    const dropdownItems = (
      <>{descriptor.query?.sql && <DropdownMenuItem onClick={handleShowQuery}>Show query</DropdownMenuItem>}</>
    );

    // Handler for refresh button
    const handleRefresh = useCallback(() => {
      const lastParams = getLastRefreshParameter();
      refresh({ ...lastParams, forceRefresh: true });
    }, [getLastRefreshParameter, refresh]);

    return (
      <DashboardPanelLayout
        componentRef={componentRef}
        className={props.className}
        isLoading={isLoading}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        titleOption={descriptor.titleOption}
        dropdownItems={dropdownItems}
        onRefresh={handleRefresh}
      >
        <CardContent
          className="px-0 p-0 h-full overflow-hidden"
          // Support descriptor.height for special cases like drilldown dialogs (uses vh units)
          // For normal dashboard panels, height is controlled by gridPos.h instead
          style={descriptor.height ? ({ maxHeight: `${descriptor.height}vh` } as React.CSSProperties) : undefined}
        >
          <DataTable
            data={data}
            meta={meta}
            fieldOptions={useMemo(() => {
              if (!descriptor.fieldOptions) return [];
              const options: FieldOption[] = [];
              if (descriptor.fieldOptions instanceof Map) {
                descriptor.fieldOptions.forEach((value, key) => {
                  options.push({ ...value, name: key });
                });
              } else {
                Object.entries(descriptor.fieldOptions).forEach(([key, value]) => {
                  options.push({ ...value, name: key });
                });
              }
              return options;
            }, [descriptor.fieldOptions])}
            actions={descriptor.actions}
            isLoading={isLoading}
            error={error}
            sort={sort}
            onSortChange={handleSortChange}
            showIndexColumn={descriptor.showIndexColumn}
            enableClientSorting={!descriptor.sortOption?.serverSideSorting}
            className="h-full border-0 rounded-none"
          />
        </CardContent>
      </DashboardPanelLayout>
    );
  }
);

DashboardPanelTable.displayName = "DashboardPanelTable";

export default DashboardPanelTable;

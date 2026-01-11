"use client";

import { useConnection } from "@/components/connection/connection-context";
import { Dialog } from "@/components/use-dialog";
import { QueryError } from "@/lib/connection/connection";
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { showQueryDialog } from "./dashboard-dialog-utils";
import { DashboardDropdownMenuItem } from "./dashboard-dropdown-menu-item";
import type {
  PanelDescriptor,
  PieDescriptor,
  StatDescriptor,
  TableDescriptor,
  TimeseriesDescriptor,
  TransposeTableDescriptor,
} from "./dashboard-model";
import {
  DashboardPanelLayout,
  type DashboardPanelComponent,
  type RefreshOptions,
} from "./dashboard-panel-layout";
// Import old components for non-refactored types
import DashboardPanelStat from "./dashboard-panel-stat";
// Import pure visualization components
import { PieVisualization, type PieVisualizationRef } from "./dashboard-visualization-pie";
import { TableVisualization, type TableVisualizationRef } from "./dashboard-visualization-table";
import {
  TimeseriesVisualization,
  type TimeseriesVisualizationRef,
} from "./dashboard-visualization-timeseries";
import {
  TransposeTableVisualization,
  type TransposeTableVisualizationRef,
} from "./dashboard-visualization-transpose-table";
import { replaceTimeSpanParams } from "./sql-time-utils";
import type { TimeSpan } from "./timespan-selector";
import { useRefreshable } from "./use-refreshable";

// SQL utility functions for table sorting and pagination
function replaceOrderByClause(
  sql: string,
  orderByColumn: string | null,
  orderDirection: "asc" | "desc" | null
): string {
  if (!orderByColumn || !orderDirection) {
    // Remove ORDER BY clause if sorting is cleared
    return sql.replace(
      /\s+ORDER\s+BY\s+[^\s]+(?:\s+(?:ASC|DESC))?(?:\s*,\s*[^\s]+\s+(?:ASC|DESC)?)*/gi,
      ""
    );
  }

  const orderByClause = `ORDER BY ${orderByColumn} ${orderDirection.toUpperCase()}`;
  const hasOrderBy = /\s+ORDER\s+BY\s+/i.test(sql);

  if (hasOrderBy) {
    const replaceRegex =
      /\s+ORDER\s+BY\s+[^\s]+(?:\s+(?:ASC|DESC))?(?:\s*,\s*[^\s]+\s+(?:ASC|DESC)?)*(?=\s+LIMIT|\s*$)/gi;
    return sql.replace(replaceRegex, ` ${orderByClause}`);
  } else {
    const limitRegex = /\s+LIMIT\s+\d+/i;
    if (limitRegex.test(sql)) {
      limitRegex.lastIndex = 0;
      return sql.replace(limitRegex, ` ${orderByClause}$&`);
    } else {
      return sql.trim() + ` ${orderByClause}`;
    }
  }
}

function applyLimitOffset(sql: string, limit: number, offset: number): string {
  const trimmed = sql.trim();
  const trailingLimitRegex = /\s+LIMIT\s+\d+(?:\s+OFFSET\s+\d+)?\s*$/i;
  if (trailingLimitRegex.test(trimmed)) {
    return trimmed.replace(trailingLimitRegex, ` LIMIT ${limit} OFFSET ${offset}`);
  }
  return `${trimmed} LIMIT ${limit} OFFSET ${offset}`;
}

interface DashboardPanelProps {
  descriptor: PanelDescriptor;
  selectedTimeSpan?: TimeSpan;
  initialLoading?: boolean;
  onRef?: (ref: DashboardPanelComponent | null) => void;
  onCollapsedChange?: (isCollapsed: boolean) => void;
  onTimeSpanSelect?: (timeSpan: TimeSpan) => void;
  className?: string;
}

/**
 * Refactored DashboardPanel facade component.
 * Single unified facade that handles data fetching, layout, and lifecycle management.
 * Delegates rendering to pure visualization components based on descriptor.type.
 *
 * Currently supports: table, pie, transpose-table, timeseries (refactored)
 * Legacy support: stat (using old components)
 */
export const DashboardPanelNew = forwardRef<DashboardPanelComponent, DashboardPanelProps>(
  function DashboardPanelNew(props, ref) {
    const { descriptor, initialLoading = false, onCollapsedChange } = props;

    // Defensive check
    if (!descriptor || !descriptor.type) {
      return <pre>Invalid descriptor: {JSON.stringify(descriptor, null, 2)}</pre>;
    }

    // For non-refactored types, use old components
    if (
      descriptor.type !== "table" &&
      descriptor.type !== "pie" &&
      descriptor.type !== "transpose-table" &&
      descriptor.type !== "line" &&
      descriptor.type !== "bar" &&
      descriptor.type !== "area"
    ) {
      // Legacy path - use old components
      if (descriptor.type === "stat") {
        return (
          <DashboardPanelStat
            ref={props.onRef}
            descriptor={descriptor as StatDescriptor}
            selectedTimeSpan={props.selectedTimeSpan}
            initialLoading={initialLoading}
            onCollapsedChange={onCollapsedChange}
          />
        );
      }

      return null;
    }

    // Refactored path - unified facade for table, pie, transpose-table, timeseries
    return (
      <UnifiedFacade
        ref={ref}
        descriptor={
          descriptor as
            | TableDescriptor
            | PieDescriptor
            | TransposeTableDescriptor
            | TimeseriesDescriptor
        }
        selectedTimeSpan={props.selectedTimeSpan}
        initialLoading={initialLoading}
        onCollapsedChange={onCollapsedChange}
      />
    );
  }
);

DashboardPanelNew.displayName = "DashboardPanelNew";

/**
 * UnifiedFacade: Single facade component for all refactored visualization types
 * Handles data fetching, lifecycle, and conditional rendering of visualization components
 */
interface UnifiedFacadeProps {
  descriptor: TableDescriptor | PieDescriptor | TransposeTableDescriptor | TimeseriesDescriptor;
  selectedTimeSpan?: TimeSpan;
  initialLoading?: boolean;
  onCollapsedChange?: (isCollapsed: boolean) => void;
  onTimeSpanSelect?: (timeSpan: TimeSpan) => void;
  className?: string;
}

const UnifiedFacade = forwardRef<DashboardPanelComponent, UnifiedFacadeProps>(
  function UnifiedFacade(props, ref) {
    const { descriptor, initialLoading = false, onCollapsedChange } = props;
    const { connection } = useConnection();

    // State - unified for all visualization types
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [meta, setMeta] = useState<Array<{ name: string; type?: string }>>([]);
    const [isLoading, setIsLoading] = useState(initialLoading);
    const [error, setError] = useState("");
    const [executedSql, setExecutedSql] = useState<string>("");

    // Table-specific state
    const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" | null }>({
      column: "",
      direction: null,
    });
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMorePages, setHasMorePages] = useState(true);

    // Refs
    const apiCancellerRef = useRef<AbortController | null>(null);
    const tableVizRef = useRef<TableVisualizationRef>(null);
    const pieVizRef = useRef<PieVisualizationRef>(null);
    const transposeTableVizRef = useRef<TransposeTableVisualizationRef>(null);
    const timeseriesVizRef = useRef<TimeseriesVisualizationRef>(null);
    const lastRefreshParamRef = useRef<RefreshOptions>({});
    const sortRef = useRef(sort);
    const isRequestingMoreRef = useRef(false);

    // Load data function - unified for all types
    const loadData = useCallback(
      async (param: RefreshOptions, pageNumber: number = 0) => {
        if (!connection) {
          return;
        }

        const query = descriptor.query;
        if (!query) {
          return;
        }

        setIsLoading(true);
        // Don't clear error here - only clear it when we successfully get data
        // This prevents flickering when refreshing a chart that has an error

        // Cancel previous request if any
        if (apiCancellerRef.current) {
          apiCancellerRef.current.abort();
          apiCancellerRef.current = null;
        }

        try {
          lastRefreshParamRef.current = param;

          // Replace time span parameters
          let finalSql = query.sql;
          if (props.selectedTimeSpan) {
            // All types use replaceTimeSpanParams with timezone
            finalSql = replaceTimeSpanParams(
              finalSql,
              props.selectedTimeSpan,
              connection.metadata?.timezone || "UTC"
            );
          } else {
            finalSql = finalSql.replace(/{timeFilter}/g, "");
            finalSql = finalSql.replace(/{timeFilter:String}/g, "");
          }

          // Apply table-specific transformations
          if (descriptor.type === "table") {
            const tableDescriptor = descriptor as TableDescriptor;

            // Apply server-side sorting if enabled
            if (
              tableDescriptor.sortOption?.serverSideSorting &&
              sortRef.current.column &&
              sortRef.current.direction
            ) {
              finalSql = replaceOrderByClause(
                finalSql,
                sortRef.current.column,
                sortRef.current.direction
              );
            }

            // Apply pagination
            if (tableDescriptor.pagination?.mode === "server") {
              const pageSize = tableDescriptor.pagination.pageSize;
              finalSql = applyLimitOffset(finalSql, pageSize, pageNumber * pageSize);
            }
          }

          setExecutedSql(finalSql);

          // Choose the right query method based on type
          const queryMethod =
            descriptor.type === "transpose-table" ? connection.query : connection.queryOnNode;

          const { response, abortController } = queryMethod.call(
            connection,
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

          apiCancellerRef.current = abortController;

          const apiResponse = await response;

          if (abortController.signal.aborted) {
            setIsLoading(false);
            isRequestingMoreRef.current = false;
            return;
          }

          // Check for HTTP errors
          if (apiResponse.httpStatus >= 400) {
            const errorData = apiResponse.data.json<QueryError>();
            setError(errorData.message || "Unknown error");
            setIsLoading(false);
            isRequestingMoreRef.current = false;
            return;
          }

          const responseData = apiResponse.data.json<{
            data?: Record<string, unknown>[];
            meta?: { name: string; type?: string }[];
          }>();

          const newData = responseData.data || [];
          const newMeta = responseData.meta || [];

          // Handle data based on type
          if (descriptor.type === "table") {
            const tableDescriptor = descriptor as TableDescriptor;
            if (tableDescriptor.pagination?.mode === "server") {
              if (pageNumber === 0) {
                // First page - replace data
                setData(newData);
                setMeta(newMeta);
              } else {
                // Subsequent pages - append data
                setData((prevData) => [...prevData, ...newData]);
              }

              // Check if there are more pages
              const pageSize = tableDescriptor.pagination.pageSize;
              setHasMorePages(newData.length >= pageSize);
            } else {
              // No pagination or client-side pagination
              setData(newData);
              setMeta(newMeta);
            }
          } else {
            // Pie, transpose-table, and timeseries - just set data
            setData(newData);
            setMeta(newMeta);
          }

          // Clear error on successful data load
          setError("");
          setIsLoading(false);
          isRequestingMoreRef.current = false;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
          setError(err instanceof Error ? err.message : "Unknown error");
          setIsLoading(false);
          isRequestingMoreRef.current = false;
        }
      },
      [connection, descriptor, props.selectedTimeSpan]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshOptions) => {
        if (!descriptor.query) {
          return;
        }

        // Reset pagination state on refresh
        setCurrentPage(0);
        setHasMorePages(true);
        isRequestingMoreRef.current = false;

        loadData(param, 0);
      },
      [descriptor.query, loadData]
    );

    // Get initial parameters for refreshable hook
    const getInitialParams = useCallback(() => {
      return props.selectedTimeSpan
        ? ({ selectedTimeSpan: props.selectedTimeSpan } as RefreshOptions)
        : ({} as RefreshOptions);
    }, [props.selectedTimeSpan]);

    // Use the refreshable hook
    const { componentRef, isCollapsed, setIsCollapsed, refresh, getLastRefreshParameter } =
      useRefreshable({
        initialCollapsed: descriptor.collapsed ?? false,
        refreshInternal,
        getInitialParams,
        onCollapsedChange,
      });

    // Expose component ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
      getLastRefreshOptions: getLastRefreshParameter, // Alias for compatibility
    }));

    // Table-specific handlers
    const handleSortChange = useCallback(
      (column: string, direction: "asc" | "desc" | null) => {
        if (descriptor.type !== "table") return;

        const newSort = { column, direction };
        setSort(newSort);
        sortRef.current = newSort;

        const tableDescriptor = descriptor as TableDescriptor;
        if (tableDescriptor.sortOption?.serverSideSorting) {
          const lastParams = lastRefreshParamRef.current;
          const refreshParam: RefreshOptions = {
            ...lastParams,
            inputFilter: `sort_${Date.now()}_${newSort.column}_${newSort.direction}`,
          };
          refresh(refreshParam);
        }
      },
      [descriptor, refresh]
    );

    const handleRequestMoreData = useCallback(() => {
      if (descriptor.type !== "table") return;
      if (!hasMorePages || isLoading || isRequestingMoreRef.current) {
        return;
      }

      isRequestingMoreRef.current = true;
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      loadData(lastRefreshParamRef.current, nextPage);
    }, [descriptor.type, hasMorePages, isLoading, currentPage, loadData]);

    // Common handlers
    const handleShowQuery = useCallback(() => {
      showQueryDialog(descriptor.query, descriptor.titleOption?.title, executedSql);
    }, [descriptor.query, descriptor.titleOption, executedSql]);

    const handleRefresh = useCallback(() => {
      const lastParams = getLastRefreshParameter();
      refresh({ ...lastParams, forceRefresh: true });
    }, [getLastRefreshParameter, refresh]);

    // Handler for showing raw data dialog (for timeseries)
    const handleShowRawData = useCallback(() => {
      if (data.length === 0) {
        Dialog.alert({
          title: "No Data",
          description: "There is no data to display.",
        });
        return;
      }

      // Get columns from meta if available, otherwise from data keys
      const columns = meta.length > 0 ? meta.map((m) => m.name) : Object.keys(data[0] || {});

      Dialog.showDialog({
        title: descriptor.titleOption?.title || "Query Result",
        className: "max-w-[80vw]",
        mainContent: (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b">
                  {columns.map((colName) => (
                    <th key={colName} className="p-2 text-left whitespace-nowrap font-semibold">
                      {colName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b hover:bg-muted/50">
                    {columns.map((colName) => {
                      const value = row[colName];
                      const displayValue =
                        value === null || value === undefined ? "-" : String(value);
                      return (
                        <td key={colName} className="p-2 align-middle whitespace-nowrap">
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      });
    }, [data, meta, descriptor.titleOption?.title]);

    // Get dropdown items - combine facade-level items with visualization-specific items
    const getDropdownItems = useCallback(() => {
      // Get visualization-specific dropdown items (without "Show query")
      let vizItems = null;
      if (descriptor.type === "table") {
        vizItems = tableVizRef.current?.getDropdownItems();
      } else if (descriptor.type === "pie") {
        vizItems = pieVizRef.current?.getDropdownItems();
      } else if (descriptor.type === "transpose-table") {
        vizItems = transposeTableVizRef.current?.getDropdownItems();
      } else if (
        descriptor.type === "line" ||
        descriptor.type === "bar" ||
        descriptor.type === "area"
      ) {
        vizItems = timeseriesVizRef.current?.getDropdownItems();
      }

      // Combine with facade-level "Show query" item
      return (
        <>
          {descriptor.query?.sql && (
            <DashboardDropdownMenuItem onClick={handleShowQuery}>
              Show query
            </DashboardDropdownMenuItem>
          )}
          {vizItems}
        </>
      );
    }, [descriptor.type, descriptor.query, handleShowQuery]);

    // Render visualization based on type
    const renderVisualization = () => {
      if (descriptor.type === "table") {
        return (
          <TableVisualization
            ref={tableVizRef}
            data={data}
            meta={meta}
            descriptor={descriptor as TableDescriptor}
            isLoading={isLoading}
            error={error}
            selectedTimeSpan={props.selectedTimeSpan}
            onSortChange={handleSortChange}
            onRequestMoreData={handleRequestMoreData}
            hasMorePages={hasMorePages}
          />
        );
      }

      if (descriptor.type === "pie") {
        return (
          <PieVisualization
            ref={pieVizRef}
            data={data}
            meta={meta}
            descriptor={descriptor as PieDescriptor}
            isLoading={isLoading}
            error={error}
            selectedTimeSpan={props.selectedTimeSpan}
          />
        );
      }

      if (descriptor.type === "transpose-table") {
        // Transpose table expects a single row object, not an array
        const singleRowData = data.length > 0 ? data[0] : null;
        return (
          <TransposeTableVisualization
            ref={transposeTableVizRef}
            data={singleRowData}
            descriptor={descriptor as TransposeTableDescriptor}
            isLoading={isLoading}
            error={error}
          />
        );
      }

      if (descriptor.type === "line" || descriptor.type === "bar" || descriptor.type === "area") {
        return (
          <TimeseriesVisualization
            ref={timeseriesVizRef}
            data={data}
            meta={meta}
            descriptor={descriptor as TimeseriesDescriptor}
            isLoading={isLoading}
            error={error}
            selectedTimeSpan={props.selectedTimeSpan}
            onTimeSpanSelect={props.onTimeSpanSelect}
            onShowRawData={handleShowRawData}
          />
        );
      }

      return null;
    };

    return (
      <DashboardPanelLayout
        componentRef={componentRef}
        className={props.className}
        isLoading={isLoading}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        titleOption={descriptor.titleOption}
        getDropdownItems={getDropdownItems}
        onRefresh={handleRefresh}
      >
        {renderVisualization()}
      </DashboardPanelLayout>
    );
  }
);

UnifiedFacade.displayName = "UnifiedFacade";

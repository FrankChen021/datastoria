"use client";

import { CardContent } from "@/components/ui/card";
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { QueryError } from "@/lib/connection/connection";
import { useConnection } from "@/lib/connection/connection-context";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { showQueryDialog } from "./dashboard-dialog-utils";
import type { FieldOption, SQLQuery, TableDescriptor } from "./dashboard-model";
import type { DashboardPanelComponent, RefreshOptions } from "./dashboard-panel-layout";
import { DashboardPanelLayout } from "./dashboard-panel-layout";
import { DataTable, type DataTableRef } from "./data-table";
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

function applyLimitOffset(sql: string, limit: number, offset: number): string {
  // Prefer replacing a trailing LIMIT/OFFSET clause if present.
  const trimmed = sql.trim();
  const trailingLimitRegex = /\s+LIMIT\s+\d+(?:\s+OFFSET\s+\d+)?\s*$/i;
  if (trailingLimitRegex.test(trimmed)) {
    return trimmed.replace(trailingLimitRegex, ` LIMIT ${limit} OFFSET ${offset}`);
  }
  return `${trimmed} LIMIT ${limit} OFFSET ${offset}`;
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
    const [hasMorePages, setHasMorePages] = useState(true);
    const [currentPage, setCurrentPage] = useState(0);
    const [sort, setSort] = useState<{ column: string | null; direction: "asc" | "desc" | null }>({
      column: descriptor.sortOption?.initialSort?.column || null,
      direction: descriptor.sortOption?.initialSort?.direction || null,
    });
    const [executedSql, setExecutedSql] = useState<string>("");

    // Refs
    const apiCancellerRef = useRef<AbortController | null>(null);
    // Ref to store current sort state for synchronous access in loadData
    const sortRef = useRef<{ column: string | null; direction: "asc" | "desc" | null }>({
      column: descriptor.sortOption?.initialSort?.column || null,
      direction: descriptor.sortOption?.initialSort?.direction || null,
    });
    // Ref to store refresh function
    const refreshRef = useRef<((param: RefreshOptions) => void) | null>(null);
    const lastRefreshParamRef = useRef<RefreshOptions>({});
    const loadingRef = useRef(false);
    // Ref to prevent duplicate scroll requests for pagination
    const isRequestingMoreRef = useRef(false);
    // Ref to the DataTable component for controlling scroll position
    const dataTableRef = useRef<DataTableRef>(null);

    // Keep sortRef in sync with sort state
    useEffect(() => {
      sortRef.current = sort;
    }, [sort]);

    // Load data from API
    const loadData = useCallback(
      async (param: RefreshOptions = {}, pageNumber: number = 0) => {
        if (!connection) {
          setError("No connection selected");
          return;
        }

        if (!descriptor.query) {
          setError("No query defined for this table component.");
          return;
        }

        if (loadingRef.current) {
          return;
        }
        loadingRef.current = true;

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
          // IMPORTANT: This must be done BEFORE applying server-side sorting to ensure all replacement
          // variables are replaced before SQL manipulation (like adding ORDER BY clause)
          let finalSql = replaceTimeSpanParams(query.sql, param.selectedTimeSpan, connection.metadata.timezone);

          // Replace other common replacement variables that might be in the SQL query
          // These replacements should happen before any SQL manipulation (ORDER BY, LIMIT, etc.)
          // Replace {filterExpression:String} with "1=1" if not provided (default to no filter)
          finalSql = finalSql.replace(/{filterExpression:String}/g, "1=1");
          // Replace {timeFilter:String} with empty string if not provided (time filtering handled by {from:String}/{to:String})
          finalSql = finalSql.replace(/{timeFilter:String}/g, "");

          // Apply server-side sorting if enabled
          // Use sortRef for synchronous access to current sort state
          if (descriptor.sortOption?.serverSideSorting && sortRef.current.column && sortRef.current.direction) {
            finalSql = replaceOrderByClause(finalSql, sortRef.current.column, sortRef.current.direction);
          }

          // Apply pagination (server mode)
          if (descriptor.pagination?.mode === "server") {
            const pageSize = descriptor.pagination.pageSize;
            finalSql = applyLimitOffset(finalSql, pageSize, pageNumber * pageSize);
          }

          setExecutedSql(finalSql);

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

            const responseData = apiResponse.data.json<{ data?: Record<string, unknown>[]; meta?: { name: string; type?: string }[] }>();

            // JSON format returns { meta: [...], data: [...], rows: number, statistics: {...} }
            const rows = responseData.data || [];
            const meta = responseData.meta || [];

            setMeta(meta);
            if (pageNumber === 0) {
              setData(rows as Record<string, unknown>[]);
            } else {
              setData((prev) => [...prev, ...(rows as Record<string, unknown>[])]);
            }
            if (descriptor.pagination?.mode === "server") {
              const pageSize = descriptor.pagination.pageSize;
              setHasMorePages(Array.isArray(rows) && rows.length === pageSize);
            }
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
        } finally {
          loadingRef.current = false;
          isRequestingMoreRef.current = false;
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

        // Reset pagination on refresh
        lastRefreshParamRef.current = param;
        setHasMorePages(true);
        setCurrentPage(0);
        isRequestingMoreRef.current = false;
        // Reset scroll position to top
        dataTableRef.current?.resetScroll();
        // Don't clear data here - keep existing data visible while loading new data
        // The loadData function will replace it when new data arrives (pageNumber === 0)
        loadData(param, 0);
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
        // IMPORTANT: Preserve lastRefreshParamRef to ensure replacement variables are replaced correctly
        if (descriptor.sortOption?.serverSideSorting && refreshRef.current) {
          const lastParams = lastRefreshParamRef.current;
          const refreshParam: RefreshOptions = {
            ...lastParams,
            inputFilter: `sort_${Date.now()}_${newSort.column}_${newSort.direction}`,
          };
          refreshRef.current(refreshParam);
        }
      },
      [descriptor.sortOption]
    );

    // Handle table scroll events for infinite scroll pagination
    const handleTableScroll = useCallback(
      (scrollMetrics: { scrollTop: number; scrollHeight: number; clientHeight: number; isNearBottom: boolean }) => {
        if (descriptor.pagination?.mode !== "server") {
          return;
        }

        // Prevent duplicate requests
        if (!hasMorePages || isLoading || isRequestingMoreRef.current) {
          return;
        }

        if (scrollMetrics.scrollHeight <= scrollMetrics.clientHeight) {
          return;
        }

        // Check if scrolled near bottom
        if (scrollMetrics.isNearBottom) {
          // Set ref immediately to prevent duplicate requests
          isRequestingMoreRef.current = true;
          const nextPage = currentPage + 1;
          setCurrentPage(nextPage);
          loadData(lastRefreshParamRef.current, nextPage);
        }
      },
      [descriptor.pagination?.mode, hasMorePages, isLoading, currentPage, loadData]
    );

    // Component for rendering show/hide columns submenu
    const RenderShowColumns = () => {
      const scrollRef = useRef<HTMLDivElement>(null);
      const [showTopArrow, setShowTopArrow] = useState(false);
      const [showBottomArrow, setShowBottomArrow] = useState(false);
      
      // Track column visibility state locally for immediate UI updates
      const [localColumns, setLocalColumns] = useState<Array<{ name: string; title: string; isVisible: boolean }>>(dataTableRef.current?.getAllColumns() || []);

      const checkScrollPosition = useCallback(() => {
        const element = scrollRef.current;
        if (!element) return;

        const { scrollTop, scrollHeight, clientHeight } = element;

        // Show top arrow if we can scroll up
        setShowTopArrow(scrollTop > 5);

        // Show bottom arrow if we can scroll down
        setShowBottomArrow(scrollTop < scrollHeight - clientHeight - 5);
      }, []);

      useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;

        // Check initial state
        checkScrollPosition();

        // Add scroll listener
        element.addEventListener("scroll", checkScrollPosition);

        // Also check when content changes (ResizeObserver)
        const resizeObserver = new ResizeObserver(checkScrollPosition);
        resizeObserver.observe(element);

        return () => {
          element.removeEventListener("scroll", checkScrollPosition);
          resizeObserver.disconnect();
        };
      }, [checkScrollPosition]);

      const handleToggleColumn = useCallback((columnName: string) => {
        // Update DataTable visibility
        dataTableRef.current?.toggleColumnVisibility(columnName);
        
        // Update local state for immediate UI feedback
        setLocalColumns((prev) => 
          prev.map((col) => 
            col.name === columnName ? { ...col, isVisible: !col.isVisible } : col
          )
        );
      }, []);

      return (
        <div
          className="relative"
          // Suppress event propagation to parent that causes the header to be clicked
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          {showTopArrow && (
            <div className="absolute top-0 left-0 right-0 z-10 flex justify-center bg-gradient-to-b from-popover to-transparent h-6 items-start">
              <ArrowUp className="h-3 w-3 text-muted-foreground mt-1" />
            </div>
          )}

          <div
            ref={scrollRef}
            className="max-h-[60vh] overflow-y-auto"
            style={{ scrollbarGutter: "stable" }}
          >
            {localColumns.map((col, index) => {
              return (
                <DropdownMenuItem
                  key={index}
                  onClick={(e) => {
                    handleToggleColumn(col.name);

                    // Stop progress to the parent element which triggers the collapse/expand
                    e.stopPropagation();

                    // No need to close the popup as we may want to show/hide multiple columns
                    e.preventDefault();
                  }}
                >
                  <Check className={cn("h-4 w-4", col.isVisible ? "opacity-100" : "opacity-0")} />
                  {col.title}
                </DropdownMenuItem>
              );
            })}
          </div>

          {showBottomArrow && (
            <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-center bg-gradient-to-t from-popover to-transparent h-6 items-end">
              <ArrowDown className="h-3 w-3 text-muted-foreground mb-1" />
            </div>
          )}
        </div>
      );
    };

    // Handler for showing query dialog
    const handleShowQuery = useCallback(() => {
      showQueryDialog(descriptor.query, descriptor.titleOption?.title, executedSql);
    }, [descriptor.query, descriptor.titleOption, executedSql]);

    // Build dropdown menu items
    const dropdownItems = (
      <>
        {descriptor.query?.sql && <DropdownMenuItem onClick={handleShowQuery}>Show query</DropdownMenuItem>}
        <DropdownMenuSub>
          {/* Stop event propagation so that DropdownMenu will not be closed if clicked */}
          <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>Show/Hide Columns</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <RenderShowColumns />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </>
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
            ref={dataTableRef}
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
            enableIndexColumn={descriptor.miscOption?.enableIndexColumn}
            enableShowRowDetail={descriptor.miscOption?.enableShowRowDetail}
            enableClientSorting={!descriptor.sortOption?.serverSideSorting}
            enableCompactMode={descriptor.miscOption?.enableCompactMode ?? false}
            pagination={
              descriptor.pagination?.mode === "server"
                ? { mode: "server", pageSize: descriptor.pagination.pageSize, hasMorePages }
                : undefined
            }
            onTableScroll={descriptor.pagination?.mode === "server" ? handleTableScroll : undefined}
            className="h-full border-0 rounded-none"
          />
        </CardContent>
      </DashboardPanelLayout>
    );
  }
);

DashboardPanelTable.displayName = "DashboardPanelTable";

export default DashboardPanelTable;

"use client";

import { CardContent } from "@/components/ui/card";
import {
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DashboardDropdownMenuItem,
  DashboardDropdownMenuSubTrigger,
} from "./dashboard-dropdown-menu-item";
import type { FieldOption, TableDescriptor } from "./dashboard-model";
import type { VisualizationRef } from "./dashboard-visualization-layout";
import { DataTable, type DataTableRef } from "./data-table";
import type { TimeSpan } from "./timespan-selector";

// SQL utility function for table sorting
function replaceOrderByClause(
  sql: string,
  orderByColumn: string | null,
  orderDirection: "asc" | "desc" | null
): string {
  if (!orderByColumn || !orderDirection) {
    // Remove ORDER BY clause if sorting is cleared
    // This regex looks for ORDER BY followed by one or more column expressions
    // until it hits a LIMIT clause or the end of the string.
    const removeRegex =
      /\s+ORDER\s+BY\s+[^\s]+(?:\s+(?:ASC|DESC))?(?:\s*,\s*[^\s]+\s+(?:ASC|DESC)?)*(?=\s+LIMIT|\s*$)/gi;
    return sql.replace(removeRegex, "");
  }

  const orderByClause = `ORDER BY ${orderByColumn} ${orderDirection.toUpperCase()}`;
  const hasOrderBy = /\s+ORDER\s+BY\s+/i.test(sql);

  if (hasOrderBy) {
    // Replace the existing ORDER BY clause
    const replaceRegex =
      /\s+ORDER\s+BY\s+[^\s]+(?:\s+(?:ASC|DESC))?(?:\s*,\s*[^\s]+\s+(?:ASC|DESC)?)*(?=\s+LIMIT|\s*$)/gi;
    return sql.replace(replaceRegex, ` ${orderByClause}`);
  }

  // If no ORDER BY exists, add it before LIMIT if present, otherwise at the end
  const limitRegex = /\s+LIMIT\s+\d+/i;
  if (limitRegex.test(sql)) {
    return sql.replace(limitRegex, ` ${orderByClause}$&`);
  }

  return sql.trim() + ` ${orderByClause}`;
}

// SQL utility function for pagination
function applyLimitOffset(sql: string, limit: number, offset: number): string {
  const trimmed = sql.trim();
  const limitOffsetClause = ` LIMIT ${limit} OFFSET ${offset}`;

  // Check if there's an existing LIMIT/OFFSET clause
  const trailingLimitRegex = /\s+LIMIT\s+\d+(?:\s+OFFSET\s+\d+)?\s*(?=SETTINGS|$)/i;
  if (trailingLimitRegex.test(trimmed)) {
    // Replace existing LIMIT/OFFSET
    return trimmed.replace(trailingLimitRegex, limitOffsetClause);
  }

  // Check if there's a SETTINGS clause - LIMIT/OFFSET must come before SETTINGS
  const settingsRegex = /\s+SETTINGS\s+/i;
  if (settingsRegex.test(trimmed)) {
    // Insert LIMIT/OFFSET before SETTINGS
    return trimmed.replace(settingsRegex, `${limitOffsetClause}$&`);
  }

  // No SETTINGS clause, append LIMIT/OFFSET at the end
  return `${trimmed}${limitOffsetClause}`;
}

export interface TableVisualizationProps {
  // Data from facade
  data: Record<string, unknown>[];
  meta: Array<{ name: string; type?: string }>;
  descriptor: TableDescriptor;
  selectedTimeSpan?: TimeSpan;

  // Callbacks to facade
  onSortChange?: (column: string, direction: "asc" | "desc" | null) => void;
  onLoadData?: (pageNumber: number) => Promise<void> | void;

  // Loading state from facade
  isLoading?: boolean;

  // Additional props
  className?: string;
}

export interface TableVisualizationRef extends VisualizationRef {
  resetPagination: () => void; // Override to make it required for table
}

/**
 * Pure table visualization component.
 * Receives data as props and handles only rendering and UI interactions.
 * No data fetching, no useConnection, no useRefreshable.
 */
export const TableVisualization = React.forwardRef<TableVisualizationRef, TableVisualizationProps>(
  function TableVisualization(props, ref) {
    const { data, meta, descriptor, onSortChange, onLoadData, isLoading, className } = props;

    // State
    const [sort, setSort] = useState<{ column: string | null; direction: "asc" | "desc" | null }>({
      column: descriptor.sortOption?.initialSort?.column || null,
      direction: descriptor.sortOption?.initialSort?.direction || null,
    });

    // Use a ref to store the latest sort state to avoid stale closures in exposed methods
    const sortRef = useRef(sort);

    // Sync ref with state
    useEffect(() => {
      sortRef.current = sort;
    }, [sort]);

    // Pagination state (moved from facade)
    const currentPageRef = useRef(0);
    const prevDataLengthRef = useRef(0);
    const isRequestingMoreRef = useRef(false);

    // Compute hasMorePages from data length and pageSize
    // We track the previous data length to determine if the last loaded page was complete
    const hasMorePages = useMemo(() => {
      if (descriptor.pagination?.mode !== "server") {
        return true; // Not applicable for client-side pagination
      }

      const pageSize = descriptor.pagination.pageSize;

      // If we have no data yet, assume there might be pages
      if (data.length === 0) {
        return true;
      }

      // For the first page, check if we got a full page
      // If data.length >= pageSize, we got a full page, so there might be more
      if (prevDataLengthRef.current === 0) {
        return data.length >= pageSize;
      }

      // For subsequent pages, check if the last page load added a full page
      // If the increment >= pageSize, the last page was full, so there might be more pages
      // If the increment < pageSize, the last page was incomplete, so no more pages
      const dataIncrement = data.length - prevDataLengthRef.current;
      return dataIncrement >= pageSize;
    }, [data.length, descriptor.pagination?.mode, descriptor.pagination?.pageSize]);

    // Note: prevDataLengthRef is updated in handleTableScroll when loading new pages
    // We don't update it automatically on data changes to preserve the previous length
    // for computing the increment

    // Refs
    const dataTableRef = useRef<DataTableRef>(null);

    // Optimize fieldOptions computation - only recompute when descriptor.fieldOptions changes
    const fieldOptionsArray = useMemo(() => {
      if (!descriptor.fieldOptions) return [];
      const options: FieldOption[] = [];
      if (descriptor.fieldOptions instanceof Map) {
        for (const [key, value] of descriptor.fieldOptions) {
          options.push({ ...value, name: key });
        }
      } else {
        for (const [key, value] of Object.entries(descriptor.fieldOptions)) {
          options.push({ ...value, name: key });
        }
      }
      return options;
    }, [descriptor.fieldOptions]);

    // Handle sort change from DataTable
    const handleSortChange = useCallback(
      (column: string, direction: "asc" | "desc" | null) => {
        const newSort = { column, direction };
        // Update ref immediately to avoid stale closures in following logic
        sortRef.current = newSort;
        setSort(newSort);

        // Notify facade if server-side sorting is enabled
        if (descriptor.sortOption?.serverSideSorting && onSortChange) {
          onSortChange(column, direction);
        }
      },
      [descriptor.sortOption, onSortChange]
    );

    // Handle table scroll events for infinite scroll pagination
    const handleTableScroll = useCallback(
      (scrollMetrics: {
        scrollTop: number;
        scrollHeight: number;
        clientHeight: number;
        distanceToBottom: number;
      }) => {
        if (descriptor.pagination?.mode !== "server") {
          return;
        }

        if (!hasMorePages || isRequestingMoreRef.current) {
          return;
        }

        if (scrollMetrics.scrollHeight <= scrollMetrics.clientHeight) {
          return;
        }

        // Check if scrolled near bottom (within 150px threshold)
        const threshold = descriptor.miscOption?.enableCompactMode ? 50 : 150;
        if (scrollMetrics.distanceToBottom < threshold && onLoadData) {
          isRequestingMoreRef.current = true;
          const nextPage = currentPageRef.current + 1;
          // Store previous data length before loading to compute increment later
          // Update synchronously so hasMorePages computation uses correct previous length
          prevDataLengthRef.current = data.length;
          const result = onLoadData(nextPage);
          // Handle both sync and async callbacks
          if (result instanceof Promise) {
            result
              .then(() => {
                // Update currentPage after data loads successfully
                currentPageRef.current = nextPage;
              })
              .finally(() => {
                isRequestingMoreRef.current = false;
              });
          } else {
            // For sync callbacks, update immediately
            currentPageRef.current = nextPage;
            isRequestingMoreRef.current = false;
          }
        }
      },
      [descriptor.pagination?.mode, hasMorePages, onLoadData, data.length]
    );

    // Component for rendering show/hide columns submenu
    const RenderShowColumns = () => {
      const scrollRef = useRef<HTMLDivElement>(null);
      const [showTopArrow, setShowTopArrow] = useState(false);
      const [showBottomArrow, setShowBottomArrow] = useState(false);

      // Track column visibility state locally for immediate UI updates
      const [localColumns, setLocalColumns] = useState<
        Array<{ name: string; title: string; isVisible: boolean }>
      >(dataTableRef.current?.getAllColumns() || []);

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
          prev.map((col) => (col.name === columnName ? { ...col, isVisible: !col.isVisible } : col))
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
                <DashboardDropdownMenuItem
                  key={index}
                  onClick={(e) => {
                    handleToggleColumn(col.name);

                    // Stop progress to the parent element which triggers the collapse/expand
                    e.stopPropagation();

                    // No need to close the popup as we may want to show/hide multiple columns
                    e.preventDefault();
                  }}
                >
                  <Check className={cn("!h-3 !w-3", col.isVisible ? "opacity-100" : "opacity-0")} />
                  {col.title}
                </DashboardDropdownMenuItem>
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

    // Reset pagination state
    const resetPagination = useCallback(() => {
      currentPageRef.current = 0;
      // Reset prevDataLengthRef so hasMorePages computation works correctly for first page
      prevDataLengthRef.current = 0;
      isRequestingMoreRef.current = false;
      // Reset scroll position to top so user sees the first page
      dataTableRef.current?.resetScroll();
    }, []);

    // Prepare SQL for data fetching (applies sort and pagination if server-side is enabled)
    const prepareDataFetchSql = useCallback(
      (sql: string, pageNumber: number = 0): string => {
        let finalSql = sql;
        const currentSort = sortRef.current;

        // Apply server-side sorting if enabled
        if (
          descriptor.sortOption?.serverSideSorting &&
          currentSort.column &&
          currentSort.direction
        ) {
          finalSql = replaceOrderByClause(finalSql, currentSort.column, currentSort.direction);
        }

        // Apply pagination if server-side pagination is enabled
        if (descriptor.pagination?.mode === "server") {
          const pageSize = descriptor.pagination.pageSize;
          finalSql = applyLimitOffset(finalSql, pageSize, pageNumber * pageSize);
        }

        return finalSql;
      },
      [
        descriptor.sortOption?.serverSideSorting,
        descriptor.pagination?.mode,
        descriptor.pagination?.pageSize,
      ]
    );

    // Expose methods via ref (must be after RenderShowColumns is defined)
    React.useImperativeHandle(ref, () => ({
      getDropdownItems: () => {
        if (dataTableRef.current === null || dataTableRef.current.getAllColumns().length == 0) {
          return null;
        }
        return (
          <>
            <DropdownMenuSub>
              <DashboardDropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                Show/Hide Columns
              </DashboardDropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <RenderShowColumns />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </>
        );
      },
      resetPagination,
      prepareDataFetchSql,
    }));

    return (
      <CardContent
        className="px-0 p-0 h-full overflow-hidden"
        // Support descriptor.height for special cases like drilldown dialogs (uses vh units)
        // For normal dashboard panels, height is controlled by gridPos.h instead
        style={
          descriptor.height
            ? ({ maxHeight: `${descriptor.height}vh` } as React.CSSProperties)
            : undefined
        }
      >
        <DataTable
          ref={dataTableRef}
          data={data}
          meta={meta}
          fieldOptions={fieldOptionsArray}
          actions={descriptor.actions}
          sort={sort}
          onSortChange={handleSortChange}
          // Pass down so that the data will show loading state for inifinte page loading
          isLoading={isLoading}
          enableIndexColumn={descriptor.miscOption?.enableIndexColumn}
          enableShowRowDetail={descriptor.miscOption?.enableShowRowDetail}
          enableClientSorting={!descriptor.sortOption?.serverSideSorting}
          enableCompactMode={descriptor.miscOption?.enableCompactMode ?? false}
          pagination={
            descriptor.pagination?.mode === "server"
              ? {
                  mode: "server",
                  pageSize: descriptor.pagination.pageSize,
                  hasMorePages,
                }
              : undefined
          }
          onTableScroll={descriptor.pagination?.mode === "server" ? handleTableScroll : undefined}
          className={cn("h-full border-0 rounded-none", className)}
        />
      </CardContent>
    );
  }
);

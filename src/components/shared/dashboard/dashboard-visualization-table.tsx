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
import { DataTable, type DataTableRef } from "./data-table";
import type { TimeSpan } from "./timespan-selector";

export interface TableVisualizationProps {
  // Data from facade
  data: Record<string, unknown>[];
  meta: Array<{ name: string; type?: string }>;
  descriptor: TableDescriptor;
  isLoading: boolean;
  error: string;
  selectedTimeSpan?: TimeSpan;

  // Callbacks to facade
  onSortChange?: (column: string, direction: "asc" | "desc" | null) => void;
  onRequestMoreData?: () => void;

  // Pagination state from facade (for server-side pagination)
  hasMorePages?: boolean;

  // Additional props
  className?: string;
}

export interface TableVisualizationRef {
  resetScroll: () => void;
  getAllColumns: () => Array<{ name: string; title: string; isVisible: boolean }>;
  toggleColumnVisibility: (columnName: string) => void;
  getDropdownItems: () => React.ReactNode;
}

/**
 * Pure table visualization component.
 * Receives data as props and handles only rendering and UI interactions.
 * No data fetching, no useConnection, no useRefreshable.
 */
export const TableVisualization = React.forwardRef<TableVisualizationRef, TableVisualizationProps>(
  function TableVisualization(props, ref) {
    const {
      data,
      meta,
      descriptor,
      isLoading,
      error,
      selectedTimeSpan,
      onSortChange,
      onRequestMoreData,
      hasMorePages,
      className,
    } = props;

    // State
    const [sort, setSort] = useState<{ column: string | null; direction: "asc" | "desc" | null }>({
      column: descriptor.sortOption?.initialSort?.column || null,
      direction: descriptor.sortOption?.initialSort?.direction || null,
    });

    // Refs
    const dataTableRef = useRef<DataTableRef>(null);

    // Handle sort change from DataTable
    const handleSortChange = useCallback(
      (column: string, direction: "asc" | "desc" | null) => {
        const newSort = { column, direction };
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
        isNearBottom: boolean;
      }) => {
        if (descriptor.pagination?.mode !== "server") {
          return;
        }

        if (!hasMorePages || isLoading) {
          return;
        }

        if (scrollMetrics.scrollHeight <= scrollMetrics.clientHeight) {
          return;
        }

        // Check if scrolled near bottom
        if (scrollMetrics.isNearBottom && onRequestMoreData) {
          onRequestMoreData();
        }
      },
      [descriptor.pagination?.mode, hasMorePages, isLoading, onRequestMoreData]
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
                  <Check className={cn("h-3 w-3", col.isVisible ? "opacity-100" : "opacity-0")} />
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

    // Expose methods via ref (must be after RenderShowColumns is defined)
    React.useImperativeHandle(ref, () => ({
      resetScroll: () => dataTableRef.current?.resetScroll(),
      getAllColumns: () => dataTableRef.current?.getAllColumns() || [],
      toggleColumnVisibility: (columnName: string) =>
        dataTableRef.current?.toggleColumnVisibility(columnName),
      getDropdownItems: () => (
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
      ),
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
              ? {
                  mode: "server",
                  pageSize: descriptor.pagination.pageSize,
                  hasMorePages: hasMorePages ?? true,
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

TableVisualization.displayName = "TableVisualization";

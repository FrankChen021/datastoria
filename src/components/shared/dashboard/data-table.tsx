import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Formatter, type FormatName } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, ChevronUp, Loader2 } from "lucide-react";
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDebouncedCallback } from "use-debounce";
import type { ActionColumn, FieldOption } from "./dashboard-model";
import { SKELETON_FADE_DURATION, SKELETON_MIN_DISPLAY_TIME } from "./dashboard-visualization-panel";
import { inferFormatFromMetaType } from "./format-inference";

// Hoisted static JSX elements to avoid recreation on every render
const sortAscIcon = <ChevronUp className="inline-block w-3 h-3 ml-1" />;
const sortDescIcon = <ChevronDown className="inline-block w-3 h-3 ml-1" />;

// Props for the memoized row component
interface DataTableRowProps {
  row: Record<string, unknown>;
  rowIndex: number;
  isExpanded: boolean;
  isSelected: boolean;
  enableShowRowDetail: boolean;
  enableIndexColumn: boolean;
  enableCompactMode: boolean;
  visibleColumns: FieldOption[];
  onRowClick?: (row: Record<string, unknown>) => void;
  onToggleExpansion: (rowIndex: number) => void;
  formatCellValue: (
    value: unknown,
    fieldOption: FieldOption,
    context?: Record<string, unknown>
  ) => React.ReactNode;
  getCellAlignmentClass: (fieldOption: FieldOption) => string;
  additionalProps?: React.HTMLAttributes<HTMLTableRowElement> & { "data-index"?: number };
}

// Memoized row component to prevent unnecessary re-renders
const DataTableRow = memo(function DataTableRow({
  row,
  rowIndex,
  isExpanded,
  isSelected,
  enableShowRowDetail,
  enableIndexColumn,
  enableCompactMode,
  visibleColumns,
  onRowClick,
  onToggleExpansion,
  formatCellValue,
  getCellAlignmentClass,
  additionalProps,
}: DataTableRowProps) {
  const cellPaddingClass = enableCompactMode ? "!py-0.5" : "!p-2";

  const handleRowClick = useCallback(() => {
    if (!enableShowRowDetail && onRowClick) {
      onRowClick(row);
    }
  }, [enableShowRowDetail, onRowClick, row]);

  const handleToggleExpansion = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpansion(rowIndex);
    },
    [onToggleExpansion, rowIndex]
  );

  return (
    <>
      <TableRow
        className={cn(
          onRowClick && !enableShowRowDetail && "cursor-pointer",
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
        )}
        onClick={handleRowClick}
        {...additionalProps}
      >
        {enableShowRowDetail && (
          <TableCell
            className={cn("text-center whitespace-nowrap py-0 pl-2 pr-0", cellPaddingClass)}
          >
            <button
              type="button"
              onClick={handleToggleExpansion}
              className="inline-flex items-center justify-center rounded px-0 p-1 transition-colors"
              aria-label={isExpanded ? "Collapse row" : "Expand row"}
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isExpanded && "rotate-90"
                )}
              />
            </button>
          </TableCell>
        )}
        {enableIndexColumn && (
          <TableCell className={cn("text-center whitespace-nowrap", cellPaddingClass)}>
            {rowIndex + 1}
          </TableCell>
        )}
        {visibleColumns.map((fieldOption) => {
          if (!fieldOption.name) return null;

          if (fieldOption.renderAction) {
            return (
              <TableCell
                key={fieldOption.name}
                className={cn(
                  getCellAlignmentClass(fieldOption),
                  "whitespace-nowrap",
                  cellPaddingClass
                )}
              >
                {fieldOption.renderAction(row, rowIndex)}
              </TableCell>
            );
          }

          return (
            <TableCell
              key={fieldOption.name}
              className={cn(
                getCellAlignmentClass(fieldOption),
                "whitespace-nowrap",
                cellPaddingClass
              )}
            >
              {formatCellValue(row[fieldOption.name], fieldOption, row)}
            </TableCell>
          );
        })}
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-muted/30">
          <TableCell className="!p-0"></TableCell>
          {enableIndexColumn && <TableCell className="!p-0"></TableCell>}
          <TableCell colSpan={visibleColumns.length} className="!p-0">
            <div className="bg-background border-l">
              <table className="w-full text-xs">
                <tbody>
                  {visibleColumns.map((fieldOption, index) => {
                    if (!fieldOption.name || fieldOption.renderAction) return null;
                    return (
                      <tr
                        key={fieldOption.name}
                        className={cn(
                          "border-b last:border-b-0",
                          index % 2 === 0 ? "bg-muted/20" : "bg-background"
                        )}
                      >
                        <td className="font-medium px-2 py-1 w-[180px] align-top text-muted-foreground">
                          {fieldOption.title || fieldOption.name}
                        </td>
                        <td className="px-2 py-1">
                          {formatCellValue(row[fieldOption.name], fieldOption, row)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
});

export type DataTablePagination = {
  mode: "client" | "server";
  pageSize: number;
  /**
   * Whether there are more pages available (server pagination). Managed by the parent.
   * If omitted, defaults to true.
   */
  hasMorePages?: boolean;
};

/**
 * Methods exposed by DataTable via ref
 */
export interface DataTableRef {
  /**
   * Reset scroll position to top
   */
  resetScroll: () => void;
  /**
   * Get all columns with their visibility state
   */
  getAllColumns: () => Array<{ name: string; title: string; isVisible: boolean }>;
  /**
   * Toggle column visibility by name
   */
  toggleColumnVisibility: (columnName: string) => void;
}

export interface DataTableProps {
  // Data to display
  data: Record<string, unknown>[];
  // Server metadata for column inference
  meta: { name: string; type?: string }[];
  // Field options configuration
  fieldOptions: FieldOption[];
  // Action columns configuration (optional)
  actions?: ActionColumn[];
  // Loading state
  isLoading?: boolean;
  // Error message
  error?: string;
  // Enable index column
  enableIndexColumn?: boolean;
  // Current sort state (controlled)
  sort?: { column: string | null; direction: "asc" | "desc" | null };
  // Default sort state (uncontrolled)
  defaultSort?: { column: string | null; direction: "asc" | "desc" | null };
  // Callback when sort changes
  onSortChange?: (column: string, direction: "asc" | "desc" | null) => void;
  // Class name for the container
  className?: string;
  // Row click handler
  onRowClick?: (row: Record<string, unknown>) => void;
  // Enable client-side sorting (default: true)
  enableClientSorting?: boolean;
  // Enable sticky header (default: false)
  stickyHeader?: boolean;
  // Highlight the selected row
  selectedRowId?: string | number | null;
  // Field to use as unique identifier for selection (default: 'id')
  idField?: string;
  // Class name for the header row
  headerClassName?: string;
  /**
   * Optional pagination config. Currently only server mode is supported.
   */
  pagination?: DataTablePagination;
  /**
   * Called when the table is scrolled (for implementing infinite scroll, etc.)
   * Provides scroll metrics to the parent component
   */
  onTableScroll?: (scrollMetrics: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    distanceToBottom: number;
  }) => void;
  /**
   * Enable expandable rows with transposed detail view (default: false)
   * When enabled, shows an expand/collapse button that reveals row data in a transposed format
   */
  enableShowRowDetail?: boolean;
  /**
   * Enable compact mode for table cells (default: false)
   * When enabled, applies p-1 padding to cells instead of p-2
   */
  enableCompactMode?: boolean;
}

export const DataTable = forwardRef<DataTableRef, DataTableProps>(function DataTable(
  {
    data,
    meta,
    fieldOptions,
    actions,
    isLoading = false,
    error,
    enableIndexColumn = false,
    sort: controlledSort,
    defaultSort,
    onSortChange,
    className,
    onRowClick,
    enableClientSorting = true,
    stickyHeader = false,
    selectedRowId,
    idField = "id",
    headerClassName,
    pagination,
    onTableScroll,
    enableShowRowDetail = false,
    enableCompactMode = false,
  }: DataTableProps,
  ref
) {
  // Virtualization constants
  // Always use virtualization to avoid scroll position jumps when data grows
  // (e.g., during infinite scroll when crossing a threshold)
  const ESTIMATED_ROW_HEIGHT = 33; // Height of a table row in pixels
  const OVERSCAN_COUNT = 50; // Render extra rows above/below viewport for smoother scrolling

  // Skeleton timing state
  const [shouldShowSkeleton, setShouldShowSkeleton] = useState(false);
  const [skeletonOpacity, setSkeletonOpacity] = useState(1);
  const skeletonStartTimeRef = useRef<number | null>(null);
  const skeletonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Internal sort state for uncontrolled mode
  const [internalSort, setInternalSort] = useState<{
    column: string | null;
    direction: "asc" | "desc" | null;
  }>(defaultSort || { column: null, direction: null });

  // Use controlled sort if provided, otherwise internal sort
  const sort = controlledSort !== undefined ? controlledSort : internalSort;

  // Ref for virtualization scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const paginationPageSize = pagination?.pageSize;

  // Row expansion state
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Column visibility state - all columns visible by default
  const [columnVisibility, setColumnVisibility] = useState<Map<string, boolean>>(new Map());

  // Toggle row expansion
  const toggleRowExpansion = useCallback((rowIndex: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  // Calculate columns based on props
  const columns = useMemo(() => {
    // If no meta provided, we can't infer columns (unless data has keys, but let's rely on meta for now as per requirement)
    if (!meta || meta.length === 0) {
      return [];
    }

    // Normalize fieldOptions
    const fieldOptionsMap = new Map<string, FieldOption>();
    fieldOptions.forEach((option) => {
      if (option.name) {
        fieldOptionsMap.set(option.name, option);
      }
    });

    // Normalize actions
    const actionColumns = actions ?? [];

    // Strategy:
    // 1. Start with all server columns in their natural order
    // 2. Apply field options overrides from descriptor where they match
    // 3. Only reorder columns that have a position property
    // 4. Columns without position maintain their natural order from server response
    const finalColumns: FieldOption[] = [];

    // First, build columns from server response in natural order, applying field options
    meta.forEach((colMeta: { name: string; type?: string }, originalIndex: number) => {
      const fieldOption = fieldOptionsMap.get(colMeta.name);
      const column: FieldOption = fieldOption
        ? { ...fieldOption, name: colMeta.name }
        : ({ name: colMeta.name } as FieldOption);

      // Store original index to preserve natural order for fields without position
      (column as FieldOption & { originalIndex: number }).originalIndex = originalIndex;
      finalColumns.push(column);
    });

    // Only reorder if there are fields with position property
    const hasPositionedFields = finalColumns.some(
      (col) => col.position !== undefined && col.position >= 0
    );
    if (hasPositionedFields) {
      // Separate columns with position from those without
      // Note: columns with negative positions are excluded from positioning logic
      const positionedColumns: (FieldOption & { originalIndex: number })[] = [];
      const nonPositionedColumns: (FieldOption & { originalIndex: number })[] = [];

      finalColumns.forEach((col) => {
        const colWithIndex = col as FieldOption & { originalIndex: number };
        // Only include columns with non-negative positions in positioning logic
        if (col.position !== undefined && col.position >= 0) {
          positionedColumns.push(colWithIndex);
        } else if (col.position === undefined) {
          // Only include columns without position (not negative positions)
          nonPositionedColumns.push(colWithIndex);
        }
        // Columns with negative positions are excluded from both arrays
      });

      // Sort positioned columns by position value, then by original index if positions are equal
      positionedColumns.sort((a, b) => {
        const posA = a.position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.position ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) {
          return posA - posB;
        }
        // If positions are equal, maintain natural order
        return a.originalIndex - b.originalIndex;
      });

      // Sort non-positioned columns by their original index to maintain natural order
      nonPositionedColumns.sort((a, b) => a.originalIndex - b.originalIndex);

      // Build final column order: position means "desired column number" (1-indexed)
      // Convert to 0-indexed for array operations: position 2 = index 1
      const result: (FieldOption & { originalIndex: number })[] = [];

      // Create a map of position (1-indexed) -> column(s) for quick lookup
      const positionMap = new Map<number, (FieldOption & { originalIndex: number })[]>();
      positionedColumns.forEach((col) => {
        const pos = col.position!;
        if (!positionMap.has(pos)) {
          positionMap.set(pos, []);
        }
        positionMap.get(pos)!.push(col);
      });

      // Track which non-positioned columns we've used
      const usedNonPositioned = new Set<FieldOption & { originalIndex: number }>();

      // Determine the maximum position we need to consider
      const maxPosition =
        positionedColumns.length > 0 ? Math.max(...positionedColumns.map((c) => c.position!)) : 0;
      const totalNeeded = Math.max(maxPosition, finalColumns.length);

      // Build result array: for each position from 1 to totalNeeded (1-indexed),
      // check if there's a positioned column, otherwise use the next non-positioned column
      for (let pos = 1; pos <= totalNeeded && result.length < finalColumns.length; pos++) {
        const positionedCols = positionMap.get(pos);
        if (positionedCols && positionedCols.length > 0) {
          // Place positioned column(s) at this position (1-indexed)
          result.push(...positionedCols);
        } else {
          // Find the next unused non-positioned column in order
          const nextNonPositioned = nonPositionedColumns.find((col) => !usedNonPositioned.has(col));
          if (nextNonPositioned) {
            result.push(nextNonPositioned);
            usedNonPositioned.add(nextNonPositioned);
          }
        }
      }

      // Add any remaining positioned columns that had positions beyond what we processed
      positionedColumns.forEach((col) => {
        if (!result.includes(col)) {
          result.push(col);
        }
      });

      // Add any remaining non-positioned columns that weren't placed
      nonPositionedColumns.forEach((col) => {
        if (!usedNonPositioned.has(col)) {
          result.push(col);
        }
      });

      finalColumns.length = 0;
      finalColumns.push(...result);
    }

    // Apply type inference to columns without format based on meta information
    // Create a map of column name to meta type for quick lookup
    const metaTypeMap = new Map<string, string>();
    meta.forEach((colMeta: { name: string; type?: string }) => {
      if (colMeta.type) {
        metaTypeMap.set(colMeta.name, colMeta.type);
      }
    });

    finalColumns.forEach((fieldOption) => {
      if (!fieldOption.format && fieldOption.name) {
        const typeString = metaTypeMap.get(fieldOption.name);
        const inferredFormat = inferFormatFromMetaType(typeString, fieldOption.name);
        if (inferredFormat) {
          fieldOption.format = inferredFormat as FormatName;
        }
      }
    });

    // Filter out columns with negative positions (these should be hidden)
    const visibleColumns = finalColumns.filter(
      (col) => col.position === undefined || col.position >= 0
    );

    // Add action columns - either at specified position or at the end
    // Separate action columns with position from those without
    const positionedActionColumns = actionColumns.filter((ac) => ac.position !== undefined);
    const nonPositionedActionColumns = actionColumns.filter((ac) => ac.position === undefined);

    // Insert positioned action columns at their specified positions (1-indexed)
    // Sort by position to insert from lowest to highest
    positionedActionColumns
      .sort((a, b) => a.position! - b.position!)
      .forEach((actionColumn, _) => {
        const actionFieldOption: FieldOption = {
          name: `__action_${actionColumns.indexOf(actionColumn)}__`, // Special name to identify action columns
          title: actionColumn.title || "Action",
          align: actionColumn.align || "center",
          sortable: false,
          renderAction: actionColumn.renderAction,
        };
        // Position is 1-indexed, convert to 0-indexed for array insertion
        // Clamp to valid range [0, visibleColumns.length]
        const insertIndex = Math.min(
          Math.max(0, actionColumn.position! - 1),
          visibleColumns.length
        );
        visibleColumns.splice(insertIndex, 0, actionFieldOption);
      });

    // Add non-positioned action columns at the end
    nonPositionedActionColumns.forEach((actionColumn) => {
      const actionFieldOption: FieldOption = {
        name: `__action_${actionColumns.indexOf(actionColumn)}__`, // Special name to identify action columns
        title: actionColumn.title || "Action",
        align: actionColumn.align || "center",
        sortable: false,
        renderAction: actionColumn.renderAction,
      };
      visibleColumns.push(actionFieldOption);
    });

    return visibleColumns;
  }, [meta, fieldOptions, actions]);

  // Filter columns based on visibility state
  const visibleColumns = useMemo(() => {
    return columns.filter((col) => {
      // Always show action columns
      if (col.name?.startsWith("__action_")) return true;
      // Show column if not explicitly hidden
      return columnVisibility.get(col.name!) !== false;
    });
  }, [columns, columnVisibility]);

  // Expose methods via ref
  useImperativeHandle(
    ref,
    () => ({
      resetScroll: () => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      },
      getAllColumns: () => {
        return columns
          .filter((col) => col.name && !col.name.startsWith("__action_"))
          .map((col) => ({
            name: col.name!,
            title: col.title || col.name!,
            isVisible: columnVisibility.get(col.name!) !== false,
          }));
      },
      toggleColumnVisibility: (columnName: string) => {
        setColumnVisibility((prev) => {
          const next = new Map(prev);
          const currentValue = next.get(columnName);
          next.set(columnName, currentValue === false ? true : false);
          return next;
        });
      },
    }),
    [columns, columnVisibility]
  );

  // Process data (sorting)
  const processedData = useMemo(() => {
    if (!enableClientSorting || !sort?.column || !sort.direction) {
      return data;
    }

    return [...data].sort((a, b) => {
      const column = sort.column!;
      let aValue: unknown = a[column];
      let bValue: unknown = b[column];

      // Handle null/undefined
      if (aValue == null) aValue = "";
      if (bValue == null) bValue = "";

      const toComparable = (v: unknown): number | string => {
        if (typeof v === "number") {
          return v;
        }
        if (typeof v === "bigint") {
          // Prefer numeric ordering even for big ints; convert to Number when safe, otherwise sort as stringified bigint.
          const asNumber = Number(v);
          return Number.isSafeInteger(asNumber) ? asNumber : v.toString();
        }
        if (typeof v === "string") {
          // Pure numeric strings (common for JSON-encoded UInt64/Int64)
          const numeric = v.match(/^-?\d+(?:\.\d+)?$/);
          if (numeric) {
            const n = Number(v);
            if (Number.isFinite(n)) {
              return n;
            }
          }

          return v;
        }
        if (typeof v === "boolean") {
          return v ? 1 : 0;
        }
        // Fall back to string compare for objects/arrays/etc.
        return String(v);
      };

      const aComp = toComparable(aValue);
      const bComp = toComparable(bValue);

      let comparison = 0;
      if (typeof aComp === "number" && typeof bComp === "number") {
        comparison = aComp - bComp;
      } else {
        comparison = String(aComp).localeCompare(String(bComp));
      }

      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [data, sort, enableClientSorting]);

  // Debounced scroll handler to prevent excessive calls and UI blocking
  const debouncedScrollHandler = useDebouncedCallback(
    (scrollMetrics: {
      scrollTop: number;
      scrollHeight: number;
      clientHeight: number;
      distanceToBottom: number;
    }) => {
      if (onTableScroll) {
        onTableScroll(scrollMetrics);
      }
    },
    100, // 100ms debounce delay
    { leading: true, trailing: true } // Fire on both leading and trailing edge for responsiveness
  );

  // Handle scroll events and notify parent via debounced callback
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;

      debouncedScrollHandler({
        scrollTop,
        scrollHeight,
        clientHeight,
        distanceToBottom,
      });
    },
    [debouncedScrollHandler]
  );

  // Skeleton timing logic
  useEffect(() => {
    const shouldShow = isLoading && processedData.length === 0;

    if (shouldShow) {
      if (skeletonStartTimeRef.current === null) {
        skeletonStartTimeRef.current = Date.now();
        setShouldShowSkeleton(true);
        setSkeletonOpacity(1);
      }
    } else {
      if (skeletonStartTimeRef.current !== null) {
        if (skeletonTimeoutRef.current) {
          clearTimeout(skeletonTimeoutRef.current);
          skeletonTimeoutRef.current = null;
        }

        const elapsed = Date.now() - skeletonStartTimeRef.current;

        if (elapsed < SKELETON_MIN_DISPLAY_TIME) {
          const remainingTime = SKELETON_MIN_DISPLAY_TIME - elapsed;
          skeletonTimeoutRef.current = setTimeout(() => {
            setSkeletonOpacity(0);
            setTimeout(() => {
              setShouldShowSkeleton(false);
              skeletonStartTimeRef.current = null;
            }, SKELETON_FADE_DURATION);
          }, remainingTime);
        } else {
          setSkeletonOpacity(0);
          setTimeout(() => {
            setShouldShowSkeleton(false);
            skeletonStartTimeRef.current = null;
          }, SKELETON_FADE_DURATION);
        }
      }
    }

    return () => {
      if (skeletonTimeoutRef.current) {
        clearTimeout(skeletonTimeoutRef.current);
        skeletonTimeoutRef.current = null;
      }
    };
  }, [isLoading, processedData.length]);

  // Handle column sorting
  const handleSort = useCallback(
    (fieldName: string) => {
      // Skip action columns
      if (fieldName.startsWith("__action_")) return;

      const fieldOption = visibleColumns.find((col) => col.name === fieldName);
      if (!fieldOption || fieldOption.sortable === false) return;

      let newDirection: "asc" | "desc" | null = "desc";

      if (sort?.column === fieldName) {
        if (sort.direction === "desc") {
          newDirection = "asc";
        } else if (sort.direction === "asc") {
          newDirection = null;
        }
      }

      // Update internal state if uncontrolled
      if (controlledSort === undefined) {
        setInternalSort({ column: fieldName, direction: newDirection });
      }

      // Notify parent
      onSortChange?.(fieldName, newDirection);
    },
    [visibleColumns, sort, onSortChange, controlledSort]
  );

  // Get sort icon - uses hoisted static JSX elements
  const getSortIcon = useCallback(
    (fieldName: string) => {
      const fieldOption = visibleColumns.find((col) => col.name === fieldName);
      if (!fieldOption || fieldOption.sortable === false) return null;

      if (sort?.column !== fieldName || !sort.direction) {
        return null;
      }

      if (sort.direction === "asc") {
        return sortAscIcon;
      }
      return sortDescIcon;
    },
    [visibleColumns, sort]
  );

  // Format cell value
  const formatCellValue = useCallback(
    (
      value: unknown,
      fieldOption: FieldOption,
      context?: Record<string, unknown>
    ): React.ReactNode => {
      if (
        (value === null ||
          value === undefined ||
          (typeof value === "string" && value.trim() === "")) &&
        !fieldOption.format
      ) {
        return <span className="text-muted-foreground">-</span>;
      }

      if (fieldOption.format) {
        let formatted: string | React.ReactNode;
        if (typeof fieldOption.format === "function") {
          formatted = fieldOption.format(value, fieldOption.formatArgs, context);
        } else {
          const formatter = Formatter.getInstance().getFormatter(fieldOption.format);
          if (!formatter) {
            console.error(`Formatter ${fieldOption.format} not found`);
            return <span className="text-muted-foreground">{String(value)}</span>;
          } else {
            formatted = formatter(value, fieldOption.formatArgs, context);
          }
        }

        if (formatted === "" || (typeof formatted === "string" && formatted.trim() === "")) {
          return <span className="text-muted-foreground">-</span>;
        }
        return formatted;
      }

      if (typeof value === "object") {
        return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
      }

      const stringValue = String(value);
      if (stringValue.trim() === "") {
        return <span className="text-muted-foreground">-</span>;
      }

      return <span>{stringValue}</span>;
    },
    []
  );

  // Get cell alignment class
  const getCellAlignmentClass = useCallback((fieldOption: FieldOption): string => {
    switch (fieldOption.align) {
      case "left":
        return "text-left";
      case "right":
        return "text-right";
      case "center":
        return "text-center";
      default:
        return "text-left";
    }
  }, []);

  // Virtualization setup - always enabled to avoid scroll jumps during infinite scroll
  const rowVirtualizer = useVirtualizer({
    count: processedData.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_COUNT,
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.includes("Firefox")
        ? undefined
        : (element) => element.getBoundingClientRect().height,
  });

  // Render helpers
  const renderError = () => {
    if (!error) return null;
    const colSpan =
      visibleColumns.length + (enableIndexColumn ? 1 : 0) + (enableShowRowDetail ? 1 : 0);
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="text-center text-destructive p-8">
          <div className="flex flex-col items-center justify-center h-[72px] gap-2">
            <p className="font-semibold">Error loading table data:</p>
            <p className="text-sm">{error}</p>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderLoading = () => {
    if (!shouldShowSkeleton) return null;
    return (
      <>
        {Array.from({ length: 10 }).map((_, index) => (
          <TableRow
            key={index}
            className="transition-opacity duration-150"
            style={{ opacity: skeletonOpacity }}
          >
            {enableShowRowDetail && (
              <TableCell className="text-center whitespace-nowrap !p-2">
                <Skeleton className="h-5 w-full" />
              </TableCell>
            )}
            {enableIndexColumn && (
              <TableCell className="text-center whitespace-nowrap !p-2">
                <Skeleton className="h-5 w-full" />
              </TableCell>
            )}
            {visibleColumns.map((fieldOption) => (
              <TableCell
                key={fieldOption.name}
                className={cn(getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
              >
                <Skeleton className="h-5 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  };

  const renderNoData = () => {
    if (error || shouldShowSkeleton || processedData.length > 0) return null;
    const colSpan =
      visibleColumns.length + (enableIndexColumn ? 1 : 0) + (enableShowRowDetail ? 1 : 0);
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="text-center text-muted-foreground p-8">
          <div className="flex items-center justify-center h-[72px]">No data found</div>
        </TableCell>
      </TableRow>
    );
  };

  const renderPaginationLoadingRow = () => {
    if (!pagination || pagination.mode !== "server") {
      return null;
    }
    // Show loading row when loading more data (not initial load)
    if (!isLoading || processedData.length === 0) {
      return null;
    }
    if (shouldShowSkeleton || error) {
      return null;
    }
    const colSpan =
      visibleColumns.length + (enableIndexColumn ? 1 : 0) + (enableShowRowDetail ? 1 : 0);
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="p-0 text-muted-foreground">
          {/* Sticky centers relative to the scroll viewport, not the full table width */}
          <div className="sticky left-1/2 w-max -translate-x-1/2 px-3 py-3 text-center">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading next {paginationPageSize} rows…</span>
            </span>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderData = () => {
    if (error || processedData.length === 0 || shouldShowSkeleton) return null;

    const virtualItems = rowVirtualizer.getVirtualItems();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom =
      virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
        : 0;

    return (
      <>
        {paddingTop > 0 && (
          <TableRow style={{ height: `${paddingTop}px` }}>
            <TableCell
              colSpan={
                visibleColumns.length + (enableIndexColumn ? 1 : 0) + (enableShowRowDetail ? 1 : 0)
              }
              className="!p-0 !border-0"
            />
          </TableRow>
        )}
        {virtualItems.map((virtualRow) => {
          const rowIndex = virtualRow.index;
          const row = processedData[rowIndex];
          if (!row) return null;

          return (
            <DataTableRow
              key={virtualRow.key}
              row={row}
              rowIndex={rowIndex}
              isExpanded={expandedRows.has(rowIndex)}
              isSelected={
                selectedRowId !== undefined &&
                selectedRowId !== null &&
                row[idField] === selectedRowId
              }
              enableShowRowDetail={enableShowRowDetail}
              enableIndexColumn={enableIndexColumn}
              enableCompactMode={enableCompactMode}
              visibleColumns={visibleColumns}
              onRowClick={onRowClick}
              onToggleExpansion={toggleRowExpansion}
              formatCellValue={formatCellValue}
              getCellAlignmentClass={getCellAlignmentClass}
              additionalProps={{
                "data-index": virtualRow.index,
                style: {
                  contain: "layout style paint",
                  contentVisibility: "auto",
                },
              }}
            />
          );
        })}
        {paddingBottom > 0 && (
          <TableRow style={{ height: `${paddingBottom}px` }}>
            <TableCell
              colSpan={
                visibleColumns.length + (enableIndexColumn ? 1 : 0) + (enableShowRowDetail ? 1 : 0)
              }
              className="!p-0 !border-0"
            />
          </TableRow>
        )}
      </>
    );
  };

  if (error && !isLoading && (!processedData || processedData.length === 0)) {
    return (
      <div className={cn("relative w-full h-full", className)}>
        <div
          ref={scrollContainerRef}
          className="w-full h-full overflow-auto flex items-center justify-center p-4"
        >
          <div className="flex flex-col items-center justify-center text-destructive gap-2 text-center">
            <p className="font-semibold">Error loading table data:</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const cellPaddingClass = enableCompactMode ? "!py-0.5" : "!p-2";
  const compactHeaderHeightClass = enableCompactMode ? "h-[33px]" : "";

  return (
    <div className={cn("relative w-full h-full", className)}>
      <div ref={scrollContainerRef} className="w-full h-full overflow-auto" onScroll={handleScroll}>
        <table
          className={cn("w-full caption-bottom", !enableCompactMode && "text-sm")}
          style={enableCompactMode ? { fontSize: "0.8rem", lineHeight: "1.25rem" } : undefined}
        >
          <TableHeader>
            <TableRow className={cn("hover:bg-muted/50 select-none", headerClassName)}>
              {enableShowRowDetail && (
                <TableHead
                  className={cn(
                    "w-[40px] text-center",
                    compactHeaderHeightClass,
                    cellPaddingClass,
                    stickyHeader &&
                      "sticky top-0 z-10 bg-background shadow-[0_1px_0_0_rgba(0,0,0,0.1)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.1)]"
                  )}
                >
                  {/* Empty header for expand/collapse column */}
                </TableHead>
              )}
              {enableIndexColumn && (
                <TableHead
                  className={cn(
                    "w-[50px] text-center",
                    compactHeaderHeightClass,
                    cellPaddingClass,
                    stickyHeader &&
                      "sticky top-0 z-10 bg-background shadow-[0_1px_0_0_rgba(0,0,0,0.1)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.1)]"
                  )}
                >
                  #
                </TableHead>
              )}
              {visibleColumns.map((fieldOption) => (
                <TableHead
                  key={fieldOption.name}
                  className={cn(
                    "whitespace-nowrap",
                    compactHeaderHeightClass,
                    cellPaddingClass,
                    getCellAlignmentClass(fieldOption),
                    fieldOption.sortable !== false && "cursor-pointer hover:bg-muted/50",
                    fieldOption.name === sort?.column &&
                      sort?.direction &&
                      "text-blue-600 dark:text-blue-400 font-medium",
                    stickyHeader &&
                      "sticky top-0 z-10 bg-background shadow-[0_1px_0_0_rgba(0,0,0,0.1)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.1)]"
                  )}
                  style={{
                    width: fieldOption.width,
                    minWidth: fieldOption.minWidth,
                  }}
                  onClick={() => fieldOption.name && handleSort(fieldOption.name)}
                >
                  {fieldOption.title || fieldOption.name}
                  {fieldOption.name && getSortIcon(fieldOption.name)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderError()}
            {renderLoading()}
            {renderNoData()}
            {renderData()}
            {renderPaginationLoadingRow()}
          </TableBody>
        </table>
      </div>
    </div>
  );
});

"use client";

import { Api, type ApiCanceller, type ApiErrorResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Formatter, type FormatName } from "../../lib/formatter";
import FloatingProgressBar from "../floating-progress-bar";
import { Card, CardContent, CardDescription, CardHeader } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import type { ActionColumn, FieldOption, SQLQuery, TableDescriptor } from "./chart-utils";
import { SKELETON_FADE_DURATION, SKELETON_MIN_DISPLAY_TIME } from "./constants";
import { inferFormatFromMetaType } from "./format-inference";
import type { RefreshableComponent, RefreshParameter } from "./refreshable-component";
import { replaceTimeSpanParams } from "./sql-time-utils";
import type { TimeSpan } from "./timespan-selector";
import { useRefreshable } from "./use-refreshable";

interface RefreshableTableComponentProps {
  // The table descriptor configuration
  descriptor: TableDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;

  // Used for generating links
  searchParams?: URLSearchParams;

  // Additional className for the Card component
  className?: string;

  // Initial loading state (useful for drilldown dialogs)
  initialLoading?: boolean;
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

const RefreshableTableComponent = forwardRef<RefreshableComponent, RefreshableTableComponentProps>(
  function RefreshableTableComponent(props, ref) {
    const { descriptor } = props;
    const { selectedConnection } = useConnection();

    // State
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [columns, setColumns] = useState<FieldOption[]>([]);
    const [isLoading, setIsLoading] = useState(props.initialLoading ?? false);
    const [error, setError] = useState("");
    const [sort, setSort] = useState<{ column: string | null; direction: "asc" | "desc" | null }>({
      column: descriptor.sortOption?.initialSort?.column || null,
      direction: descriptor.sortOption?.initialSort?.direction || null,
    });
    // Skeleton timing state for smooth transitions
    const [shouldShowSkeleton, setShouldShowSkeleton] = useState(false);
    const [skeletonOpacity, setSkeletonOpacity] = useState(1);
    // Refs
    const apiCancellerRef = useRef<ApiCanceller | null>(null);
    // Ref to store current sort state for synchronous access in loadData
    const sortRef = useRef<{ column: string | null; direction: "asc" | "desc" | null }>({
      column: descriptor.sortOption?.initialSort?.column || null,
      direction: descriptor.sortOption?.initialSort?.direction || null,
    });
    // Refs for skeleton timing
    const skeletonStartTimeRef = useRef<number | null>(null);
    const skeletonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Normalize fieldOptions: convert Map/Record to array of FieldOption, handling position ordering
    const normalizeFieldOptions = useCallback((): Map<string, FieldOption> => {
      const fieldOptionsMap = new Map<string, FieldOption>();

      if (descriptor.fieldOptions) {
        // Convert Record to Map if needed
        if (descriptor.fieldOptions instanceof Map) {
          descriptor.fieldOptions.forEach((value, key) => {
            fieldOptionsMap.set(key, { ...value, name: key });
          });
        } else {
          // It's a Record
          Object.entries(descriptor.fieldOptions).forEach(([key, value]) => {
            fieldOptionsMap.set(key, { ...value, name: key });
          });
        }
      }

      return fieldOptionsMap;
    }, [descriptor.fieldOptions]);

    // Normalize actions: convert single ActionColumn or array to array
    const normalizeActions = useCallback((): ActionColumn[] => {
      if (!descriptor.actions) {
        return [];
      }
      return Array.isArray(descriptor.actions) ? descriptor.actions : [descriptor.actions];
    }, [descriptor.actions]);

    // Initialize columns from descriptor (will be updated when data loads)
    useEffect(() => {
      // Columns will be set when data loads
      setColumns([]);
    }, [descriptor.fieldOptions]);

    // Keep sortRef in sync with sort state
    useEffect(() => {
      sortRef.current = sort;
    }, [sort]);

    // Skeleton timing logic: minimum display time + fade transition
    useEffect(() => {
      const shouldShow = isLoading && data.length === 0;

      if (shouldShow) {
        // Start showing skeleton
        if (skeletonStartTimeRef.current === null) {
          skeletonStartTimeRef.current = Date.now();
          setShouldShowSkeleton(true);
          setSkeletonOpacity(1);
        }
      } else {
        // Data loaded or loading stopped
        if (skeletonStartTimeRef.current !== null) {
          // Clear any existing timeout
          if (skeletonTimeoutRef.current) {
            clearTimeout(skeletonTimeoutRef.current);
            skeletonTimeoutRef.current = null;
          }

          const elapsed = Date.now() - skeletonStartTimeRef.current;

          if (elapsed < SKELETON_MIN_DISPLAY_TIME) {
            // Wait for minimum display time, then fade out
            const remainingTime = SKELETON_MIN_DISPLAY_TIME - elapsed;
            skeletonTimeoutRef.current = setTimeout(() => {
              // Start fade out
              setSkeletonOpacity(0);
              // After fade completes, hide skeleton
              setTimeout(() => {
                setShouldShowSkeleton(false);
                skeletonStartTimeRef.current = null;
              }, SKELETON_FADE_DURATION);
            }, remainingTime);
          } else {
            // Already shown long enough, fade out immediately
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
    }, [isLoading, data.length]);

    // Load data from API
    const loadData = useCallback(
      async (param: RefreshParameter) => {
        if (!selectedConnection) {
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
            apiCancellerRef.current.cancel();
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
          let finalSql = param.selectedTimeSpan ? replaceTimeSpanParams(query.sql, param.selectedTimeSpan) : query.sql;

          // Apply server-side sorting if enabled
          // Use sortRef for synchronous access to current sort state
          if (descriptor.sortOption?.serverSideSorting && sortRef.current.column && sortRef.current.direction) {
            finalSql = replaceOrderByClause(finalSql, sortRef.current.column, sortRef.current.direction);
          }

          // Create AbortController for cancellation
          const abortController = new AbortController();
          const canceller: ApiCanceller = {
            cancel: () => {
              abortController.abort();
            },
          };
          apiCancellerRef.current = canceller;

          const api = Api.create(selectedConnection);

          try {
            const response = await api.executeAsync(
              {
                sql: finalSql,
                headers: {
                  "Content-Type": "text/plain",
                  ...query.headers,
                },
                params: {
                  default_format: "JSON",
                  output_format_json_quote_64bit_integers: 0,
                  ...query.params,
                },
              },
              abortController.signal
            );

            // Check if request was aborted
            if (abortController.signal.aborted) {
              setIsLoading(false);
              return;
            }

            const responseData = response.data;

            // JSON format returns { meta: [...], data: [...], rows: number, statistics: {...} }
            const rows = responseData.data || [];
            const meta = responseData.meta || [];

            // Build field options map from descriptor
            const fieldOptionsMap = normalizeFieldOptions();

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
            const hasPositionedFields = finalColumns.some((col) => col.position !== undefined && col.position >= 0);
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

            // Add action columns at the end
            const actions = normalizeActions();
            actions.forEach((actionColumn, index) => {
              const actionFieldOption: FieldOption = {
                name: `__action_${index}__`, // Special name to identify action columns
                title: actionColumn.title || "Action",
                align: actionColumn.align || "center",
                sortable: false,
                renderAction: actionColumn.renderAction,
              };
              finalColumns.push(actionFieldOption);
            });

            // Filter out columns with negative positions (these should be hidden)
            const visibleColumns = finalColumns.filter((col) => col.position === undefined || col.position >= 0);

            setColumns(visibleColumns);
            setData(rows as Record<string, unknown>[]);
            setError("");
            setIsLoading(false);
          } catch (error) {
            // Check if request was aborted
            if (abortController.signal.aborted) {
              setIsLoading(false);
              return;
            }

            // Handle ApiErrorResponse
            if (error && typeof error === "object" && "errorMessage" in error) {
              const apiError = error as ApiErrorResponse;
              const errorMessage = apiError.errorMessage || "Unknown error occurred";
              const lowerErrorMessage = errorMessage.toLowerCase();

              if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
                setIsLoading(false);
                return;
              }

              console.error("API Error:", apiError);
              setError(errorMessage);
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
      [descriptor, selectedConnection, normalizeFieldOptions, normalizeActions]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshParameter) => {
        if (!descriptor.query) {
          console.error(`No query defined for table [${descriptor.id}]`);
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
        ? ({ selectedTimeSpan: props.selectedTimeSpan } as RefreshParameter)
        : ({} as RefreshParameter);
    }, [props.selectedTimeSpan]);

    const { componentRef, isCollapsed, setIsCollapsed, refresh, getLastRefreshParameter } = useRefreshable({
      componentId: descriptor.id,
      initialCollapsed: descriptor.isCollapsed ?? false,
      refreshInternal,
      getInitialParams,
    });

    // Store refresh function in ref for use in handleSort
    const refreshRef = useRef(refresh);
    useEffect(() => {
      refreshRef.current = refresh;
    }, [refresh]);

    // Preserve inputFilter behavior: refresh when it changes
    useEffect(() => {
      const inputFilter =
        props.searchParams instanceof URLSearchParams ? props.searchParams.get("filter")?.toString() || "" : "";
      if (inputFilter) {
        refresh({ inputFilter, selectedTimeSpan: props.selectedTimeSpan });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.searchParams]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
    }));

    // Cleanup API canceller on unmount
    useEffect(() => {
      return () => {
        if (apiCancellerRef.current) {
          apiCancellerRef.current.cancel();
          apiCancellerRef.current = null;
        }
      };
    }, []);

    // Format cell value based on field option
    const formatCellValue = useCallback(
      (value: unknown, fieldOption: FieldOption, context?: Record<string, unknown>): React.ReactNode => {
        // Handle empty values: null, undefined, or empty string
        if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
          return <span className="text-muted-foreground">-</span>;
        }

        // Apply format if specified
        if (fieldOption.format) {
          let formatted: string | React.ReactNode;

          // Check if format is a function (ObjectFormatter) or a string (FormatName)
          if (typeof fieldOption.format === "function") {
            // It's an ObjectFormatter function - call it directly with context (row object)
            formatted = fieldOption.format(value, fieldOption.formatArgs, context);
          } else {
            // It's a FormatName string - use Formatter.getInstance()
            const formatter = Formatter.getInstance().getFormatter(fieldOption.format);
            // Pass args as params to the formatter (second parameter)
            formatted = formatter(value, fieldOption.formatArgs);
          }

          // If formatter returns empty string, show '-'
          if (formatted === "" || (typeof formatted === "string" && formatted.trim() === "")) {
            return <span className="text-muted-foreground">-</span>;
          }
          return formatted;
        }

        // Default formatting
        if (typeof value === "object") {
          return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
        }

        const stringValue = String(value);
        // If string conversion results in empty, show '-'
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

    // Handle column sorting
    const handleSort = useCallback(
      (fieldName: string) => {
        // Skip action columns (they have special names starting with __action_)
        if (fieldName.startsWith("__action_")) {
          return;
        }
        const fieldOption = columns.find((col) => col.name === fieldName);
        if (!fieldOption || fieldOption.sortable === false) {
          return;
        }

        let newSort: { column: string | null; direction: "asc" | "desc" | null };
        if (sort.column === fieldName) {
          // Cycle through: asc -> desc -> null
          if (sort.direction === "asc") {
            newSort = { column: fieldName, direction: "desc" };
          } else if (sort.direction === "desc") {
            newSort = { column: null, direction: null };
          } else {
            newSort = { column: fieldName, direction: "asc" };
          }
        } else {
          newSort = { column: fieldName, direction: "asc" };
        }

        // Update both state and ref synchronously
        setSort(newSort);
        sortRef.current = newSort;

        // If server-side sorting is enabled, trigger a refresh with the new sort
        if (descriptor.sortOption?.serverSideSorting) {
          const refreshParam = { inputFilter: `sort_${Date.now()}_${newSort.column}_${newSort.direction}` };
          refreshRef.current(refreshParam);
        }
      },
      [columns, sort, descriptor.sortOption]
    );

    // Get sort icon for column
    const getSortIcon = useCallback(
      (fieldName: string) => {
        const fieldOption = columns.find((col) => col.name === fieldName);
        if (!fieldOption || fieldOption.sortable === false) {
          return null;
        }

        if (sort.column !== fieldName) {
          return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
        }
        if (sort.direction === "asc") {
          return <ArrowUp className="inline-block w-4 h-4 ml-1" />;
        }
        if (sort.direction === "desc") {
          return <ArrowDown className="inline-block w-4 h-4 ml-1" />;
        }
        return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
      },
      [columns, sort]
    );

    // Sorted data - only apply client-side sorting if server-side sorting is disabled
    const sortedData = useMemo(() => {
      // If server-side sorting is enabled, return data as-is (already sorted by server)
      if (descriptor.sortOption?.serverSideSorting) {
        return data;
      }

      // Client-side sorting
      if (!sort.column || !sort.direction) {
        return data;
      }

      return [...data].sort((a, b) => {
        let aValue: unknown = a[sort.column!];
        let bValue: unknown = b[sort.column!];

        // Handle null/undefined values
        if (aValue == null) aValue = "";
        if (bValue == null) bValue = "";

        // Compare values
        let comparison = 0;
        if (typeof aValue === "number" && typeof bValue === "number") {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }

        return sort.direction === "asc" ? comparison : -comparison;
      });
    }, [data, sort, descriptor.sortOption]);

    // Render functions for TableBody
    const renderError = useCallback(() => {
      if (!error) return null;
      const colSpan = columns.length + (descriptor.showIndexColumn ? 1 : 0);
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
    }, [error, columns.length, descriptor.showIndexColumn]);

    const renderLoading = useCallback(() => {
      // Only show skeleton when shouldShowSkeleton is true (with timing logic)
      if (!shouldShowSkeleton) return null;
      return (
        <>
          {Array.from({ length: 1 }).map((_, index) => (
            <TableRow key={index} className="transition-opacity duration-150" style={{ opacity: skeletonOpacity }}>
              {descriptor.showIndexColumn && (
                <TableCell className="text-center whitespace-nowrap !p-2">
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              )}
              {columns.map((fieldOption) => (
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
    }, [shouldShowSkeleton, skeletonOpacity, columns, getCellAlignmentClass, descriptor.showIndexColumn]);

    const renderNoData = useCallback(() => {
      if (error || shouldShowSkeleton || data.length > 0) return null;
      const colSpan = columns.length + (descriptor.showIndexColumn ? 1 : 0);
      return (
        <TableRow>
          <TableCell colSpan={colSpan} className="text-center text-muted-foreground p-8">
            <div className="flex items-center justify-center h-[72px]">No data found</div>
          </TableCell>
        </TableRow>
      );
    }, [error, shouldShowSkeleton, data.length, columns.length, descriptor.showIndexColumn]);

    const renderData = useCallback(() => {
      // Don't show data while skeleton is visible (during minimum display time)
      // Don't hide data during refresh - keep showing existing data until new data arrives
      if (error || data.length === 0 || shouldShowSkeleton) return null;
      return (
        <>
          {sortedData.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {descriptor.showIndexColumn && (
                <TableCell className="text-center whitespace-nowrap !p-2">{rowIndex + 1}</TableCell>
              )}
              {columns.map((fieldOption) => {
                if (!fieldOption.name) return null;

                // Handle action columns
                if (fieldOption.renderAction) {
                  return (
                    <TableCell
                      key={fieldOption.name}
                      className={cn(getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                    >
                      {fieldOption.renderAction(row, rowIndex)}
                    </TableCell>
                  );
                }

                // Regular data columns
                const value = row[fieldOption.name];
                return (
                  <TableCell
                    key={fieldOption.name}
                    className={cn(getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                  >
                    {formatCellValue(value, fieldOption, row)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </>
      );
    }, [
      error,
      data.length,
      shouldShowSkeleton,
      sortedData,
      columns,
      getCellAlignmentClass,
      formatCellValue,
      descriptor.showIndexColumn,
    ]);

    const hasTitle = !!descriptor.titleOption && descriptor.titleOption?.showTitle !== false;
    const isStickyHeader = descriptor.headOption?.isSticky === true;

    // Render functions for direct table structure (when sticky header is enabled)
    const renderErrorDirect = useCallback(() => {
      if (!error) return null;
      const colSpan = columns.length + (descriptor.showIndexColumn ? 1 : 0);
      return (
        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
          <td colSpan={colSpan} className="p-4 align-middle text-center text-destructive !p-8">
            <div className="flex flex-col items-center justify-center h-[72px] gap-2">
              <p className="font-semibold">Error loading table data:</p>
              <p className="text-sm">{error}</p>
            </div>
          </td>
        </tr>
      );
    }, [error, columns.length, descriptor.showIndexColumn]);

    const renderLoadingDirect = useCallback(() => {
      // Only show skeleton when shouldShowSkeleton is true (with timing logic)
      if (!shouldShowSkeleton) return null;
      return (
        <>
          {Array.from({ length: 1 }).map((_, index) => (
            <tr
              key={index}
              className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted transition-opacity duration-150"
              style={{ opacity: skeletonOpacity }}
            >
              {descriptor.showIndexColumn && (
                <td className="p-4 align-middle text-center whitespace-nowrap !p-2">
                  <Skeleton className="h-5 w-full" />
                </td>
              )}
              {columns.map((fieldOption) => (
                <td
                  key={fieldOption.name}
                  className={cn("p-4 align-middle", getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                >
                  <Skeleton className="h-5 w-full" />
                </td>
              ))}
            </tr>
          ))}
        </>
      );
    }, [shouldShowSkeleton, skeletonOpacity, columns, getCellAlignmentClass, descriptor.showIndexColumn]);

    const renderNoDataDirect = useCallback(() => {
      if (error || shouldShowSkeleton || data.length > 0) return null;
      const colSpan = columns.length + (descriptor.showIndexColumn ? 1 : 0);
      return (
        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
          <td colSpan={colSpan} className="p-4 align-middle text-center text-muted-foreground !p-8">
            <div className="flex items-center justify-center h-[72px]">No data found</div>
          </td>
        </tr>
      );
    }, [error, shouldShowSkeleton, data.length, columns.length, descriptor.showIndexColumn]);

    const renderDataDirect = useCallback(() => {
      // Don't show data while skeleton is visible (during minimum display time)
      if (error || data.length === 0 || shouldShowSkeleton) return null;
      return (
        <>
          {sortedData.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
              {descriptor.showIndexColumn && (
                <td className="p-4 align-middle text-center whitespace-nowrap !p-2">{rowIndex + 1}</td>
              )}
              {columns.map((fieldOption) => {
                if (!fieldOption.name) return null;

                // Handle action columns
                if (fieldOption.renderAction) {
                  return (
                    <td
                      key={fieldOption.name}
                      className={cn("p-4 align-middle", getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                    >
                      {fieldOption.renderAction(row, rowIndex)}
                    </td>
                  );
                }

                // Regular data columns
                const value = row[fieldOption.name];
                // For percentage_bar format, don't apply whitespace-nowrap to allow the bar to render properly
                const shouldWrap = fieldOption.format === "percentage_bar";
                return (
                  <td
                    key={fieldOption.name}
                    className={cn(
                      "p-4 align-middle",
                      getCellAlignmentClass(fieldOption),
                      !shouldWrap && "whitespace-nowrap",
                      "!p-2"
                    )}
                  >
                    {formatCellValue(value, fieldOption, row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </>
      );
    }, [
      error,
      data.length,
      shouldShowSkeleton,
      sortedData,
      columns,
      getCellAlignmentClass,
      formatCellValue,
      descriptor.showIndexColumn,
    ]);

    return (
      <Card ref={componentRef} className={cn("@container/card relative overflow-hidden", props.className)}>
        <FloatingProgressBar show={isLoading} />
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
          {hasTitle && descriptor.titleOption && (
            <CardHeader className="p-0">
              <CollapsibleTrigger className="w-full">
                <div className={cn("flex items-center p-3 bg-muted/50 transition-colors gap-2 hover:bg-muted")}>
                  <ChevronRight
                    className={cn("h-4 w-4 transition-transform duration-200 shrink-0", !isCollapsed && "rotate-90")}
                  />
                  <div className="flex-1 text-left">
                    <CardDescription
                      className={cn(
                        descriptor.titleOption.align ? "text-" + descriptor.titleOption.align : "text-left",
                        "font-semibold text-foreground m-0"
                      )}
                    >
                      {descriptor.titleOption.title}
                    </CardDescription>
                    {descriptor.titleOption.description && (
                      <CardDescription className="text-xs mt-1 m-0">
                        {descriptor.titleOption.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </CollapsibleTrigger>
            </CardHeader>
          )}
          <CollapsibleContent>
            <CardContent
              className={cn("px-0 p-0", !isStickyHeader && "overflow-auto", isStickyHeader && "overflow-auto")}
              style={descriptor.height ? ({ maxHeight: `${descriptor.height}vh` } as React.CSSProperties) : undefined}
            >
              {isStickyHeader ? (
                // Use direct table structure for sticky header to avoid nested scroll containers
                <div className="relative w-full">
                  <table className="w-full caption-bottom text-sm">
                    <thead className={cn("[&_tr]:border-b sticky top-0 z-10 bg-background")}>
                      <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        {descriptor.showIndexColumn && (
                          <th className="px-4 text-center align-middle font-medium text-muted-foreground whitespace-nowrap h-10">
                            {shouldShowSkeleton ? <Skeleton className="h-5 w-20" /> : "#"}
                          </th>
                        )}
                        {columns.map((fieldOption) => {
                          if (!fieldOption.name) return null;

                          const fieldName = fieldOption.name;
                          const isSortable = fieldOption.sortable !== false && fieldOption.renderAction === undefined;
                          return (
                            <th
                              key={fieldName}
                              className={cn(
                                "px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
                                getCellAlignmentClass(fieldOption),
                                fieldOption.width && `w-[${fieldOption.width}px]`,
                                fieldOption.minWidth && `min-w-[${fieldOption.minWidth}px]`,
                                "whitespace-nowrap",
                                isSortable && "cursor-pointer hover:bg-muted/50 select-none h-10"
                              )}
                              style={{
                                width: fieldOption.width ? `${fieldOption.width}px` : undefined,
                                minWidth: fieldOption.minWidth ? `${fieldOption.minWidth}px` : undefined,
                              }}
                              onClick={() => isSortable && handleSort(fieldName)}
                            >
                              {shouldShowSkeleton ? (
                                <Skeleton className="h-5 w-20" />
                              ) : (
                                <>
                                  {fieldOption.title || fieldName}
                                  {isSortable && getSortIcon(fieldName)}
                                </>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {renderErrorDirect()}
                      {renderLoadingDirect()}
                      {renderNoDataDirect()}
                      {renderDataDirect()}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {descriptor.showIndexColumn && (
                        <TableHead className="px-4 text-center align-middle font-medium text-muted-foreground whitespace-nowrap h-10">
                          {shouldShowSkeleton ? <Skeleton className="h-5 w-20" /> : "#"}
                        </TableHead>
                      )}
                      {columns.map((fieldOption) => {
                        if (!fieldOption.name) return null;

                        const fieldName = fieldOption.name;
                        const isSortable = fieldOption.sortable !== false && fieldOption.renderAction === undefined;
                        return (
                          <TableHead
                            key={fieldName}
                            className={cn(
                              "px-4 align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
                              getCellAlignmentClass(fieldOption),
                              fieldOption.width && `w-[${fieldOption.width}px]`,
                              fieldOption.minWidth && `min-w-[${fieldOption.minWidth}px]`,
                              "whitespace-nowrap",
                              isSortable && "cursor-pointer hover:bg-muted/50 select-none h-10"
                            )}
                            style={{
                              width: fieldOption.width ? `${fieldOption.width}px` : undefined,
                              minWidth: fieldOption.minWidth ? `${fieldOption.minWidth}px` : undefined,
                            }}
                            onClick={() => isSortable && handleSort(fieldName)}
                          >
                            {shouldShowSkeleton ? (
                              <Skeleton className="h-5 w-20" />
                            ) : (
                              <>
                                {fieldOption.title || fieldName}
                                {isSortable && getSortIcon(fieldName)}
                              </>
                            )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renderError()}
                    {renderLoading()}
                    {renderNoData()}
                    {renderData()}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  }
);

RefreshableTableComponent.displayName = "RefreshableTableComponent";

export default RefreshableTableComponent;
export type { RefreshableTableComponentProps };

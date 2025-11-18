"use client";

import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { Formatter, type FormatName } from "@/lib/formatter";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CardContent } from "../ui/card";
import { DropdownMenuItem } from "../ui/dropdown-menu";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { SKELETON_FADE_DURATION, SKELETON_MIN_DISPLAY_TIME } from "./constants";
import { showQueryDialog } from "./dashboard-dialog-utils";
import type { FieldOption, SQLQuery, TransposeTableDescriptor } from "./dashboard-model";
import type { DashboardPanelComponent, RefreshOptions } from "./dashboard-panel-layout";
import { DashboardPanelLayout } from "./dashboard-panel-layout";
import { inferFieldFormat } from "./format-inference";
import { replaceTimeSpanParams } from "./sql-time-utils";
import type { TimeSpan } from "./timespan-selector";
import { useRefreshable } from "./use-refreshable";

interface DashboardPanelTransposedTableProps {
  // The transposed table descriptor configuration
  descriptor: TransposeTableDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;

  // Additional className for the Card component
  className?: string;

  // Initial loading state (useful for drilldown dialogs)
  initialLoading?: boolean;

  // Callback when collapsed state changes
  onCollapsedChange?: (isCollapsed: boolean) => void;
}

const DashboardPanelTransposedTable = forwardRef<DashboardPanelComponent, DashboardPanelTransposedTableProps>(
  function DashboardPanelTransposedTable(props, ref) {
    const { descriptor } = props;
    const { selectedConnection } = useConnection();

    // State
    const [data, setData] = useState<Record<string, unknown> | null>(null);
    const [isLoading, setIsLoading] = useState(props.initialLoading ?? false);
    const [error, setError] = useState("");
    // Store inferred formats for fields that don't have explicit formats
    const [inferredFormats, setInferredFormats] = useState<Map<string, FormatName>>(new Map());
    // Skeleton timing state for smooth transitions
    const [shouldShowSkeleton, setShouldShowSkeleton] = useState(false);
    const [skeletonOpacity, setSkeletonOpacity] = useState(1);

    // Refs
    const apiCancellerRef = useRef<ApiCanceller | null>(null);
    // Refs for skeleton timing
    const skeletonStartTimeRef = useRef<number | null>(null);
    const skeletonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Get field option for a given key
    const getFieldOption = useCallback(
      (key: string): FieldOption | undefined => {
        if (!descriptor.fieldOptions) {
          return undefined;
        }

        // Handle both Map and Record types
        if (descriptor.fieldOptions instanceof Map) {
          return descriptor.fieldOptions.get(key);
        } else {
          return descriptor.fieldOptions[key];
        }
      },
      [descriptor.fieldOptions]
    );

    // Load data from API
    const loadData = useCallback(
      async (param: RefreshOptions) => {
        if (!selectedConnection) {
          setError("No connection selected");
          return;
        }

        if (!descriptor.query) {
          setError("No query defined for this transposed table component.");
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

          // Replace time span template parameters in SQL
          const finalSql = param.selectedTimeSpan
            ? replaceTimeSpanParams(query.sql, param.selectedTimeSpan)
            : query.sql;

          const api = Api.create(selectedConnection);
          const canceller = api.executeSQL(
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
            (response: ApiResponse) => {
              try {
                const responseData = response.data;

                // JSON format returns { meta: [...], data: [...], rows: number, statistics: {...} }
                const rows = responseData.data || [];

                // For transposed table, we expect a single object (first row)
                if (rows.length > 0) {
                  const rowData = rows[0] as Record<string, unknown>;
                  setData(rowData);

                  // Infer formats for fields that don't have explicit formats
                  const formats = new Map<string, FormatName>();
                  const sampleRows = rows as Record<string, unknown>[];

                  Object.keys(rowData).forEach((key) => {
                    const fieldOption = getFieldOption(key);
                    // Only infer if no format is specified in the descriptor
                    if (!fieldOption?.format) {
                      const inferredFormat = inferFieldFormat(key, sampleRows);
                      if (inferredFormat) {
                        formats.set(key, inferredFormat);
                      }
                    }
                  });

                  setInferredFormats(formats);
                } else {
                  setData(null);
                  setInferredFormats(new Map());
                }
                setError("");
              } catch (err) {
                console.error("Error processing transposed table response:", err);
                const errorMessage = err instanceof Error ? err.message : String(err);
                setError(errorMessage);
              } finally {
                setIsLoading(false);
              }
            },
            (error: ApiErrorResponse) => {
              const errorMessage = error.errorMessage || "Unknown error occurred";
              const lowerErrorMessage = errorMessage.toLowerCase();
              if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
                setIsLoading(false);
                return;
              }

              console.error("API Error:", error);
              setError(errorMessage);
              setIsLoading(false);
            },
            () => {
              setIsLoading(false);
            }
          );

          apiCancellerRef.current = canceller;
        } catch (error) {
          const errorMessage = (error as Error).message || "Unknown error occurred";
          setError(errorMessage);
          setIsLoading(false);
          console.error(error);
        }
      },
      [descriptor, selectedConnection, getFieldOption]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshOptions) => {
        if (!descriptor.query) {
          console.error(`No query defined for transposed table [${descriptor.id}]`);
          setError("No query defined for this transposed table component.");
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

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
      getLastRefreshOptions: getLastRefreshParameter, // Alias for compatibility
    }));

    // Skeleton timing logic: minimum display time + fade transition
    useEffect(() => {
      const shouldShow = isLoading && data === null;

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
    }, [isLoading, data]);

    // Cleanup API canceller on unmount
    useEffect(() => {
      return () => {
        if (apiCancellerRef.current) {
          apiCancellerRef.current.cancel();
          apiCancellerRef.current = null;
        }
      };
    }, []);

    // Format cell value based on field options
    const formatCellValue = useCallback(
      (key: string, value: unknown): React.ReactNode => {
        // Handle empty values
        if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
          return <span className="text-muted-foreground">-</span>;
        }

        // Check if there's a field option for this key
        const fieldOption = getFieldOption(key);
        // Use explicit format from field option, or inferred format, or no format
        const format = fieldOption?.format || inferredFormats.get(key);

        if (format) {
          let formatted: string | React.ReactNode;

          // Check if format is a function (ObjectFormatter) or a string (FormatName)
          if (typeof format === "function") {
            // It's an ObjectFormatter function - call it directly
            formatted = format(value, fieldOption?.formatArgs);
          } else {
            // It's a FormatName string - use Formatter.getInstance()
            const formatter = Formatter.getInstance().getFormatter(format);
            formatted = formatter(value, fieldOption?.formatArgs);
          }

          // If formatter returns empty string, show '-'
          if (formatted === "" || (typeof formatted === "string" && formatted.trim() === "")) {
            return <span className="text-muted-foreground">-</span>;
          }
          return formatted;
        }

        // Default formatting
        // Handle arrays - render each element on one line
        if (Array.isArray(value)) {
          if (value.length === 0) {
            return <span className="text-muted-foreground">[]</span>;
          }
          return (
            <div className="flex flex-col gap-1">
              {value.map((item, index) => (
                <span key={index} className="whitespace-nowrap">
                  {String(item)}
                </span>
              ))}
            </div>
          );
        }

        // Handle objects (non-array)
        if (typeof value === "object") {
          return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
        }

        const stringValue = String(value);
        // If string conversion results in empty, show '-'
        if (stringValue.trim() === "") {
          return <span className="text-muted-foreground">-</span>;
        }

        return <span className="whitespace-nowrap">{stringValue}</span>;
      },
      [getFieldOption, inferredFormats]
    );

    // Render functions for TableBody
    const renderError = useCallback(() => {
      if (!error) return null;
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center text-destructive p-8">
            <div className="flex flex-col items-center justify-center h-[72px] gap-2">
              <p className="font-semibold">Error loading transposed table data:</p>
              <p className="text-sm">{error}</p>
            </div>
          </TableCell>
        </TableRow>
      );
    }, [error]);

    const renderLoading = useCallback(() => {
      // Only show skeleton when shouldShowSkeleton is true (with timing logic)
      if (!shouldShowSkeleton) return null;
      return (
        <>
          {Array.from({ length: 3 }).map((_, index) => (
            <TableRow key={index} className="transition-opacity duration-150" style={{ opacity: skeletonOpacity }}>
              <TableCell className="whitespace-nowrap !p-2">
                <Skeleton className="h-5 w-32" />
              </TableCell>
              <TableCell className="whitespace-nowrap !p-2">
                <Skeleton className="h-5 w-full" />
              </TableCell>
            </TableRow>
          ))}
        </>
      );
    }, [shouldShowSkeleton, skeletonOpacity]);

    const renderNoData = useCallback(() => {
      if (error || shouldShowSkeleton || data !== null) return null;
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center text-muted-foreground p-8">
            <div className="flex items-center justify-center h-[72px]">No data found</div>
          </TableCell>
        </TableRow>
      );
    }, [error, shouldShowSkeleton, data]);

    const renderData = useCallback(() => {
      // Don't show data while skeleton is visible (during minimum display time)
      // Don't hide data during refresh - keep showing existing data until new data arrives
      if (error || !data || shouldShowSkeleton) return null;

      // Get all field entries and preserve natural order
      // Track original index to maintain natural order for fields without position
      const fieldEntries = Object.entries(data).map(([key, value], originalIndex) => {
        const fieldOption = getFieldOption(key);
        return {
          key,
          value,
          fieldOption,
          position: fieldOption?.position ?? Number.MAX_SAFE_INTEGER,
          originalIndex, // Preserve natural order
        };
      });

      // Sort by position if available, otherwise maintain natural order
      fieldEntries.sort((a, b) => {
        // If both have positions (not MAX_SAFE_INTEGER), sort by position
        const aHasPosition = a.position !== Number.MAX_SAFE_INTEGER;
        const bHasPosition = b.position !== Number.MAX_SAFE_INTEGER;

        if (aHasPosition && bHasPosition) {
          // Both have positions: sort by position
          if (a.position !== b.position) {
            return a.position - b.position;
          }
          // Same position: maintain natural order
          return a.originalIndex - b.originalIndex;
        } else if (aHasPosition && !bHasPosition) {
          // Only a has position: a comes first
          return -1;
        } else if (!aHasPosition && bHasPosition) {
          // Only b has position: b comes first
          return 1;
        } else {
          // Neither has position: maintain natural order
          return a.originalIndex - b.originalIndex;
        }
      });

      return (
        <>
          {fieldEntries.map(({ key, value }) => {
            const fieldOption = getFieldOption(key);
            const displayName = fieldOption?.title || key;
            return (
              <TableRow key={key} className="hover:bg-muted/50">
                <TableCell className="p-2 whitespace-nowrap font-medium">{displayName}</TableCell>
                <TableCell className="p-2">{formatCellValue(key, value)}</TableCell>
              </TableRow>
            );
          })}
        </>
      );
    }, [error, data, shouldShowSkeleton, formatCellValue, getFieldOption]);

    // Handler for showing query dialog
    const handleShowQuery = useCallback(() => {
      showQueryDialog(descriptor.query, descriptor.titleOption?.title);
    }, [descriptor.query, descriptor.titleOption]);

    // Build dropdown menu items
    const dropdownItems = (
      <>{descriptor.query?.sql && <DropdownMenuItem onClick={handleShowQuery}>Show query</DropdownMenuItem>}</>
    );

    return (
      <DashboardPanelLayout
        componentRef={componentRef}
        className={props.className}
        isLoading={isLoading}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        titleOption={descriptor.titleOption}
        dropdownItems={dropdownItems}
      >
        <CardContent className="px-0 pb-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted/50 select-none h-10">
                <TableHead className="text-left whitespace-nowrap p-2">Name</TableHead>
                <TableHead className="text-left whitespace-nowrap p-2">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderError()}
              {renderLoading()}
              {renderNoData()}
              {renderData()}
            </TableBody>
          </Table>
        </CardContent>
      </DashboardPanelLayout>
    );
  }
);

DashboardPanelTransposedTable.displayName = "DashboardPanelTransposedTable";

export default DashboardPanelTransposedTable;

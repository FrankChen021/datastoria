"use client";

import { useConnection } from "@/components/connection/connection-context";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/use-dialog";
import { QueryError } from "@/lib/connection/connection";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { showQueryDialog } from "./dashboard-dialog-utils";
import { DashboardDropdownMenuItem } from "./dashboard-dropdown-menu-item";
import type {
  GaugeDescriptor,
  PanelDescriptor,
  PieDescriptor,
  StatDescriptor,
  TableDescriptor,
  TimeseriesDescriptor,
  TransposeTableDescriptor,
} from "./dashboard-model";
// Import pure visualization components
import { GaugeVisualization, type GaugeVisualizationRef } from "./dashboard-visualization-gauge";
import {
  DashboardVisualizationLayout,
  type DashboardVisualizationComponent,
  type RefreshOptions,
  type VisualizationRef,
} from "./dashboard-visualization-layout";
import { PieVisualization, type PieVisualizationRef } from "./dashboard-visualization-pie";
import { StatVisualization, type StatVisualizationRef } from "./dashboard-visualization-stat";
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

/**
 * Minimum display time for skeleton loaders (in milliseconds)
 * This ensures skeleton doesn't flash on fast loads
 * Aligned with FloatingProgressBar delay for consistent UX
 */
export const SKELETON_MIN_DISPLAY_TIME = 500;

/**
 * Fade transition duration for skeleton loaders (in milliseconds)
 */
export const SKELETON_FADE_DURATION = 150;

interface DashboardVisualizationPanelProps {
  descriptor: PanelDescriptor;
  selectedTimeSpan?: TimeSpan;
  initialLoading?: boolean;
  onRef?: (ref: DashboardVisualizationComponent | null) => void;
  onCollapsedChange?: (isCollapsed: boolean) => void;
  onChartSelection?: (
    timeSpan: TimeSpan,
    { name, series, value }: { name: string; series: string; value: number }
  ) => void;
  className?: string;
}

export const DashboardVisualizationPanel = forwardRef<
  DashboardVisualizationComponent,
  DashboardVisualizationPanelProps
>(function DashboardPanelNew(props, ref) {
  const { descriptor, initialLoading = true, onCollapsedChange } = props;

  // Type narrowing for refactored visualization types
  const typedDescriptor = descriptor as
    | TableDescriptor
    | PieDescriptor
    | TransposeTableDescriptor
    | TimeseriesDescriptor
    | GaugeDescriptor
    | StatDescriptor;

  const { connection } = useConnection();

  // State - unified for all visualization types
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<Array<{ name: string; type?: string }>>([]);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState("");
  const [executedSql, setExecutedSql] = useState<string>("");

  // Secondary data state (for Stat comparison)
  const [secondaryData, setSecondaryData] = useState<Record<string, unknown>[]>([]);
  const [isSecondaryLoading, setIsSecondaryLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState("");

  // Refs
  const apiCancellerRef = useRef<AbortController | null>(null);
  const secondaryApiCancellerRef = useRef<AbortController | null>(null);

  const visualizationRef = useRef<VisualizationRef>(null);

  const lastRefreshParamRef = useRef<RefreshOptions>({});

  // Skeleton timing state - simple show/hide with minimum display time
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonStartTimeRef = useRef<number | null>(null);

  // Load data function - unified for all types
  const loadData = useCallback(
    async (param: RefreshOptions, pageNumber: number = 0) => {
      if (!connection) {
        return;
      }

      const query = typedDescriptor.query;
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
        let finalSql = replaceTimeSpanParams(
          query.sql,
          param.selectedTimeSpan,
          connection.metadata?.timezone || "UTC"
        );

        // Let visualization component prepare SQL (e.g., table adds ORDER BY and pagination)
        finalSql = visualizationRef.current?.prepareDataFetchSql(finalSql, pageNumber) ?? finalSql;

        setExecutedSql(finalSql);

        // Choose the right query method based on type
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

        apiCancellerRef.current = abortController;

        const apiResponse = await response;

        if (abortController.signal.aborted) {
          setIsLoading(false);
          return;
        }

        // Check for HTTP errors
        if (apiResponse.httpStatus >= 400) {
          const errorData = apiResponse.data.json<QueryError>();
          setError(errorData.message || "Unknown error");
          setIsLoading(false);
          return;
        }

        const responseData = apiResponse.data.json<{
          data?: Record<string, unknown>[];
          meta?: { name: string; type?: string }[];
        }>();

        const newData = responseData.data || [];
        const newMeta = responseData.meta || [];

        // Handle data based on type
        if (pageNumber === 0) {
          // First page - replace data
          setData(newData);
          setMeta(newMeta);
        } else {
          // Subsequent pages - append data
          setData((prevData) => [...prevData, ...newData]);
        }

        // Clear error on successful data load
        setError("");
        setIsLoading(false);

        // Handle Stat comparison if needed
        if (typedDescriptor.type === "stat") {
          const statDescriptor = typedDescriptor as StatDescriptor;
          if (statDescriptor.comparisonOption?.offset && props.selectedTimeSpan) {
            const offsetValue = DateTimeExtension.parseOffsetExpression(
              statDescriptor.comparisonOption.offset
            );

            if (offsetValue !== 0) {
              setIsSecondaryLoading(true);
              setSecondaryError("");

              if (secondaryApiCancellerRef.current) {
                secondaryApiCancellerRef.current.abort();
                secondaryApiCancellerRef.current = null;
              }

              // Calculate offset time span
              const offsetTimeSpan: TimeSpan = {
                startISO8601:
                  DateTimeExtension.formatISO8601(
                    new Date(
                      new Date(props.selectedTimeSpan.startISO8601).getTime() + offsetValue * 1000
                    )
                  ) || "",

                endISO8601:
                  DateTimeExtension.formatISO8601(
                    new Date(
                      new Date(props.selectedTimeSpan.endISO8601).getTime() + offsetValue * 1000
                    )
                  ) || "",
              };

              // Prepare offset SQL
              const offsetSql = replaceTimeSpanParams(
                query.sql,
                offsetTimeSpan,
                connection.metadata?.timezone || "UTC"
              );

              const { response: offsetResponse, abortController: offsetAbort } =
                connection.queryOnNode(
                  offsetSql,
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

              secondaryApiCancellerRef.current = offsetAbort;

              offsetResponse
                .then((res) => {
                  if (offsetAbort.signal.aborted) return;

                  if (res.httpStatus >= 400) {
                    const errData = res.data.json<QueryError>();
                    setSecondaryError(errData.message || "Failed to load comparison data");
                  } else {
                    const resData = res.data.json<{
                      data?: Record<string, unknown>[];
                    }>();
                    setSecondaryData(resData.data || []);
                  }
                  setIsSecondaryLoading(false);
                })
                .catch((err) => {
                  if (offsetAbort.signal.aborted) return;
                  setSecondaryError(err instanceof Error ? err.message : "Unknown error");
                  setIsSecondaryLoading(false);
                });
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        if (err instanceof QueryError) {
          setError(err.data);
        } else {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
        setIsLoading(false);
      }
    },
    [connection, typedDescriptor, props.selectedTimeSpan]
  );

  // Internal refresh function
  const refreshInternal = useCallback(
    (param: RefreshOptions) => {
      if (!typedDescriptor.query) {
        return;
      }

      // Reset pagination state on refresh (if visualization supports it)
      visualizationRef.current?.resetPagination?.();

      loadData(param, 0);
    },
    [typedDescriptor.query, loadData]
  );

  // Get initial parameters for refreshable hook
  // Return undefined when selectedTimeSpan is not available to prevent initial fetch
  // This prevents double-fetching when component mounts before selectedTimeSpan is set
  const getInitialParams = useCallback(() => {
    // Check if the query requires time span parameters
    const query = typedDescriptor.query;
    const requiresTimeSpan =
      query?.sql.includes("{startTimestamp") ||
      query?.sql.includes("{endTimestamp") ||
      query?.sql.includes("{timeFilter") ||
      query?.sql.includes("{from:") ||
      query?.sql.includes("{to:");

    if (requiresTimeSpan && !props.selectedTimeSpan) {
      // Return undefined to skip initial refresh when time span is required but not available
      return undefined;
    }

    return props.selectedTimeSpan
      ? ({ selectedTimeSpan: props.selectedTimeSpan } as RefreshOptions)
      : ({} as RefreshOptions);
  }, [props.selectedTimeSpan, typedDescriptor.query]);

  // Use the refreshable hook
  const { componentRef, isCollapsed, setIsCollapsed, refresh, getLastRefreshParameter } =
    useRefreshable({
      initialCollapsed: typedDescriptor.collapsed ?? false,
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
      if (typedDescriptor.type !== "table") return;

      const tableDescriptor = typedDescriptor as TableDescriptor;
      if (tableDescriptor.sortOption?.serverSideSorting) {
        const lastParams = lastRefreshParamRef.current;
        const refreshParam: RefreshOptions = {
          ...lastParams,
          inputFilter: `sort_${Date.now()}_${column}_${direction}`,
        };
        refresh(refreshParam);
      }
    },
    [typedDescriptor, refresh]
  );

  // Handle loading data for a specific page (called by table visualization)
  const handleLoadData = useCallback(
    async (pageNumber: number) => {
      if (typedDescriptor.type !== "table") return;
      await loadData(lastRefreshParamRef.current, pageNumber);
    },
    [typedDescriptor.type, loadData]
  );

  // Common handlers
  const handleShowQuery = useCallback(() => {
    showQueryDialog(typedDescriptor.query, typedDescriptor.titleOption?.title, executedSql);
  }, [typedDescriptor.query, typedDescriptor.titleOption, executedSql]);

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
      title: typedDescriptor.titleOption?.title || "Query Result",
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
  }, [data, meta, typedDescriptor.titleOption?.title]);

  // Get dropdown items - combine facade-level items with visualization-specific items
  const getDropdownItems = useCallback(() => {
    // Get visualization-specific dropdown items (without "Show query")
    const vizItems = visualizationRef.current?.getDropdownItems();

    // Combine with facade-level "Show query" item
    return (
      <>
        {typedDescriptor.query?.sql && (
          <DashboardDropdownMenuItem onClick={handleShowQuery}>
            Show query
          </DashboardDropdownMenuItem>
        )}
        {vizItems}
      </>
    );
  }, [typedDescriptor.query, handleShowQuery]);

  // Render error state
  const renderError = () => (
    <div className="flex h-full w-full flex-col items-center justify-center p-1 text-sm text-destructive gap-1">
      <AskAIButton sql={executedSql} errorMessage={error} hideAfterClick={false} />
      <div className="text-center overflow-auto w-full max-h-full custom-scrollbar">{error}</div>
    </div>
  );

  // Track first load state (when data is empty and loading)
  const isFirstLoad = data.length === 0 && isLoading && !error;

  // Simple skeleton timing: handle minimum display time, CSS handles fade
  useEffect(() => {
    if (isFirstLoad) {
      // Start showing skeleton
      if (skeletonStartTimeRef.current === null) {
        skeletonStartTimeRef.current = Date.now();
        setShowSkeleton(true);
      }
    } else {
      // Data loaded - wait for minimum time if needed, then hide (CSS handles fade)
      if (skeletonStartTimeRef.current !== null) {
        const elapsed = Date.now() - skeletonStartTimeRef.current;
        const remainingTime = Math.max(0, SKELETON_MIN_DISPLAY_TIME - elapsed);

        setTimeout(() => {
          setShowSkeleton(false);
          skeletonStartTimeRef.current = null;
        }, remainingTime);
      }
    }
  }, [isFirstLoad]);

  // Defensive check - after all hooks
  if (!descriptor || !descriptor.type) {
    return <pre>Invalid descriptor: {JSON.stringify(descriptor, null, 2)}</pre>;
  }

  return (
    <DashboardVisualizationLayout
      componentRef={componentRef}
      className={props.className}
      isLoading={isLoading}
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
      titleOption={typedDescriptor.titleOption}
      getDropdownItems={getDropdownItems}
      onRefresh={handleRefresh}
    >
      <div className="relative h-full w-full">
        {showSkeleton && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/50 transition-opacity duration-150">
            <Skeleton className="w-full h-full" />
          </div>
        )}
        {!showSkeleton && (
          <div className={`h-full w-full transition-opacity duration-150`}>
            {error ? (
              renderError()
            ) : typedDescriptor.type === "table" ? (
              <TableVisualization
                ref={visualizationRef as React.Ref<TableVisualizationRef>}
                data={data}
                meta={meta}
                descriptor={typedDescriptor as TableDescriptor}
                selectedTimeSpan={props.selectedTimeSpan}
                onSortChange={handleSortChange}
                onLoadData={handleLoadData}
              />
            ) : typedDescriptor.type === "pie" ? (
              <PieVisualization
                ref={visualizationRef as React.Ref<PieVisualizationRef>}
                data={data}
                meta={meta}
                descriptor={typedDescriptor as PieDescriptor}
                selectedTimeSpan={props.selectedTimeSpan}
              />
            ) : typedDescriptor.type === "transpose-table" ? (
              <TransposeTableVisualization
                ref={visualizationRef as React.Ref<TransposeTableVisualizationRef>}
                data={data}
                descriptor={typedDescriptor as TransposeTableDescriptor}
              />
            ) : typedDescriptor.type === "line" ||
              typedDescriptor.type === "bar" ||
              typedDescriptor.type === "area" ? (
              <TimeseriesVisualization
                ref={visualizationRef as React.Ref<TimeseriesVisualizationRef>}
                data={data}
                meta={meta}
                descriptor={typedDescriptor as TimeseriesDescriptor}
                selectedTimeSpan={props.selectedTimeSpan}
                onChartSelection={props.onChartSelection}
                onShowRawData={handleShowRawData}
              />
            ) : typedDescriptor.type === "gauge" ? (
              <GaugeVisualization
                ref={visualizationRef as React.Ref<GaugeVisualizationRef>}
                data={data}
                meta={meta}
                descriptor={typedDescriptor as GaugeDescriptor}
                selectedTimeSpan={props.selectedTimeSpan}
              />
            ) : typedDescriptor.type === "stat" ? (
              <StatVisualization
                ref={visualizationRef as React.Ref<StatVisualizationRef>}
                data={data}
                meta={meta}
                secondaryData={secondaryData}
                descriptor={typedDescriptor as StatDescriptor}
                selectedTimeSpan={props.selectedTimeSpan}
                isSecondaryLoading={isSecondaryLoading}
                secondaryError={secondaryError}
              />
            ) : null}
          </div>
        )}
      </div>
    </DashboardVisualizationLayout>
  );
});

"use client";

import { useConnection } from "@/components/connection/connection-context";
import { AskAIButton } from "@/components/shared/ask-ai-button";
import { Dialog } from "@/components/shared/use-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCode } from "@/lib/clickhouse-error-parser";
import { QueryError } from "@/lib/connection/connection";
import { DateTimeExtension } from "@/lib/datetime-utils";
import {
  forwardRef,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
import { SQLQueryBuilder } from "./sql-query-builder";
import type { TimeSpan } from "./timespan-selector";

/**
 * Minimum display time for skeleton loaders (in milliseconds)
 * This ensures skeleton doesn't flash on fast loads for better UX
 */
export const SKELETON_MIN_DISPLAY_TIME = 1_000;

/**
 * Fade transition duration for skeleton loaders (in milliseconds)
 */
export const SKELETON_FADE_DURATION = 150;

const ErrorComponent = ({
  error,
  errorCode,
  executedSql,
}: {
  error: string;
  errorCode: string;
  executedSql: string;
}) => {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-1 text-sm text-destructive gap-1">
      {errorCode === ErrorCode.UNKNOWN_TABLE ? (
        <div className="text-center overflow-auto w-full max-h-full custom-scrollbar">
          <p className="text-sm text-destructive">
            The table is not found. Maybe it's not enabled or not supported by the current
            ClickHouse version.
          </p>
        </div>
      ) : errorCode === ErrorCode.NOT_ENOUGH_PRIVILEGES ? (
        <div className="text-center overflow-auto w-full max-h-full custom-scrollbar">
          <p className="text-sm text-destructive">
            No enough privileges. Please contact your administrator to grant you necessary
            permissions.
          </p>
        </div>
      ) : (
        <>
          <AskAIButton sql={executedSql} errorMessage={error} hideAfterClick={false} />
          <div className="text-center overflow-auto w-full max-h-full custom-scrollbar">
            {error}
          </div>
        </>
      )}
    </div>
  );
};

interface DashboardVisualizationPanelProps {
  descriptor: PanelDescriptor;
  initialTimeSpan?: TimeSpan;
  initialFilterExpression?: string;
  initialLoading?: boolean;
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
>(function DashboardVisualizationPanel(props, ref) {
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
  const [errorCode, setErrorCode] = useState<string>("");
  const [executedSql, setExecutedSql] = useState<string>("");

  // Secondary data state (for Stat comparison)
  const [secondaryData, setSecondaryData] = useState<Record<string, unknown>[]>([]);
  const [isSecondaryLoading, setIsSecondaryLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState("");

  // Inlined refreshable state (from useRefreshable hook)
  const [isCollapsed, setIsCollapsedInternal] = useState(typedDescriptor.collapsed ?? false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isVisualizationMounted, setIsVisualizationMounted] = useState(false);

  // Refs
  const apiCancellerRef = useRef<AbortController | null>(null);
  const secondaryApiCancellerRef = useRef<AbortController | null>(null);

  const visualizationRef = useCallback((node: VisualizationRef | null) => {
    if (node) {
      // Visualization component has mounted
      visualizationRefInternal.current = node;
      setIsVisualizationMounted(true);
    }
  }, []);

  const visualizationRefInternal = useRef<VisualizationRef>(null);

  const lastRefreshParamRef = useRef<RefreshOptions>({});

  // Inlined refreshable refs (from useRefreshable hook)
  const componentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const refreshParameterRef = useRef<RefreshOptions | undefined>(undefined);
  const lastRefreshParamRefFromHook = useRef<RefreshOptions | undefined>(undefined);

  // Skeleton timing state - simple show/hide with minimum display time
  const [showSkeleton, setShowSkeleton] = useState(false);
  const skeletonStartTimeRef = useRef<number | null>(null);

  // Wrapper around setIsCollapsed that also calls the callback (from useRefreshable)
  const setIsCollapsed = useCallback(
    (collapsed: boolean) => {
      setIsCollapsedInternal(collapsed);
      onCollapsedChange?.(collapsed);
    },
    [onCollapsedChange]
  );

  // Check if component is actually visible (from useRefreshable)
  const isComponentInView = useCallback((): boolean => {
    if (!componentRef.current) {
      return false;
    }

    const element = componentRef.current;

    // Check if element is actually visible (not hidden by collapsed parents)
    const rect = element.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;

    if (!isVisible) {
      return false;
    }

    // Check if any parent is hidden (collapsed)
    let parent: HTMLElement | null = element.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      if (parent.hasAttribute("hidden")) {
        return false;
      }
      if (parent.hasAttribute("data-state") && parent.getAttribute("data-state") === "closed") {
        if (style.display === "none") {
          return false;
        }
      }
      parent = parent.parentElement;
    }

    // Check if element is in viewport
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const elementBottom = rect.bottom;
    const elementTop = rect.top;

    return elementTop < viewportHeight && elementBottom > 0;
  }, []);

  // Check if component should refresh (from useRefreshable)
  const shouldRefresh = useCallback((): boolean => {
    return !isCollapsed && isComponentInView();
  }, [isCollapsed, isComponentInView]);

  // Load data function - unified for all types
  const loadData = useCallback(
    async (param: RefreshOptions, pageNumber: number = 0) => {
      if (!connection) {
        return;
      }

      const query = typedDescriptor.datasource;
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

        // Build SQL query with all replacements
        // Cluster template replacement is now handled by connection.query()
        const timezone = connection.metadata?.timezone || "UTC";
        let finalSql = new SQLQueryBuilder(query.sql)
          .timeSpan(param.timeSpan, timezone)
          .filterExpression(param.filterExpression)
          .build();

        // Let visualization component prepare SQL (e.g., table adds ORDER BY and pagination)
        // With the callback ref pattern, visualizationRefInternal.current will be available
        // before the initial data load is triggered
        if (visualizationRefInternal.current?.prepareDataFetchSql) {
          finalSql = visualizationRefInternal.current.prepareDataFetchSql(finalSql, pageNumber);
        }

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

        const responseData = apiResponse.data.json<{
          data?: Record<string, unknown>[];
          meta?: { name: string; type?: string }[];
        }>();

        const newData = responseData.data || [];
        const newMeta = responseData.meta || [];

        // Handle data based on type
        if (pageNumber === 0) {
          // First page - replace data (keep synchronous for immediate feedback)
          setData(newData);
          setMeta(newMeta);
        } else {
          // Subsequent pages - append data using transition for non-blocking update
          // This prevents UI freezing and allows progress bar to animate smoothly
          startTransition(() => {
            setData((prevData) => [...prevData, ...newData]);
          });
        }

        // Clear error on successful data load
        setError("");
        setErrorCode("");
        setIsLoading(false);

        // Handle Stat comparison if needed
        if (typedDescriptor.type === "stat") {
          const statDescriptor = typedDescriptor as StatDescriptor;
          if (statDescriptor.comparisonOption?.offset && props.initialTimeSpan) {
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
                      new Date(props.initialTimeSpan.startISO8601).getTime() + offsetValue * 1000
                    )
                  ) || "",

                endISO8601:
                  DateTimeExtension.formatISO8601(
                    new Date(
                      new Date(props.initialTimeSpan.endISO8601).getTime() + offsetValue * 1000
                    )
                  ) || "",
              };

              // Prepare offset SQL with all replacements
              const offsetSql = new SQLQueryBuilder(query.sql)
                .timeSpan(offsetTimeSpan, timezone)
                .filterExpression(param.filterExpression)
                .build();

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
          setErrorCode(err.errorCode || "");
        } else {
          setError(err instanceof Error ? err.message : "Unknown error");
          //setErrorCode("");
        }
        setIsLoading(false);
      }
    },
    [connection, typedDescriptor, props.initialTimeSpan]
  );

  // Internal refresh function
  const refreshInternal = useCallback(
    (param: RefreshOptions) => {
      if (!typedDescriptor.datasource) {
        return;
      }

      // Reset pagination state on refresh (if visualization supports it)
      visualizationRefInternal.current?.resetPagination?.();

      loadData(param, 0);
    },
    [typedDescriptor.datasource, loadData]
  );

  // Public refresh method (from useRefreshable, modified to check visualization ref)
  const refresh = useCallback(
    (param: RefreshOptions) => {
      // Check if the parameters have actually changed
      if (
        !param.forceRefresh &&
        lastRefreshParamRefFromHook.current &&
        JSON.stringify(lastRefreshParamRefFromHook.current) === JSON.stringify(param)
      ) {
        return;
      }

      // Store the parameter for potential deferred execution
      refreshParameterRef.current = param;

      // Re-check visibility at the time of refresh
      const isCurrentlyVisible = isComponentInView();
      const shouldRefreshNow = !isCollapsed && isCurrentlyVisible;

      // Only refresh if NOT collapsed AND in viewport
      if (shouldRefreshNow) {
        refreshInternal(param);
        lastRefreshParamRefFromHook.current = param;
        setNeedRefresh(false);
      } else {
        // Mark that refresh is needed when component becomes visible/expanded
        setNeedRefresh(true);
        // Set isLoading to false since we're not actually loading anything yet
        // This prevents the skeleton from showing forever for collapsed panels
        setIsLoading(false);
      }
    },
    [isCollapsed, isComponentInView, refreshInternal]
  );

  const getLastRefreshParameter = useCallback((): RefreshOptions => {
    return refreshParameterRef.current || {};
  }, []);

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
          forceRefresh: true,
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
    showQueryDialog(typedDescriptor.datasource, typedDescriptor.titleOption?.title, executedSql);
  }, [typedDescriptor.datasource, typedDescriptor.titleOption, executedSql]);

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
    const vizItems = visualizationRefInternal.current?.getDropdownItems();

    // Combine with facade-level items
    return (
      <>
        {typedDescriptor.datasource?.sql && (
          <DashboardDropdownMenuItem onClick={handleShowQuery}>
            Show query
          </DashboardDropdownMenuItem>
        )}
        {data.length > 0 && (
          <DashboardDropdownMenuItem onClick={handleShowRawData}>
            Show query result
          </DashboardDropdownMenuItem>
        )}
        {vizItems}
      </>
    );
  }, [typedDescriptor.datasource, handleShowQuery, data.length, handleShowRawData]);

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

        // Use a random so that different panels on the page will be shown in a random delay
        const remainingTime = Math.random() * Math.max(0, SKELETON_MIN_DISPLAY_TIME - elapsed);

        setTimeout(() => {
          setShowSkeleton(false);
          skeletonStartTimeRef.current = null;
        }, remainingTime);
      }
    }
  }, [isFirstLoad]);

  // Track if initial refresh has been done
  const initialRefreshDoneRef = useRef(false);

  // Trigger initial refresh AFTER visualization ref is available (modified from useRefreshable)
  // This effect only handles the INITIAL refresh - subsequent refreshes are triggered via the imperative handle
  useEffect(() => {
    if (!initialLoading) {
      return;
    }

    // Wait for visualization to be mounted before initial refresh
    if (!isVisualizationMounted) {
      return;
    }

    // Only do initial refresh once
    if (initialRefreshDoneRef.current) {
      return;
    }

    // Check if the query requires time span parameters
    const query = typedDescriptor.datasource;
    const requiresTimeSpan =
      query?.sql.includes("{startTimestamp") ||
      query?.sql.includes("{endTimestamp") ||
      query?.sql.includes("{timeFilter") ||
      query?.sql.includes("{from:") ||
      query?.sql.includes("{to:");

    if (requiresTimeSpan && !props.initialTimeSpan) {
      // Skip initial refresh when time span is required but not available
      return;
    }

    initialRefreshDoneRef.current = true;

    // Use props directly to ensure we get the current values
    const params: RefreshOptions = {
      timeSpan: props.initialTimeSpan,
      filterExpression: props.initialFilterExpression ?? "1=1",
    };

    // Trigger refresh with params
    refresh(params);
  }, [
    isVisualizationMounted,
    props.initialTimeSpan,
    props.initialFilterExpression,
    typedDescriptor.datasource,
    refresh,
  ]);

  // Keep refresh parameters in sync with props
  useEffect(() => {
    refreshParameterRef.current = {
      ...refreshParameterRef.current,
      timeSpan: props.initialTimeSpan,
      filterExpression: props.initialFilterExpression,
    };
  }, [props.initialTimeSpan, props.initialFilterExpression]);

  // Handle collapsed state changes - refresh when expanded if needed (from useRefreshable)
  useEffect(() => {
    if (!isCollapsed && needRefresh && shouldRefresh()) {
      const currentParam = refreshParameterRef.current;
      if (currentParam) {
        if (
          lastRefreshParamRefFromHook.current &&
          JSON.stringify(lastRefreshParamRefFromHook.current) === JSON.stringify(currentParam)
        ) {
          setNeedRefresh(false);
        } else {
          refreshInternal(currentParam);
          lastRefreshParamRefFromHook.current = currentParam;
          setNeedRefresh(false);
        }
      } else {
        setNeedRefresh(false);
      }
    }
  }, [isCollapsed, needRefresh, shouldRefresh, refreshInternal]);

  // IntersectionObserver setup (from useRefreshable)
  useEffect(() => {
    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry.isIntersecting && entry.intersectionRatio > 0 && shouldRefresh()) {
        if (!isComponentInView()) {
          return;
        }

        const currentParam = refreshParameterRef.current;
        if (currentParam) {
          if (
            lastRefreshParamRefFromHook.current &&
            JSON.stringify(lastRefreshParamRefFromHook.current) === JSON.stringify(currentParam)
          ) {
            setNeedRefresh(false);
          } else {
            refreshInternal(currentParam);
            lastRefreshParamRefFromHook.current = currentParam;
            setNeedRefresh(false);
          }
        }
      }
    };

    const currentComponent = componentRef.current;
    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: "0px",
      threshold: [0, 0.1],
    });

    if (currentComponent) {
      observerRef.current.observe(currentComponent);
    }

    return () => {
      if (currentComponent && observerRef.current) {
        observerRef.current.unobserve(currentComponent);
      }
    };
  }, [needRefresh, shouldRefresh, refreshInternal, isComponentInView]);

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
      <div className="h-full w-full">
        {showSkeleton ? (
          <div className="flex items-center justify-center h-full w-full min-h-[100px] transition-opacity duration-150">
            <Skeleton className="w-full h-full [animation-duration:1s]" />
          </div>
        ) : (
          <div className="h-full w-full transition-opacity duration-150">
            {error ? (
              ErrorComponent({ error, errorCode, executedSql })
            ) : typedDescriptor.type === "table" ? (
              <TableVisualization
                ref={visualizationRef as React.Ref<TableVisualizationRef>}
                data={data}
                meta={meta}
                descriptor={typedDescriptor as TableDescriptor}
                selectedTimeSpan={props.initialTimeSpan}
                isLoading={isLoading}
                onSortChange={handleSortChange}
                onLoadData={handleLoadData}
              />
            ) : typedDescriptor.type === "pie" ? (
              <PieVisualization
                ref={visualizationRef as React.Ref<PieVisualizationRef>}
                data={data}
                meta={meta}
                descriptor={typedDescriptor as PieDescriptor}
                selectedTimeSpan={props.initialTimeSpan}
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
                selectedTimeSpan={props.initialTimeSpan}
                onChartSelection={props.onChartSelection}
              />
            ) : typedDescriptor.type === "gauge" ? (
              <GaugeVisualization
                ref={visualizationRef as React.Ref<GaugeVisualizationRef>}
                data={data}
                meta={meta}
                descriptor={typedDescriptor as GaugeDescriptor}
                selectedTimeSpan={props.initialTimeSpan}
              />
            ) : typedDescriptor.type === "stat" ? (
              <StatVisualization
                ref={visualizationRef as React.Ref<StatVisualizationRef>}
                data={data}
                meta={meta}
                secondaryData={secondaryData}
                descriptor={typedDescriptor as StatDescriptor}
                selectedTimeSpan={props.initialTimeSpan}
                isSecondaryLoading={isSecondaryLoading}
                secondaryError={secondaryError}
                isLoading={isLoading}
              />
            ) : null}
          </div>
        )}
      </div>
    </DashboardVisualizationLayout>
  );
});

"use client";

import { Api, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter } from "../../lib/formatter";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CircleAlert, TrendingDown, TrendingUpIcon } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Area, AreaChart, Line, LineChart, XAxis, YAxis } from "recharts";
import FloatingProgressBar from "../floating-progress-bar";
import { Button } from "../ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { ChartContainer, ChartTooltip } from "../ui/chart";
import { Skeleton } from "../ui/skeleton";
import { Dialog } from "../use-dialog";
import type {
  ChartDescriptor,
  MinimapOption,
  Reducer,
  SQLQuery,
  StatDescriptor,
  TableDescriptor,
  TimeseriesDescriptor,
  TransposeTableDescriptor,
} from "./chart-utils";
import type { RefreshableComponent, RefreshParameter } from "./refreshable-component";
import RefreshableTableComponent from "./refreshable-table-component";
import RefreshableTimeseriesChart from "./refreshable-timeseries-chart";
import RefreshableTransposedTableComponent from "./refreshable-transposed-table-component";
import type { TimeSpan } from "./timespan-selector";
import { useRefreshable } from "./use-refreshable";

interface RefreshableStatComponentProps {
  // The stat descriptor configuration
  descriptor: StatDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;

  // Used for generating links
  searchParams?: URLSearchParams;
}

interface MinimapDataPoint {
  timestamp: number;
  value: number;
}

// Minimap Component with viewport optimization
interface StatMinimapProps {
  id: string;
  data: MinimapDataPoint[];
  isLoading: boolean;
  minimap: MinimapOption;
}

const StatMinimap = React.memo<StatMinimapProps>(function StatMinimap({ id, data, isLoading, minimap }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isInViewport, setIsInViewport] = React.useState(false);

  React.useEffect(() => {
    const currentElement = containerRef.current;
    if (!currentElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInViewport(entry.isIntersecting);
        });
      },
      {
        root: null,
        rootMargin: "100px", // Load slightly before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(currentElement);

    return () => {
      observer.unobserve(currentElement);
    };
  }, []);

  // Show skeleton only while actively loading (not when we have no data after load completes)
  if (isLoading && data.length === 0) {
    return (
      <div ref={containerRef} className="w-full mt-2">
        <Skeleton className="h-[50px] w-full" />
      </div>
    );
  }

  // Don't render chart if not in viewport (performance optimization)
  if (!isInViewport) {
    return (
      <div ref={containerRef} className="w-full mt-2">
        <div className="h-[50px]" />
      </div>
    );
  }

  // If we had data before but now empty during reload, keep showing the old chart structure
  if (data.length === 0) {
    return (
      <div ref={containerRef} className="w-full mt-2">
        <div className="h-[50px]" />
      </div>
    );
  }

  const chartConfig = {
    value: {
      label: "Value",
      color: "hsl(var(--chart-1))",
    },
  };

  const isArea = minimap.type === "area";
  const ChartComponent = isArea ? AreaChart : LineChart;

  return (
    <div ref={containerRef} className="w-full mt-2">
      <ChartContainer
        config={chartConfig}
        className={`h-[50px] w-full aspect-auto transition-opacity duration-300 ${
          isLoading ? "opacity-50" : "opacity-100"
        }`}
      >
        <ChartComponent data={data} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
          {isArea && (
            <defs>
              <linearGradient id={`gradient-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          <XAxis dataKey="timestamp" hide type="number" domain={["dataMin", "dataMax"]} />
          <YAxis width={30} tick={{ fontSize: 9 }} />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) {
                return null;
              }

              const data = payload[0].payload as MinimapDataPoint;
              const timestamp = data.timestamp;
              const value = data.value;

              return (
                <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="font-medium mb-1">{format(new Date(timestamp), "MM-dd HH:mm:ss")}</div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: "var(--color-value)" }}
                    />
                    <span className="tabular-nums">{value.toFixed(2)}</span>
                  </div>
                </div>
              );
            }}
          />
          {isArea ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              strokeWidth={1.5}
              fill={`url(#gradient-${id})`}
              fillOpacity={1}
              isAnimationActive={false}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              strokeWidth={1.5}
              fill="none"
              isAnimationActive={false}
              dot={false}
            />
          )}
        </ChartComponent>
      </ChartContainer>
    </div>
  );
});

// Helper component to render drilldown charts (avoids forwardRef recursion issues)
const DrilldownChartRenderer: React.FC<{
  descriptor: ChartDescriptor;
  selectedTimeSpan?: TimeSpan;
  searchParams?: URLSearchParams;
}> = ({ descriptor, selectedTimeSpan, searchParams }) => {
  if (descriptor.type === "stat") {
    return (
      <RefreshableStatComponent
        descriptor={descriptor as StatDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        searchParams={searchParams}
      />
    );
  } else if (descriptor.type === "line" || descriptor.type === "bar" || descriptor.type === "area") {
    return (
      <RefreshableTimeseriesChart
        descriptor={descriptor as TimeseriesDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        searchParams={searchParams}
      />
    );
  } else if (descriptor.type === "table") {
    return (
      <RefreshableTableComponent
        descriptor={descriptor as TableDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        searchParams={searchParams}
      />
    );
  } else if (descriptor.type === "transpose-table") {
    return (
      <RefreshableTransposedTableComponent
        descriptor={descriptor as TransposeTableDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        searchParams={searchParams}
      />
    );
  }
  return null;
};

const RefreshableStatComponent = forwardRef<RefreshableComponent, RefreshableStatComponentProps>(
  function RefreshableStatComponent(props, ref) {
    const { descriptor, selectedTimeSpan } = props;
    const { selectedConnection } = useConnection();

    // State
    const [data, setData] = useState(0);
    const valueTextRef = useRef<HTMLDivElement>(null);
    const valueContainerRef = useRef<HTMLDivElement>(null);
    const [fontSize, setFontSize] = useState(3); // Start with 3rem (text-5xl equivalent)
    const [offset] = useState(() =>
      descriptor.comparisonOption ? DateTimeExtension.parseOffsetExpression(descriptor.comparisonOption.offset) : 0
    );
    const [offsetData] = useState(0);
    const [minimapData, setMinimapData] = useState<MinimapDataPoint[]>([]);
    const [isLoadingMinimap, setIsLoadingMinimap] = useState(false);
    const [isLoadingValue, setIsLoadingValue] = useState(false);
    const [isLoadingOffset, setIsLoadingOffset] = useState(false);
    const [offsetError, setOffsetError] = useState("");
    const [error, setError] = useState("");
    const [hasInitialData, setHasInitialData] = useState(false); // Track if we've ever received data

    // Helper functions
    const shouldShowMinimap = useCallback((): boolean => {
      if (!descriptor.minimapOption || descriptor.minimapOption.type === "none") {
        return false;
      }
      return true;
    }, [descriptor]);

    const getMinimapDataFromResponse = useCallback((response: ApiResponse): MinimapDataPoint[] => {
      if (!response.data || response.data.length === 0) {
        return [];
      }

      const dataPoints: MinimapDataPoint[] = [];

      // // For timeseries queries, response.data is an array of metrics with tags and values
      // // Each metric has: { tags: string[], values: number[] }
      // response.data.forEach((metric: { tags: string[]; values: number[] }) => {
      //   // Build timeseries data points from values array
      //   let timestamp = response.startTimestamp;

      //   metric.values.forEach((value) => {
      //     if (value !== null && value !== undefined) {
      //       dataPoints.push({
      //         timestamp: timestamp,
      //         value: value,
      //       });
      //     }
      //     timestamp += response.interval;
      //   });
      // });

      return dataPoints;
    }, []);

    const calculateReducedValue = useCallback((data: MinimapDataPoint[], reducer: Reducer): number => {
      if (data.length === 0) {
        return 0;
      }

      const values = data.map((d) => d.value).filter((v) => v !== null && v !== undefined);

      if (values.length === 0) {
        return 0;
      }

      switch (reducer) {
        case "min":
          return Math.min(...values);
        case "max":
          return Math.max(...values);
        case "sum":
          return values.reduce((acc, val) => acc + val, 0);
        case "count":
          return values.length;
        case "first":
          return values[0];
        case "last":
          return values[values.length - 1];
        case "avg":
        default:
          return values.reduce((acc, val) => acc + val, 0) / values.length;
      }
    }, []);

    const loadData = useCallback(
      async (_param: RefreshParameter, isOffset: boolean = false) => {
        const showMinimap = shouldShowMinimap() && !isOffset;

        console.trace(
          `Loading data for stat [${descriptor.id}], isOffset: ${isOffset}, showMinimap: ${showMinimap}, queryType: ${(descriptor.query as SQLQuery & { type?: string })?.type}`
        );

        // Don't clear previous data during reload to prevent flickering
        // Only set loading state
        if (isOffset) {
          setIsLoadingOffset(true);
        } else {
          setIsLoadingValue(true);
          setIsLoadingMinimap(showMinimap);
        }

        try {
          // For timeseries queries with minimap, we need the full response to build the minimap
          if (showMinimap) {
            const query = descriptor.query;
            const thisQuery = Object.assign({}, query) as SQLQuery;

            // Interval
            // thisQuery.interval = {
            //   // Keep the step property defined in the chart
            //   step: query.interval?.step,

            //   startISO8601: param.selectedTimeSpan.startISO8601,
            //   endISO8601: param.selectedTimeSpan.endISO8601,
            // };
            // if (thisQuery.bucketCount) {
            //   thisQuery.interval.bucketCount = thisQuery.bucketCount;
            //   delete thisQuery.bucketCount;
            // }
            // if (!thisQuery.interval.step) {
            //   thisQuery.interval.step = calculateIntervalStep(thisQuery.interval);
            // }

            Api.create(selectedConnection!).executeSQL(
              {
                sql: thisQuery.sql,
                params: {
                  default_format: "JSON",
                  output_format_json_quote_64bit_integers: 0,
                },
              },
              (response) => {
                // Use the streaming API for better performance with large datasets
                //const streaming: StreamingResponse = await dataSourceApi.queryStream(thisQuery);
                // Use transformBucketByTimestampStreamToQueryResponse to properly handle typed stream
                // Let it auto-infer value columns from metadata (last non-_timestamp, non-groupBy column)
                //const response: QueryResponse = await transformBucketByTimestampStreamToQueryResponse(
                //  streaming,
                //  thisQuery
                //);

                // Process the response into minimap data points
                const minimapDataResult = getMinimapDataFromResponse(response);

                console.trace(
                  `Processed minimap data for stat [${descriptor.id}], minimapData points: ${minimapDataResult.length}`
                );

                // Calculate reduced value using the reducer
                const reducer = descriptor.valueOption?.reducer || "avg";
                const reducedValue = calculateReducedValue(minimapDataResult, reducer);

                console.trace(
                  `Processed minimap data for stat [${descriptor.id}], points: ${minimapDataResult.length}, reducedValue: ${reducedValue}`
                );

                // Update state with both the reduced value and minimap data
                setData(reducedValue);
                setMinimapData(minimapDataResult);
                setError("");
                setHasInitialData(true);
                setIsLoadingValue(false);
                setIsLoadingMinimap(false);

                console.trace(
                  `Updated state for stat [${descriptor.id}], data: ${reducedValue}, minimapData: ${minimapDataResult.length} points`
                );
              },
              (error) => {
                console.error(error);
                setError(error.errorMessage || "Failed to load data");
                setIsLoadingValue(false);
                setIsLoadingMinimap(false);
              }
            );
          } else {
            // For non-timeseries or no minimap, use the original scalar fetcher
            const query = Object.assign({}, descriptor.query);

            Api.create(selectedConnection!).executeSQL(
              {
                sql: query.sql,
                params: {
                  default_format: "JSONCompact",
                  output_format_json_quote_64bit_integers: 0,
                },
              },
              (response) => {
                if (isOffset) {
                  //setOffsetData(dataResult);
                  setOffsetError("");
                } else {
                  const responsJson = response.data;
                  if (responsJson && responsJson.data.length > 0) {
                    setData(responsJson.data[0][0]);
                    setHasInitialData(true);
                  } else {
                    setData(0);
                  }
                  setError("");
                  setIsLoadingValue(false);
                  setIsLoadingMinimap(false);
                }

                if (isOffset) {
                  setIsLoadingOffset(false);
                }
              },
              (error) => {
                setError(error.errorMessage || "Failed to load data");
                setIsLoadingValue(false);
                setIsLoadingMinimap(false);
              }
            );
          }
        } catch (error) {
          if (isOffset) {
            setOffsetError((error as Error).message);
            setIsLoadingOffset(false);
          } else {
            setError((error as Error).message);
            setIsLoadingValue(false);
            setIsLoadingMinimap(false);
            console.error(error);
          }
        }
      },
      [descriptor, shouldShowMinimap, getMinimapDataFromResponse, calculateReducedValue, selectedConnection]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshParameter) => {
        console.trace(`Refreshing stat [${descriptor.id}]...`);

        if (!descriptor.query) {
          console.error(`No query defined for stat [${descriptor.id}]`);
          setError("No query defined for this stat component.");
          return;
        }

        if (!param.selectedTimeSpan) {
          console.error(`No timespan for stat [${descriptor.id}]`);
          setError("Please choose time span.");
          return;
        }

        // Load data - for timeseries with minimap, we get both stat and minimap from same response
        loadData(param);

        // Load offset data
        if (offset !== 0) {
          const offsetTimeSpan: TimeSpan = {
            startISO8601:
              DateTimeExtension.formatISO8601(
                new Date(new Date(param.selectedTimeSpan.startISO8601).getTime() + offset * 1000)
              ) || "",

            endISO8601:
              DateTimeExtension.formatISO8601(
                new Date(new Date(param.selectedTimeSpan.endISO8601).getTime() + offset * 1000)
              ) || "",
          };

          const offsetParam: RefreshParameter = {
            ...param,
            selectedTimeSpan: offsetTimeSpan,
          };

          loadData(offsetParam, true);
        }
      },
      [descriptor, offset, loadData]
    );

    // Use shared refreshable hook (stat chart doesn't have collapse, but uses viewport checking)
    const getInitialParams = React.useCallback(() => {
      return props.selectedTimeSpan ? ({ selectedTimeSpan: props.selectedTimeSpan } as RefreshParameter) : undefined;
    }, [props.selectedTimeSpan]);

    const { componentRef, refresh, getLastRefreshParameter } = useRefreshable({
      componentId: descriptor.id,
      initialCollapsed: false, // Stat chart is always "expanded"
      refreshInternal,
      getInitialParams,
    });

    // Auto-scale text to fit container
    useEffect(() => {
      const adjustFontSize = () => {
        if (!valueTextRef.current || !valueContainerRef.current) return;
        // Skip if loading and we don't have initial data yet (showing skeleton)
        if (isLoadingValue && !hasInitialData) return;

        const container = valueContainerRef.current;
        const text = valueTextRef.current;
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;

        if (containerWidth === 0 || containerHeight === 0) return; // Not yet rendered

        // Get the actual text content (skip if it's a skeleton)
        const textContent = text.textContent?.trim() || "";
        if (!textContent || textContent === "") return; // No text to measure

        // Create a temporary hidden element to measure natural size
        const tempElement = document.createElement("div");
        tempElement.style.position = "absolute";
        tempElement.style.visibility = "hidden";
        tempElement.style.whiteSpace = "nowrap";
        tempElement.style.fontSize = "3rem";
        tempElement.style.fontWeight = "600"; // font-semibold
        tempElement.style.fontFamily = getComputedStyle(text).fontFamily;
        tempElement.textContent = textContent;
        document.body.appendChild(tempElement);

        // Force a reflow
        void tempElement.offsetWidth;

        const naturalWidth = tempElement.offsetWidth;
        const naturalHeight = tempElement.offsetHeight;

        // Clean up
        document.body.removeChild(tempElement);

        // If text fits, use default size
        if (naturalWidth <= containerWidth && naturalHeight <= containerHeight) {
          setFontSize(3);
          return;
        }

        // Calculate scale factor based on both width and height constraints
        const widthScale = containerWidth / naturalWidth;
        const heightScale = containerHeight / naturalHeight;
        const scale = Math.min(widthScale, heightScale, 1); // Don't scale up, only down

        // Set new font size (3rem is the base size)
        const newFontSize = Math.max(0.75, scale * 3); // Minimum 0.75rem
        setFontSize(newFontSize);
      };

      // Use setTimeout to ensure DOM is updated
      const timeoutId = setTimeout(adjustFontSize, 0);

      // Also adjust on window resize
      const resizeObserver = new ResizeObserver(() => {
        setTimeout(adjustFontSize, 0);
      });
      if (valueContainerRef.current) {
        resizeObserver.observe(valueContainerRef.current);
      }

      return () => {
        clearTimeout(timeoutId);
        resizeObserver.disconnect();
      };
    }, [data, isLoadingValue, hasInitialData]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
    }));

    // Get the first drilldown descriptor if available
    const getFirstDrilldownDescriptor = useCallback((): ChartDescriptor | null => {
      if (!descriptor.drilldown || Object.keys(descriptor.drilldown).length === 0) {
        return null;
      }
      // Get the first descriptor from the drilldown map
      const firstKey = Object.keys(descriptor.drilldown)[0];
      return descriptor.drilldown[firstKey];
    }, [descriptor.drilldown]);

    // Render drilldown component based on descriptor type
    const renderDrilldownComponent = useCallback(
      (drilldownDescriptor: ChartDescriptor) => {
        return (
          <DrilldownChartRenderer
            descriptor={drilldownDescriptor}
            selectedTimeSpan={selectedTimeSpan}
            searchParams={props.searchParams}
          />
        );
      },
      [props.searchParams, selectedTimeSpan]
    );

    // Handle drilldown click
    const handleDrilldownClick = useCallback(() => {
      const drilldownDescriptor = getFirstDrilldownDescriptor();
      if (!drilldownDescriptor) {
        return;
      }

      // Create a modified copy of the descriptor for drilldown
      const modifiedDescriptor: ChartDescriptor = { ...drilldownDescriptor };

      // Hide title in drilldown dialog
      if (modifiedDescriptor.titleOption) {
        modifiedDescriptor.titleOption = {
          ...modifiedDescriptor.titleOption,
          showTitle: false,
        };
      }

      // Make table header sticky if it's a table
      if (modifiedDescriptor.type === "table") {
        const tableDescriptor = modifiedDescriptor as TableDescriptor;
        tableDescriptor.headOption = {
          ...tableDescriptor.headOption,
          isSticky: true,
        };
      }

      const title = modifiedDescriptor.titleOption?.title || "Drilldown";
      const description = modifiedDescriptor.titleOption?.description;

      Dialog.showDialog({
        title,
        description,
        className: "max-w-[60vw] max-h-[90vh]",
        disableContentScroll: false,
        mainContent: <div className="w-full">{renderDrilldownComponent(modifiedDescriptor)}</div>,
      });
    }, [getFirstDrilldownDescriptor, renderDrilldownComponent]);

    // Check if drilldown is available
    const hasDrilldown = useCallback((): boolean => {
      return descriptor.drilldown !== undefined && Object.keys(descriptor.drilldown).length > 0;
    }, [descriptor.drilldown]);

    // Render comparison helper
    const renderComparison = () => {
      if (offset === 0) {
        return null;
      }

      // Show info icon if offset error occurred
      if (offsetError) {
        return (
          <Button
            variant="link"
            size="sm"
            className="absolute right-2 top-2 text-xs flex items-center gap-1 hover:opacity-70 transition-opacity"
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering drilldown
              //ExceptionView.showExceptionInDialog(offsetError);
            }}
          >
            <CircleAlert className="size-3 text-yellow-600" />
          </Button>
        );
      }

      if (isLoadingOffset) {
        return (
          <div className="absolute right-4 top-4 text-xs flex items-center gap-1">
            <Skeleton className="h-3 w-8" />
          </div>
        );
      }

      const delta = data - offsetData;
      const change = delta === 0 && offsetData === 0 ? 0 : (delta / (offsetData === 0 ? delta : offsetData)) * 100;

      return (
        <div
          className="absolute right-4 top-4 text-xs flex items-center gap-1"
          title={"Compared to data in the same period of " + descriptor.comparisonOption?.offset}
        >
          {change >= 0 ? <TrendingUpIcon className="size-3" /> : <TrendingDown className="h-3 w-3" />}
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}%
        </div>
      );
    };

    return (
      <Card ref={componentRef} className="@container/card relative">
        <FloatingProgressBar show={isLoadingValue} />
        <CardHeader className="pt-5 pb-1">
          {descriptor.titleOption?.title && descriptor.titleOption?.showTitle !== false && (
            <CardDescription
              className={descriptor.titleOption?.align ? "text-" + descriptor.titleOption.align : "text-center"}
            >
              {descriptor.titleOption.title}
            </CardDescription>
          )}
          <CardTitle
            className={cn(
              descriptor.valueOption?.align ? "text-" + descriptor.valueOption.align : "text-center",
              "font-semibold tabular-nums"
            )}
          >
            <div ref={valueContainerRef} className="h-16 flex items-center justify-center overflow-hidden px-2">
              <div
                ref={valueTextRef}
                className={cn(
                  "leading-none whitespace-nowrap",
                  hasDrilldown() && "cursor-pointer underline transition-all"
                )}
                style={{
                  fontSize: `${fontSize}rem`,
                }}
                onClick={hasDrilldown() ? handleDrilldownClick : undefined}
              >
                {!hasInitialData ? (
                  <Skeleton className="w-20 h-10" />
                ) : descriptor.valueOption?.format ? (
                  Formatter.getInstance().getFormatter(descriptor.valueOption.format)(data)
                ) : (
                  data
                )}
              </div>
            </div>
            {/* <NumberFlow value={data} format={{ notation: "compact", compactDisplay: "short" }} locales="en-GB" /> */}
          </CardTitle>

          {renderComparison()}
        </CardHeader>
        <CardFooter className="px-0 pb-2">
          {/* Render minimap at the bottom - always reserve space if minimap is configured */}
          {!error && shouldShowMinimap() ? (
            <StatMinimap
              id={descriptor.id || "stat"}
              data={minimapData}
              isLoading={isLoadingMinimap}
              minimap={descriptor.minimapOption!}
            />
          ) : (
            <div className="w-full mt-2">
              <div className="h-[50px]" />
            </div>
          )}
        </CardFooter>
      </Card>
    );
  }
);

RefreshableStatComponent.displayName = "RefreshableStatComponent";

export default RefreshableStatComponent;
export type { RefreshableStatComponentProps };

"use client";

import { Api, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { format } from "date-fns";
import { CircleAlert, TrendingDown, TrendingUpIcon } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Area, AreaChart, Line, LineChart, XAxis, YAxis } from "recharts";
import FloatingProgressBar from "../floating-progress-bar";
import { Button } from "../ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { ChartContainer, ChartTooltip } from "../ui/chart";
import { Skeleton } from "../ui/skeleton";
import type { MinimapOption, Reducer, SQLQuery, StatDescriptor } from "./chart-utils";
import type { RefreshableComponent, RefreshParameter } from "./refreshable-component";
import type { TimeSpan } from "./timespan-selector";

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
  const isLine = minimap.type === "line";
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

const RefreshableStatComponent = forwardRef<RefreshableComponent, RefreshableStatComponentProps>(
  function RefreshableStatComponent(props, ref) {
    const { descriptor, searchParams } = props;
    const { selectedConnection } = useConnection();

    // State
    const [data, setData] = useState(0);
    const [offset, setOffset] = useState(() =>
      descriptor.comparisonOption ? DateTimeExtension.parseOffsetExpression(descriptor.comparisonOption.offset) : 0
    );
    const [offsetData, setOffsetData] = useState(0);
    const [minimapData, setMinimapData] = useState<MinimapDataPoint[]>([]);
    const [isLoadingMinimap, setIsLoadingMinimap] = useState(false);
    const [isLoadingValue, setIsLoadingValue] = useState(false);
    const [isLoadingOffset, setIsLoadingOffset] = useState(false);
    const [offsetError, setOffsetError] = useState("");
    const [error, setError] = useState("");
    const [needRefresh, setNeedRefresh] = useState(false);

    // Refs
    const componentRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const refreshParameterRef = useRef<RefreshParameter | undefined>(undefined);
    const lastRefreshParamRef = useRef<RefreshParameter | undefined>(undefined);

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

    const isComponentInView = useCallback((): boolean => {
      if (componentRef.current) {
        const rect = componentRef.current.getBoundingClientRect();
        // Check if the whole component is in the viewport
        // rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);

        // Check if the component is top of this component in the viewport
        // rect.top is the distance from the top of the component to the top of the viewport.
        // window.innerHeight is the height of the viewport.
        // document.documentElement.clientHeight is the height of the viewport in case window.innerHeight is not available (for older browsers).
        return rect.top >= 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight);
      }
      return false;
    }, []);

    const loadData = useCallback(
      async (param: RefreshParameter, isOffset: boolean = false) => {
        const showMinimap = shouldShowMinimap() && !isOffset;

        console.trace(
          `Loading data for stat [${descriptor.id}], isOffset: ${isOffset}, showMinimap: ${showMinimap}, queryType: ${descriptor.query?.type}`
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
              thisQuery,
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

                console.trace(
                  `Updated state for stat [${descriptor.id}], data: ${reducedValue}, minimapData: ${minimapDataResult.length} points`
                );
              },
              (error) => {
                console.error(error);
              }
            );
          } else {
            // For non-timeseries or no minimap, use the original scalar fetcher
            const query = Object.assign({}, descriptor.query);

            Api.create(selectedConnection!).executeSQL(
              query,
              (response) => {
                if (isOffset) {
                  setOffsetData(dataResult);
                  setOffsetError("");
                } else {
                  setData(dataResult);
                  setError("");
                }
              },
              (error) => {
                setError(error.errorMessage);
              }
            );
          }
        } catch (error) {
          if (isOffset) {
            setOffsetError((error as Error).message);
          } else {
            setError((error as Error).message);
            console.error(error);
          }
        } finally {
          if (isOffset) {
            setIsLoadingOffset(false);
          } else {
            setIsLoadingValue(false);
            setIsLoadingMinimap(false);
          }
        }
      },
      [descriptor, shouldShowMinimap, getMinimapDataFromResponse, calculateReducedValue]
    );

    const refreshInternal = useCallback(() => {
      console.trace(`Refreshing stat [${descriptor.id}]...`);

      const currentParam = refreshParameterRef.current;

      if (!descriptor.query) {
        console.error(`No query defined for stat [${descriptor.id}]`);
        setError("No query defined for this stat component.");
        return;
      }

      if (!currentParam || !currentParam.selectedTimeSpan) {
        console.error(`No timespan for stat [${descriptor.id}]`);
        setError("Please choose time span.");
        return;
      }

      // Load data - for timeseries with minimap, we get both stat and minimap from same response
      loadData(currentParam);

      // Load offset data
      if (offset !== 0) {
        const offsetTimeSpan = {
          startISO8601: DateTimeExtension.formatISO8601(
            new Date(new Date(currentParam.selectedTimeSpan.startISO8601).getTime() + offset * 1000)
          ),

          endISO8601: DateTimeExtension.formatISO8601(
            new Date(new Date(currentParam.selectedTimeSpan.endISO8601).getTime() + offset * 1000)
          ),
        };

        const offsetParam: RefreshParameter = {
          ...currentParam,
          selectedTimeSpan: offsetTimeSpan,
        };

        loadData(offsetParam, true);
      }
    }, [descriptor, offset, loadData]);

    const refresh = useCallback(
      async (param: RefreshParameter) => {
        // Check if the parameters have actually changed
        // Skip refresh if we already have data with the same parameters (avoid unnecessary API calls)
        if (lastRefreshParamRef.current && JSON.stringify(lastRefreshParamRef.current) === JSON.stringify(param)) {
          console.trace(`Stat component [${descriptor.id}] skipping refresh - parameters unchanged`);
          return;
        }

        lastRefreshParamRef.current = param;
        refreshParameterRef.current = param;

        console.trace(
          `Stat component [${descriptor.id}] refresh called, isInView: ${isComponentInView()}, hasTimeSpan: ${!!param.selectedTimeSpan}`
        );

        if (!isComponentInView()) {
          setNeedRefresh(true);
          return;
        }
        refreshInternal();
      },
      [descriptor.id, isComponentInView, refreshInternal]
    );

    const getLastRefreshParameter = useCallback((): RefreshParameter => {
      return refreshParameterRef.current!;
    }, []);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
    }));

    // IntersectionObserver setup
    useEffect(() => {
      const handleIntersection = (entries: IntersectionObserverEntry[]) => {
        const entry = entries[0];
        if (entry.isIntersecting && needRefresh) {
          console.trace(`Refreshing chart [${descriptor.id}] as it's in the viewport...`);
          refreshInternal();
          setNeedRefresh(false);
        }
      };

      observerRef.current = new IntersectionObserver(handleIntersection, {
        root: null,
        rootMargin: "0px",
        threshold: 0.1,
      });

      if (componentRef.current) {
        observerRef.current.observe(componentRef.current);
      }

      return () => {
        if (componentRef.current && observerRef.current) {
          observerRef.current.unobserve(componentRef.current);
        }
      };
    }, [descriptor.id, needRefresh, refreshInternal]);

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
            onClick={() => {
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
        <CardHeader
          className={`pt-5 pb-1 transition-opacity duration-200 ${isLoadingValue ? "opacity-70" : "opacity-100"}`}
        >
          <CardDescription
            className={descriptor.titleOption?.align ? "text-" + descriptor.titleOption.align : "text-center"}
          >
            {descriptor.titleOption?.title}
          </CardDescription>
          <CardTitle
            className={cn(
              descriptor.valueOption?.align ? "text-" + descriptor.valueOption.align : "text-center",
              "text-5xl font-semibold tabular-nums"
            )}
          >
            <NumberFlow value={data} format={{ notation: "compact", compactDisplay: "short" }} locales="en-GB" />
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

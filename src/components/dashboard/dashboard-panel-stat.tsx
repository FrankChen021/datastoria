"use client";

import { Api, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { format } from "date-fns";
import * as echarts from "echarts";
import { CircleAlert, TrendingDown, TrendingUpIcon } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Formatter } from "../../lib/formatter";
import { Button } from "../ui/button";
import { CardContent, CardFooter, CardTitle } from "../ui/card";
import { DropdownMenuItem } from "../ui/dropdown-menu";
import { Skeleton } from "../ui/skeleton";
import { Dialog } from "../use-dialog";
import { SKELETON_FADE_DURATION, SKELETON_MIN_DISPLAY_TIME } from "./constants";
import { classifyColumns, transformRowsToChartData } from "./dashboard-data-utils";
import { showQueryDialog } from "./dashboard-dialog-utils";
import type {
  MinimapOption,
  PanelDescriptor,
  Reducer,
  SQLQuery,
  StatDescriptor,
  TableDescriptor,
} from "./dashboard-model";
import { DashboardPanel } from "./dashboard-panel";
import type { DashboardPanelComponent, RefreshOptions } from "./dashboard-panel-layout";
import { DashboardPanelLayout } from "./dashboard-panel-layout";
import { replaceTimeSpanParams } from "./sql-time-utils";
import type { TimeSpan } from "./timespan-selector";
import useIsDarkTheme from "./use-is-dark-theme";
import { useRefreshable } from "./use-refreshable";

interface DashboardPanelStatProps {
  // The stat descriptor configuration
  descriptor: StatDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;

  // Initial loading state (useful for drilldown dialogs)
  initialLoading?: boolean;

  // Callback when collapsed state changes
  onCollapsedChange?: (isCollapsed: boolean) => void;
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
  option: MinimapOption;
  onBrushChange?: (startTimestamp: number, endTimestamp: number) => void;
}

const StatMinimap = React.memo<StatMinimapProps>(function StatMinimap({ id, data, isLoading, option, onBrushChange }) {
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const chartInstanceRef = React.useRef<echarts.ECharts | null>(null);
  const brushHandlerRef = React.useRef<((params: unknown) => void) | null>(null);
  const [chartColor, setChartColor] = React.useState<string>("hsl(var(--chart-1))");
  const isDark = useIsDarkTheme();

  React.useEffect(() => {
    const updateChartColor = () => {
      const tempEl = document.createElement("div");
      tempEl.style.color = "var(--chart-1)";
      tempEl.style.position = "absolute";
      tempEl.style.visibility = "hidden";
      document.body.appendChild(tempEl);

      const computedColor = getComputedStyle(tempEl).color;
      document.body.removeChild(tempEl);

      if (computedColor && computedColor !== "rgba(0, 0, 0, 0)" && computedColor !== "rgb(0, 0, 0)") {
        setChartColor(computedColor);
      } else {
        tempEl.style.color = "var(--primary)";
        document.body.appendChild(tempEl);
        const fallbackColor = getComputedStyle(tempEl).color;
        document.body.removeChild(tempEl);
        if (fallbackColor && fallbackColor !== "rgba(0, 0, 0, 0)" && fallbackColor !== "rgb(0, 0, 0)") {
          setChartColor(fallbackColor);
        } else {
          const dark = document.documentElement.classList.contains("dark");
          setChartColor(dark ? "rgb(120, 200, 150)" : "rgb(50, 150, 100)");
        }
      }
    };

    updateChartColor();
    const observer = new MutationObserver(updateChartColor);
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => observer.disconnect();
  }, []);

  // Initialize echarts instance with theme support (separate from data updates)
  React.useEffect(() => {
    const chartDom = chartContainerRef.current;
    if (!chartDom) {
      return;
    }

    // Dispose existing instance if theme changed
    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    // Initialize chart with theme (matching timeseries chart pattern)
    const chartTheme = isDark ? "dark" : undefined;
    const chart = echarts.init(chartDom, chartTheme);
    chartInstanceRef.current = chart;

    const handleResize = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (chartInstanceRef.current) {
              requestAnimationFrame(() => {
                if (chartInstanceRef.current) {
                  chartInstanceRef.current.resize();
                }
              });
            }
          })
        : null;
    if (resizeObserver && chartDom) {
      resizeObserver.observe(chartDom);
    }

    // Initial resize after a short delay
    const initialResizeTimeout = setTimeout(() => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize();
      }
    }, 100);

    return () => {
      clearTimeout(initialResizeTimeout);
      if (resizeObserver && chartDom) {
        resizeObserver.unobserve(chartDom);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", handleResize);
      }
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [isDark]);

  // Update chart when data changes (separate from initialization)
  React.useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || data.length === 0) {
      return;
    }

    const xAxisData = data.map((point) => format(new Date(point.timestamp), "MM-dd HH:mm:ss"));
    const seriesData = data.map((point) => point.value);

    const chartOption: echarts.EChartsOption = {
      backgroundColor: "transparent",
      animation: false,
      grid: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        containLabel: false,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
        },
        appendToBody: true,
        // Prevent tooltip from capturing pointer events which causes chart to flicker/disappear
        extraCssText: "pointer-events: none; z-index: 9999;",
        position: (point, _params, _dom, _rect, size) => {
          // Position tooltip above the point to avoid overlapping the chart area
          return [point[0] - size.contentSize[0] / 2, point[1] - size.contentSize[1] - 10];
        },
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) {
            return "";
          }
          const firstParam = params[0] as { dataIndex: number };
          const point = data[firstParam.dataIndex];
          if (!point) {
            return "";
          }

          const timestampLabel = format(new Date(point.timestamp), "MM-dd HH:mm:ss");
          return `
            <div style="margin-bottom: 4px;">${timestampLabel}</div>
            <div style="margin-top: 2px; white-space: nowrap;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${chartColor};margin-right:5px;"></span>
              <strong>${Number(point.value).toFixed(2)}</strong>
      </div>
          `;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: xAxisData,
        show: false,
      },
      yAxis: {
        type: "value",
        show: false,
        scale: true,
      },
      brush: onBrushChange
        ? {
            xAxisIndex: "all",
            brushLink: "all",
            brushMode: "single",
            brushStyle: {
              color: "rgba(120,120,120,0.15)",
            },
          }
        : undefined,
      toolbox: {
        show: false,
      },
      series: [
        {
          type: "line",
          data: seriesData,
          smooth: true,
          showSymbol: false,
          // Disable hover/emphasis state changes but allow brush interaction
          silent: !onBrushChange, // Only silent when brush is not enabled
          emphasis: {
            disabled: true,
          },
          blur: {
            lineStyle: {
              width: 1.5,
              color: chartColor,
              opacity: 1,
            },
          },
          lineStyle: {
            width: 1.5,
            color: chartColor,
          },
          areaStyle:
            option.type === "area"
              ? {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: chartColor },
                    { offset: 1, color: "rgba(255,255,255,0)" },
                  ]),
                }
              : undefined,
        },
      ],
    };

    // Use notMerge: false to merge options instead of replacing them completely
    // This prevents the chart from being completely redrawn on every update
    chart.setOption(chartOption, false, false);

    if (onBrushChange) {
      // Remove old handlers
      if (brushHandlerRef.current) {
        chart.off("brushEnd", brushHandlerRef.current);
      }

      const handler = (params: unknown) => {
        const brushParams = params as {
          batch?: Array<{ areas?: Array<{ coordRange?: [number, number] | number[] }> }>;
          brushComponents?: Array<{ coordRange?: [number, number] | number[] }>;
          areas?: Array<{ coordRange?: [number, number] | number[] }>;
        };

        let brushAreas: Array<{ coordRange?: [number, number] | number[] }> = [];
        if (brushParams.batch && brushParams.batch.length > 0 && brushParams.batch[0].areas) {
          brushAreas = brushParams.batch[0].areas ?? [];
        } else if (brushParams.brushComponents) {
          brushAreas = brushParams.brushComponents;
        } else if (brushParams.areas) {
          brushAreas = brushParams.areas;
        }

        if (brushAreas.length === 0) {
          return;
        }

        const brushArea = brushAreas[0];
        if (!brushArea.coordRange || brushArea.coordRange.length < 2) {
          return;
        }

        const [startIndex, endIndex] = brushArea.coordRange;
        const clampedStart = Math.max(0, Math.min(data.length - 1, Math.floor(startIndex)));
        const clampedEnd = Math.max(0, Math.min(data.length - 1, Math.ceil(endIndex)));
        if (clampedStart === clampedEnd) {
          return;
        }

        const startPoint = data[Math.min(clampedStart, clampedEnd)];
        const endPoint = data[Math.max(clampedStart, clampedEnd)];
        if (!startPoint || !endPoint) {
          return;
        }

        onBrushChange(startPoint.timestamp, endPoint.timestamp);
      };

      brushHandlerRef.current = handler;
      chart.on("brushEnd", handler);

      // Enable brush mode
      chart.dispatchAction({
        type: "takeGlobalCursor",
        key: "brush",
        brushOption: {
          brushType: "lineX",
          brushMode: "single",
        },
      });
    } else if (brushHandlerRef.current) {
      chart.off("brushEnd", brushHandlerRef.current);
      brushHandlerRef.current = null;
    }

    // Resize chart after setting option to ensure proper rendering
    requestAnimationFrame(() => {
      if (chart) {
        chart.resize();
      }
    });

    return () => {
      if (chart && brushHandlerRef.current) {
        chart.off("brushEnd", brushHandlerRef.current);
        brushHandlerRef.current = null;
      }
    };
  }, [data, option.type, chartColor, onBrushChange]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      const chart = chartInstanceRef.current;
      if (chart) {
        const cleanup = (chart as unknown as { _cleanup?: () => void })._cleanup;
        if (cleanup) {
          cleanup();
        } else {
          chart.dispose();
          chartInstanceRef.current = null;
        }
      }
    };
  }, []);

  return (
    <div className="w-full mt-2">
      {isLoading && data.length === 0 ? (
        <Skeleton className="h-[50px] w-full" />
      ) : data.length === 0 ? (
        <div className="h-[45px]" />
      ) : (
        <div
          ref={chartContainerRef}
          className={`h-[45px] w-full transition-opacity duration-300 ${isLoading ? "opacity-50" : "opacity-100"}`}
          style={{ pointerEvents: "auto", position: "relative" }}
          data-minimap-id={id}
        />
      )}
    </div>
  );
});

const DashboardPanelStat = forwardRef<DashboardPanelComponent, DashboardPanelStatProps>(
  function RefreshableStatComponent(props, ref) {
    const { descriptor, selectedTimeSpan } = props;
    const { selectedConnection } = useConnection();

    // State
    const [data, setData] = useState(0);
    const valueTextRef = useRef<HTMLDivElement>(null);
    const valueContainerRef = useRef<HTMLDivElement>(null);
    const [fontSize, setFontSize] = useState(3); // Start with 3rem (text-5xl equivalent)
    const fontSizeRef = useRef(3); // Keep ref in sync for effect optimization
    const [offset] = useState(() =>
      descriptor.comparisonOption ? DateTimeExtension.parseOffsetExpression(descriptor.comparisonOption.offset) : 0
    );
    const [offsetData] = useState(0);
    const [minimapData, setMinimapData] = useState<MinimapDataPoint[]>([]);
    const [isLoadingMinimap, setIsLoadingMinimap] = useState(false);
    const [isLoadingValue, setIsLoadingValue] = useState(props.initialLoading ?? false);
    const [isLoadingOffset, setIsLoadingOffset] = useState(false);
    const [offsetError, setOffsetError] = useState("");
    const [error, setError] = useState("");
    const [hasInitialData, setHasInitialData] = useState(false); // Track if we've ever received data
    // Skeleton timing state for smooth transitions
    const [shouldShowSkeleton, setShouldShowSkeleton] = useState(false);
    const [skeletonOpacity, setSkeletonOpacity] = useState(1);
    // Refs for skeleton timing
    const skeletonStartTimeRef = useRef<number | null>(null);
    const skeletonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Helper functions
    const shouldShowMinimap = useCallback((): boolean => {
      if (!descriptor.minimapOption || descriptor.minimapOption.type === "none") {
        return false;
      }
      return true;
    }, [descriptor]);

    const getMinimapDataFromResponse = useCallback((response: ApiResponse): MinimapDataPoint[] => {
      if (!response.data) {
        return [];
      }

      try {
        const responseData = response.data;

        // JSON format returns { meta: [...], data: [...], rows: number, statistics: {...} }
        const rows = responseData.data || [];
        const meta = responseData.meta || [];

        if (rows.length === 0) {
          return [];
        }

        // Transform rows to chart data format (with timestamp normalized)
        const transformedData = transformRowsToChartData(rows, meta);

        // Classify columns to find timestamp and metric columns
        const allColumns =
          meta.length > 0 ? meta.map((m: { name: string }) => m.name) : Object.keys(transformedData[0]);
        const { timestampKey, metricColumns } = classifyColumns(allColumns, meta, transformedData);

        // Use the first metric column as the value for the minimap
        const valueColumn = metricColumns[0] || "value";

        // Build minimap data points
        const dataPoints: MinimapDataPoint[] = [];
        transformedData.forEach((row) => {
          const timestamp = row[timestampKey] as number;
          const value = row[valueColumn];

          if (timestamp && value !== null && value !== undefined) {
            // Convert value to number
            let numValue: number;
            if (typeof value === "number") {
              numValue = value;
            } else if (typeof value === "string") {
              numValue = parseFloat(value);
              if (isNaN(numValue)) return; // Skip invalid values
            } else {
              return; // Skip non-numeric values
            }

            dataPoints.push({
              timestamp,
              value: numValue,
            });
          }
        });

        // Sort by timestamp
        dataPoints.sort((a, b) => a.timestamp - b.timestamp);

        return dataPoints;
      } catch (error) {
        console.error("Error processing minimap data:", error);
        return [];
      }
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
      async (_param: RefreshOptions, isOffset: boolean = false) => {
        // Validate that we have a time span
        if (!_param.selectedTimeSpan) {
          if (!isOffset) {
            setError("Please choose time span.");
          }
          return;
        }

        const showMinimap = shouldShowMinimap() && !isOffset;

        // Don't clear previous data during reload to prevent flickering
        // Only set loading state
        if (isOffset) {
          setIsLoadingOffset(true);
        } else {
          setIsLoadingValue(true);
          setIsLoadingMinimap(showMinimap);
        }

        try {
          // For queries with minimap, we need the full response to build the minimap
          if (showMinimap) {
            const query = descriptor.query;
            const thisQuery = Object.assign({}, query) as SQLQuery;

            // Replace time span template parameters in SQL
            const finalSql = replaceTimeSpanParams(thisQuery.sql, _param.selectedTimeSpan);
            const { response } = Api.create(selectedConnection!).executeAsyncOnNode(
              selectedConnection!.runtime?.targetNode,
              finalSql,
              {
                default_format: "JSON",
                output_format_json_quote_64bit_integers: 0,
              },
              {
                "Content-Type": "text/plain",
                ...query.headers,
              }
            );

            response
              .then((apiResponse) => {
                // Process the response into minimap data points
                const minimapDataResult = getMinimapDataFromResponse(apiResponse);

                // Calculate reduced value using the reducer
                const reducer = descriptor.valueOption?.reducer || "avg";
                const reducedValue = calculateReducedValue(minimapDataResult, reducer);

                // Update state with both the reduced value and minimap data
                setData(reducedValue);
                setMinimapData(minimapDataResult);
                setError("");
                setHasInitialData(true);
                setIsLoadingValue(false);
                setIsLoadingMinimap(false);
              })
              .catch((error) => {
                setError(error.data || error.errorMessage || "Failed to load data");
                setIsLoadingValue(false);
                setIsLoadingMinimap(false);
              });
          } else {
            // For non-timeseries or no minimap, use the original scalar fetcher
            const query = Object.assign({}, descriptor.query);

            // Replace time span template parameters in SQL
            const finalSql = replaceTimeSpanParams(query.sql, _param.selectedTimeSpan);
            const { response } = Api.create(selectedConnection!).executeAsyncOnNode(
              selectedConnection!.runtime?.targetNode,
              finalSql,
              {
                default_format: "JSONCompact",
                output_format_json_quote_64bit_integers: 0,
              },
              {
                "Content-Type": "text/plain",
                ...query.headers,
              }
            );

            response
              .then((apiResponse) => {
                if (isOffset) {
                  //setOffsetData(dataResult);
                  setOffsetError("");
                } else {
                  const responsJson = apiResponse.data;
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
              })
              .catch((error) => {
                setError(error.data || error.errorMessage || "Failed to load data");
                setIsLoadingValue(false);
                setIsLoadingMinimap(false);
              });
          }
        } catch (error) {
          if (isOffset) {
            setOffsetError((error as Error).message);
            setIsLoadingOffset(false);
          } else {
            setError((error as Error).message);
            setIsLoadingValue(false);
            setIsLoadingMinimap(false);
          }
        }
      },
      [descriptor, shouldShowMinimap, getMinimapDataFromResponse, calculateReducedValue, selectedConnection]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshOptions) => {
        if (!descriptor.query) {
          setError("No query defined for this stat component.");
          return;
        }

        if (!param.selectedTimeSpan) {
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

          const offsetParam: RefreshOptions = {
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
      return props.selectedTimeSpan ? ({ selectedTimeSpan: props.selectedTimeSpan } as RefreshOptions) : undefined;
    }, [props.selectedTimeSpan]);

    const { componentRef, isCollapsed, refresh, getLastRefreshParameter } = useRefreshable({
      initialCollapsed: false, // Stat chart is always "expanded"
      refreshInternal,
      getInitialParams,
      onCollapsedChange: props.onCollapsedChange,
    });

    // Auto-scale text to fit container
    useEffect(() => {
      // Helper function to create a measurement element with given font size
      const createMeasurementElement = (
        fontSize: string,
        textContent: string,
        textStyles: CSSStyleDeclaration
      ): HTMLDivElement => {
        const element = document.createElement("div");
        element.style.position = "absolute";
        element.style.visibility = "hidden";
        element.style.top = "-9999px";
        element.style.left = "-9999px";
        element.style.whiteSpace = "nowrap";
        element.style.fontSize = fontSize;
        element.style.fontWeight = textStyles.fontWeight;
        element.style.fontFamily = textStyles.fontFamily;
        element.style.fontStyle = textStyles.fontStyle;
        element.style.letterSpacing = textStyles.letterSpacing;
        element.style.textTransform = textStyles.textTransform;
        element.style.lineHeight = textStyles.lineHeight;
        element.style.fontVariant = textStyles.fontVariant;
        element.style.textRendering = textStyles.textRendering;
        element.textContent = textContent;
        return element;
      };

      // Helper function to measure text width at a given font size
      const measureTextWidth = (fontSize: string, textContent: string, textStyles: CSSStyleDeclaration): number => {
        const element = createMeasurementElement(fontSize, textContent, textStyles);
        document.body.appendChild(element);
        void element.offsetWidth; // Force reflow
        const width = Math.max(element.scrollWidth, element.offsetWidth);
        document.body.removeChild(element);
        return width;
      };

      const adjustFontSize = () => {
        if (!valueTextRef.current || !valueContainerRef.current) return;
        // Skip if loading and we don't have initial data yet (showing skeleton)
        if (isLoadingValue && !hasInitialData) return;

        const container = valueContainerRef.current;
        const text = valueTextRef.current;

        // Get computed styles once and cache
        const containerStyles = getComputedStyle(container);
        const textStyles = getComputedStyle(text);

        // Calculate available width (accounting for padding)
        const paddingLeft = parseFloat(containerStyles.paddingLeft) || 0;
        const paddingRight = parseFloat(containerStyles.paddingRight) || 0;
        const containerWidth = container.clientWidth || container.offsetWidth - paddingLeft - paddingRight;
        const containerHeight = container.offsetHeight;

        if (containerWidth <= 0 || containerHeight <= 0) return; // Not yet rendered

        // Get the actual text content
        const textContent = text.textContent?.trim() || "";
        if (!textContent) return; // No text to measure

        // Constants for safety margins
        const widthMargin = 16; // 8px on each side
        const heightMargin = 4;
        const availableWidth = Math.max(0, containerWidth - widthMargin);
        const availableHeight = Math.max(0, containerHeight - heightMargin);

        // Measure natural dimensions at 3rem (base size)
        const measureElement = createMeasurementElement("3rem", textContent, textStyles);
        document.body.appendChild(measureElement);
        void measureElement.offsetWidth; // Force reflow
        const naturalWidth = Math.max(measureElement.scrollWidth, measureElement.offsetWidth);
        const naturalHeight = measureElement.offsetHeight;
        document.body.removeChild(measureElement);

        // If text fits at 3rem, use default size
        if (naturalWidth <= availableWidth && naturalHeight <= availableHeight) {
          if (fontSizeRef.current !== 3) {
            setFontSize(3);
            fontSizeRef.current = 3;
          }
          return;
        }

        // Calculate scale factor based on natural dimensions
        if (naturalWidth <= 0 || naturalHeight <= 0) return;

        const widthScale = availableWidth / naturalWidth;
        const heightScale = availableHeight / naturalHeight;
        const scale = Math.min(widthScale, heightScale, 1); // Don't scale up, only down

        // Calculate new font size with safety margin (3% reduction)
        const safetyScale = 0.97;
        let newFontSizeRem = Math.max(0.75, scale * 3 * safetyScale);

        // Verify: measure at calculated size and adjust if needed
        const verifiedWidth = measureTextWidth(`${newFontSizeRem}rem`, textContent, textStyles);

        // If still too wide, scale down further with additional 2% margin
        if (verifiedWidth > availableWidth) {
          const additionalScale = (availableWidth / verifiedWidth) * 0.98;
          newFontSizeRem = Math.max(0.75, newFontSizeRem * additionalScale);
        }

        // Only update if the change is significant (to avoid infinite loops and flickering)
        if (Math.abs(newFontSizeRem - fontSizeRef.current) > 0.05) {
          setFontSize(newFontSizeRem);
          fontSizeRef.current = newFontSizeRem;
        }
      };

      // Throttle adjustFontSize to prevent excessive calculations
      let pendingAdjustment = false;
      let rafId: number | null = null;
      const scheduleAdjustment = () => {
        if (pendingAdjustment) return;
        pendingAdjustment = true;
        rafId = requestAnimationFrame(() => {
          rafId = requestAnimationFrame(() => {
            // Double rAF ensures that NumberFlow and other async components have rendered
            adjustFontSize();
            pendingAdjustment = false;
          });
        });
      };

      // Initial adjustment
      scheduleAdjustment();

      // Watch for content changes in the text element (handles NumberFlow updates)
      const mutationObserver = new MutationObserver(() => {
        scheduleAdjustment();
      });

      if (valueTextRef.current) {
        mutationObserver.observe(valueTextRef.current, {
          characterData: true,
          childList: true,
          subtree: true,
        });
      }

      // Also adjust on container resize
      const resizeObserver = new ResizeObserver(() => {
        scheduleAdjustment();
      });
      if (valueContainerRef.current) {
        resizeObserver.observe(valueContainerRef.current);
      }

      return () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        mutationObserver.disconnect();
        resizeObserver.disconnect();
      };
    }, [data, isLoadingValue, hasInitialData]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
      getLastRefreshOptions: getLastRefreshParameter, // Alias for compatibility
    }));

    // Skeleton timing logic: minimum display time + fade transition
    useEffect(() => {
      // Only show skeleton on initial load (when hasInitialData is false)
      const shouldShow = isLoadingValue && !hasInitialData;

      if (shouldShow) {
        // Start showing skeleton only if not already showing
        if (skeletonStartTimeRef.current === null) {
          skeletonStartTimeRef.current = Date.now();
          setShouldShowSkeleton(true);
          setSkeletonOpacity(1);
        }
      } else {
        // Loading stopped or data arrived - handle fade-out with minimum display time
        // Only start fade-out if skeleton is currently showing
        if (skeletonStartTimeRef.current !== null) {
          // Clear any existing timeout to prevent multiple fade-outs
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
    }, [isLoadingValue, hasInitialData]);

    // Handle main content drilldown click
    const handleDrilldownClick = useCallback(() => {
      const drilldownDescriptor = descriptor.drilldown?.main;
      if (!drilldownDescriptor) {
        return;
      }

      // Create a modified copy of the descriptor for drilldown
      const modifiedDescriptor: PanelDescriptor = { ...drilldownDescriptor };

      // Hide title in drilldown dialog
      if (modifiedDescriptor.titleOption) {
        modifiedDescriptor.titleOption = {
          ...modifiedDescriptor.titleOption,
          showTitle: false,
        };
      }
      modifiedDescriptor.collapsed = false;

      // Make table header sticky and set height for tables in dialog mode
      if (modifiedDescriptor.type === "table") {
        const tableDescriptor = modifiedDescriptor as TableDescriptor;
        tableDescriptor.headOption = {
          ...tableDescriptor.headOption,
          isSticky: true,
        };
        // Set height for dialog mode (70vh matches the dialog height)
        if (!tableDescriptor.height) {
          tableDescriptor.height = 70; // 70vh
        }
      }

      const title = modifiedDescriptor.titleOption?.title || "Drilldown";
      const description = modifiedDescriptor.titleOption?.description;

      Dialog.showDialog({
        title,
        description,
        className: "max-w-[60vw] h-[70vh]",
        disableContentScroll: false,
        mainContent: (
          <div className="w-full h-full overflow-auto">
            <DashboardPanel descriptor={modifiedDescriptor} selectedTimeSpan={selectedTimeSpan} initialLoading={true} />
          </div>
        ),
      });
    }, [descriptor.drilldown, selectedTimeSpan]);

    // Handle minimap drilldown with selected time range
    const handleMinimapDrilldown = useCallback(
      (startTimestamp: number, endTimestamp: number) => {
        const drilldownDescriptor = descriptor.drilldown?.minimap;
        if (!drilldownDescriptor) {
          return;
        }

        // Create a modified copy of the descriptor for drilldown
        const modifiedDescriptor: PanelDescriptor = { ...drilldownDescriptor };

        // Hide title in drilldown dialog
        if (modifiedDescriptor.titleOption) {
          modifiedDescriptor.titleOption = {
            ...modifiedDescriptor.titleOption,
            showTitle: false,
          };
        }
        modifiedDescriptor.collapsed = false;

        // Make table header sticky and set height for tables in dialog mode
        if (modifiedDescriptor.type === "table") {
          const tableDescriptor = modifiedDescriptor as TableDescriptor;
          tableDescriptor.headOption = {
            ...tableDescriptor.headOption,
            isSticky: true,
          };
          // Set height for dialog mode (70vh matches the dialog height)
          if (!tableDescriptor.height) {
            tableDescriptor.height = 70; // 70vh
          }
        }

        // Create a time span from the selected range
        const selectedTimeSpan: TimeSpan = {
          startISO8601: DateTimeExtension.formatISO8601(new Date(startTimestamp)) || "",
          endISO8601: DateTimeExtension.formatISO8601(new Date(endTimestamp)) || "",
        };

        const title = modifiedDescriptor.titleOption?.title || "Drilldown";
        const description = modifiedDescriptor.titleOption?.description;

        Dialog.showDialog({
          title,
          description,
          className: "max-w-[60vw] h-[70vh]",
          disableContentScroll: false,
          mainContent: (
            <div className="w-full h-full overflow-auto">
              <DashboardPanel
                descriptor={modifiedDescriptor}
                selectedTimeSpan={selectedTimeSpan}
                initialLoading={true}
              />
            </div>
          ),
        });
      },
      [descriptor.drilldown]
    );

    // Check if main drilldown is available
    const hasMainDrilldown = descriptor.drilldown !== undefined && descriptor.drilldown.main !== undefined;

    // Check if minimap drilldown is available
    const hasMinimapDrilldown = descriptor.drilldown !== undefined && descriptor.drilldown.minimap !== undefined;

    // Handler for showing query dialog
    const handleShowQuery = useCallback(() => {
      showQueryDialog(descriptor.query, descriptor.titleOption?.title);
    }, [descriptor.query, descriptor.titleOption]);

    // Check if we should use NumberFlow for rendering
    const shouldUseNumberFlow = useCallback((): boolean => {
      // Temporarily set to disable number flow because it doest not fit the view and it's too complicated
      return false;
      /*
        if (typeof dataValue !== "number") {
          return false;
        }

        const formatName = descriptor.valueOption?.format;
        if (!formatName) {
          // No format specified, use NumberFlow with default formatting
          return true;
        }

        // Use NumberFlow for supported formats, otherwise use Formatter
        // Supported formats: compact_number, short_number, comma_number, percentage, percentage_0_1, binary_size
        // Note: NumberFlow only supports Intl.NumberFormatOptions, not custom formatter functions
        const formatStr = formatName as string;
        const supportedFormats = ["compact_number", "short_number", "comma_number", "percentage", "percentage_0_1", "binary_size"];
        return supportedFormats.includes(formatStr);
        */
    }, []);

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

    // Get height from descriptor, default to 180px
    const cardHeight = descriptor.height ?? 180;
    const hasTitle = !!descriptor.titleOption?.title && descriptor.titleOption?.showTitle !== false;

    // Build dropdown menu items
    const dropdownItems = (
      <>
        {descriptor.query?.sql && <DropdownMenuItem onClick={handleShowQuery}>Show query</DropdownMenuItem>}
        {!hasTitle && hasMainDrilldown && (
          <DropdownMenuItem onClick={handleDrilldownClick}>View details</DropdownMenuItem>
        )}
      </>
    );

    return (
      <DashboardPanelLayout
        componentRef={componentRef}
        style={{ height: `${cardHeight}px` }}
        isLoading={isLoadingValue}
        titleOption={descriptor.titleOption}
        dropdownItems={dropdownItems}
        headerBackground={true}
      >
        <CardContent className="pt-5 pb-1 px-0 relative">
          <CardTitle
            className={cn(
              descriptor.valueOption?.align ? "text-" + descriptor.valueOption.align : "text-center",
              "font-semibold tabular-nums"
            )}
          >
            {error && <div key="error" className="text-destructive text-xs">{error}</div>}
            {!error && (
              <div ref={valueContainerRef} className="h-16 flex items-center justify-center overflow-hidden px-2">
                <div
                  ref={valueTextRef}
                  className={cn(
                    "leading-none whitespace-nowrap",
                    hasMainDrilldown && "cursor-pointer underline transition-all"
                  )}
                  style={{
                    fontSize: `${fontSize}rem`,
                  }}
                  onClick={hasMainDrilldown ? handleDrilldownClick : undefined}
                >
                  {shouldShowSkeleton ? (
                    <div className="transition-opacity duration-150" style={{ opacity: skeletonOpacity }}>
                      <Skeleton className="w-20 h-10" />
                    </div>
                  ) : shouldUseNumberFlow() ? (
                    (() => {
                      // Default to 'compact_number' if no format is specified
                      const originalFormatName = descriptor.valueOption?.format;
                      const formatName = originalFormatName || "compact_number";

                      // Map format names to NumberFlow format options (inline)
                      // Note: NumberFlow supports Intl.NumberFormatOptions through the format prop
                      // It does not support custom formatter functions, only standard Intl.NumberFormat options
                      let numberFlowFormat: Record<string, unknown> | undefined;
                      // Handle format names (including "compact_number" which is an alias for "short_number")
                      // Cast to string to handle "compact_number" which is not in FormatName type but is used in practice
                      const formatStr = formatName as string;
                      if (formatStr === "compact_number" || formatStr === "short_number") {
                        numberFlowFormat = { notation: "compact", compactDisplay: "short" };
                      } else if (formatStr === "comma_number") {
                        numberFlowFormat = { useGrouping: true };
                      } else if (formatStr === "percentage") {
                        // percentage format expects values already as percentages (e.g., 50 = 50%)
                        // NumberFlow with style: "percent" multiplies by 100, so we need to divide by 100 first
                        numberFlowFormat = { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 };
                      } else if (formatStr === "percentage_0_1") {
                        // This format expects values in [0,1] range (e.g., 0.5 = 50%)
                        // NumberFlow with style: "percent" multiplies by 100, so we pass as-is
                        numberFlowFormat = { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 };
                      } else if (formatStr === "binary_size") {
                        // binary_size format converts bytes to binary units (KB, MB, GB, etc.)
                        numberFlowFormat = { notation: "binary_size" };
                      } else {
                        numberFlowFormat = undefined;
                      }

                      // Handle percentage formats: NumberFlow with style: "percent" multiplies by 100
                      // - percentage: value is already a percentage (e.g., 50 = 50%), so divide by 100
                      // - percentage_0_1: value is in [0,1] range (e.g., 0.5 = 50%), pass as-is
                      let displayValue = data;
                      if (originalFormatName === "percentage") {
                        displayValue = data / 100;
                      }

                      return (
                        <NumberFlow
                          value={displayValue}
                          format={numberFlowFormat as Parameters<typeof NumberFlow>[0]["format"]}
                          locales="en-GB"
                          className={cn(hasMainDrilldown ? "underline" : "")}
                        />
                      );
                    })()
                  ) : descriptor.valueOption?.format ? (
                    Formatter.getInstance().getFormatter(descriptor.valueOption.format)(data)
                  ) : (
                    data
                  )}
                </div>
              </div>
            )}
          </CardTitle>

          {renderComparison()}
        </CardContent>
        {/* Only render CardFooter if minimap is configured */}
        {!error && shouldShowMinimap() && (
          <CardFooter className="px-0 pb-2">
            {/* Show skeleton for minimap while main skeleton is showing */}
            {shouldShowSkeleton ? (
              <div className="w-full mt-2">
                <Skeleton className="h-[50px] w-full" />
              </div>
            ) : (
              <StatMinimap
                id={"stat"}
                data={minimapData}
                isLoading={isLoadingMinimap}
                option={descriptor.minimapOption!}
                onBrushChange={hasMinimapDrilldown ? handleMinimapDrilldown : undefined}
              />
            )}
          </CardFooter>
        )}
      </DashboardPanelLayout>
    );
  }
);

DashboardPanelStat.displayName = "DashboardPanelStat";

export default DashboardPanelStat;

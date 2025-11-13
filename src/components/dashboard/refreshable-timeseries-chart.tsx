"use client";

import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import * as echarts from "echarts";
import { ChevronRight, EllipsisVertical, Minus } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Formatter, type FormatName } from "../../lib/formatter";
import FloatingProgressBar from "../floating-progress-bar";
import { useTheme } from "../theme-provider";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Skeleton } from "../ui/skeleton";
import { Dialog } from "../use-dialog";
import { isTimestampColumn as isTimestampColumnUtil, transformRowsToChartData } from "./chart-data-utils";
import type {
  ChartDescriptor,
  FieldOption,
  SQLQuery,
  StatDescriptor,
  TableDescriptor,
  TimeseriesDescriptor,
  TransposeTableDescriptor,
} from "./chart-utils";
import type { RefreshableComponent, RefreshParameter } from "./refreshable-component";
import RefreshableStatComponent from "./refreshable-stat-chart";
import RefreshableTableComponent from "./refreshable-table-component";
import RefreshableTransposedTableComponent from "./refreshable-transposed-table-component";
import { replaceTimeSpanParams } from "./sql-time-utils";
import type { TimeSpan } from "./timespan-selector";
import { useRefreshable } from "./use-refreshable";

// Wrapper component that uses imperative refresh instead of remounting
// This prevents the drilldown component from losing its state when the time span changes
const DrilldownChartRendererWithRefresh: React.FC<{
  descriptor: ChartDescriptor;
  selectedTimeSpan?: TimeSpan;
  searchParams?: URLSearchParams;
}> = ({ descriptor, selectedTimeSpan, searchParams }) => {
  const componentRef = useRef<RefreshableComponent | null>(null);
  const prevTimeSpanRef = useRef<TimeSpan | undefined>(selectedTimeSpan);

  // Callback ref to capture the component instance
  const setComponentRef = useCallback((instance: RefreshableComponent | null) => {
    componentRef.current = instance;
  }, []);

  // Call refresh imperatively when selectedTimeSpan changes
  useEffect(() => {
    if (componentRef.current && selectedTimeSpan) {
      // On initial mount or when time span changes, refresh imperatively
      if (
        !prevTimeSpanRef.current ||
        prevTimeSpanRef.current.startISO8601 !== selectedTimeSpan.startISO8601 ||
        prevTimeSpanRef.current.endISO8601 !== selectedTimeSpan.endISO8601
      ) {
        // Time span changed (or initial mount), refresh imperatively
        componentRef.current.refresh({ selectedTimeSpan });
      }
    }
    prevTimeSpanRef.current = selectedTimeSpan;
  }, [selectedTimeSpan]);

  // Don't render anything if no time span is selected
  if (!selectedTimeSpan) {
    return null;
  }

  // Render with stable key (not including timeSpan) and ref
  if (descriptor.type === "stat") {
    return (
      <RefreshableStatComponent
        ref={setComponentRef}
        descriptor={descriptor as StatDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        searchParams={searchParams}
      />
    );
  } else if (descriptor.type === "line" || descriptor.type === "bar" || descriptor.type === "area") {
    return (
      <RefreshableTimeseriesChart
        ref={setComponentRef}
        descriptor={descriptor as TimeseriesDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        searchParams={searchParams}
      />
    );
  } else if (descriptor.type === "table") {
    return (
      <RefreshableTableComponent
        ref={setComponentRef}
        descriptor={descriptor as TableDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        searchParams={searchParams}
        className="rounded-none"
      />
    );
  } else if (descriptor.type === "transpose-table") {
    return (
      <RefreshableTransposedTableComponent
        ref={setComponentRef}
        descriptor={descriptor as TransposeTableDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        searchParams={searchParams}
        className="rounded-none"
      />
    );
  }
  return null;
};

interface RefreshableTimeseriesChartProps {
  // The timeseries descriptor configuration
  descriptor: TimeseriesDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;
  inputFilter?: string;

  // Used for generating links
  searchParams?: URLSearchParams;

  // Initial loading state (useful for drilldown dialogs)
  initialLoading?: boolean;
}

const RefreshableTimeseriesChart = forwardRef<RefreshableComponent, RefreshableTimeseriesChartProps>(
  function RefreshableTimeseriesChart(props, ref) {
    const { descriptor, selectedTimeSpan: propSelectedTimeSpan, inputFilter: propInputFilter } = props;
    const { selectedConnection } = useConnection();
    const { theme } = useTheme();

    // Debug logging
    useEffect(() => {
      console.log(`[RefreshableTimeseriesChart] Component mounted with descriptor:`, {
        id: descriptor.id,
        type: descriptor.type,
        titleOption: descriptor.titleOption,
        hasTitle: !!descriptor.titleOption?.title,
        title: descriptor.titleOption?.title,
        query: descriptor.query?.sql?.substring(0, 100),
      });
    }, [descriptor]);

    // State
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
    const [meta, setMeta] = useState<Array<{ name: string; type?: string }>>([]);
    const [isLoading, setIsLoading] = useState(props.initialLoading ?? false);
    const [error, setError] = useState("");
    const [selectedTimeRange, setSelectedTimeRange] = useState<TimeSpan | null>(null);

    // Track dark mode state
    const [isDark, setIsDark] = useState(() => {
      if (typeof window !== "undefined") {
        return window.document.documentElement.classList.contains("dark");
      }
      return false;
    });

    // Watch for theme changes
    useEffect(() => {
      const checkTheme = () => {
        if (typeof window !== "undefined") {
          const root = window.document.documentElement;
          setIsDark(root.classList.contains("dark"));
        }
      };

      // Initial check
      checkTheme();

      // Watch for theme changes via DOM class changes
      const observer = new MutationObserver(checkTheme);
      if (typeof window !== "undefined") {
        observer.observe(window.document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }

      // Also update when theme context changes
      if (theme === "dark") {
        setIsDark(true);
      } else if (theme === "light") {
        setIsDark(false);
      } else if (theme === "system") {
        // For system theme, check the actual rendered theme
        if (typeof window !== "undefined") {
          const root = window.document.documentElement;
          setIsDark(root.classList.contains("dark"));
        }
      }

      return () => observer.disconnect();
    }, [theme]);

    // Refs
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartInstanceRef = useRef<echarts.ECharts | null>(null);
    const apiCancellerRef = useRef<ApiCanceller | null>(null);
    const timestampsRef = useRef<number[]>([]);

    // Check if drilldown is available (defined early for use in chart update)
    const hasDrilldown = useCallback((): boolean => {
      return descriptor.drilldown !== undefined && Object.keys(descriptor.drilldown).length > 0;
    }, [descriptor.drilldown]);

    // Infer format from metric name
    const inferFormatFromMetricName = useCallback((metricName: string): FormatName => {
      const lowerName = metricName.toLowerCase();

      // Check for bytes first
      if (lowerName.includes("bytes")) {
        return "binary_size";
      }

      // Parse division operations to detect unit conversions
      // Example: divide(avg(ProfileEvent_OSCPUVirtualTimeMicroseconds), 1000000)
      const divideMatch = lowerName.match(/divide\s*\([^,]+,\s*(\d+)\)/);
      if (divideMatch) {
        const divisor = parseInt(divideMatch[1], 10);

        // Extract the inner expression (everything before the comma in divide)
        // Handle nested parentheses by finding the matching comma
        const divideStart = lowerName.indexOf("divide(");
        if (divideStart !== -1) {
          let parenCount = 0;
          let commaPos = -1;
          for (let i = divideStart + 7; i < lowerName.length; i++) {
            if (lowerName[i] === "(") parenCount++;
            else if (lowerName[i] === ")") {
              if (parenCount === 0) break;
              parenCount--;
            } else if (lowerName[i] === "," && parenCount === 0) {
              commaPos = i;
              break;
            }
          }

          if (commaPos !== -1) {
            const innerExpression = lowerName.substring(divideStart + 7, commaPos);

            // Determine original unit from inner expression
            let originalUnit: "nanosecond" | "microsecond" | "millisecond" | null = null;
            if (innerExpression.includes("nanoseconds")) {
              originalUnit = "nanosecond";
            } else if (innerExpression.includes("microseconds")) {
              originalUnit = "microsecond";
            } else if (innerExpression.includes("milliseconds")) {
              originalUnit = "millisecond";
            }

            // If we found an original unit, calculate the resulting unit
            if (originalUnit) {
              // Calculate conversion factors (units per second)
              const conversionFactors: Record<string, number> = {
                nanosecond: 1e9, // nanoseconds per second
                microsecond: 1e6, // microseconds per second
                millisecond: 1e3, // milliseconds per second
              };

              const originalFactor = conversionFactors[originalUnit];
              const resultFactor = originalFactor / divisor;

              // Determine resulting format based on the result factor
              // resultFactor represents the number of original units per second after division
              if (resultFactor >= 1e9) {
                // Still in nanoseconds range (e.g., divide by 1)
                return "nanosecond";
              } else if (resultFactor >= 1e6) {
                // In microseconds range (e.g., divide nanoseconds by 1000)
                return "microsecond";
              } else if (resultFactor >= 1e3) {
                // In milliseconds range (e.g., divide microseconds by 1000)
                return "millisecond";
              } else if (resultFactor >= 1) {
                // In seconds range (e.g., divide microseconds by 1e6, or milliseconds by 1e3)
                // Use millisecond format which displays "s" for values >= 1000ms
                return "millisecond";
              }
            }
          }
        }
      }

      // Fallback to simple keyword matching if no division detected
      if (lowerName.includes("microseconds")) {
        return "microsecond";
      } else if (lowerName.includes("milliseconds")) {
        return "millisecond";
      } else if (lowerName.includes("nanoseconds")) {
        return "nanosecond";
      }

      return "short_number";
    }, []);

    // Update chart when data changes
    useEffect(() => {
      if (!chartInstanceRef.current) {
        return;
      }

      if (!data || data.length === 0) {
        // Show empty state
        chartInstanceRef.current.setOption({
          title: {
            show: true,
            text: "No data",
            left: "center",
            top: "center",
          },
          backgroundColor: "transparent",
        });
        return;
      }

      try {
        // Find timestamp column (prefer meta-defined names like 't' over the derived 'timestamp')
        const firstRow = data[0];

        const metaNames = meta.map((m) => m.name);
        const pickTimestampFromMeta = () => {
          // common timestamp names first
          if (metaNames.includes("t")) return "t";
          const metaTime = metaNames.find((n) => {
            const lower = n.toLowerCase();
            return lower.includes("time") || lower.includes("date");
          });
          if (metaTime) return metaTime;
          // Fallback to derived 'timestamp' in transformed rows
          if (Object.prototype.hasOwnProperty.call(firstRow, "timestamp")) return "timestamp";
          return "t";
        };
        const timestampKey = pickTimestampFromMeta();

        // Identify columns: timestamp, labels (group by columns), and metrics
        const allColumns = meta.length > 0 ? meta.map((m) => m.name) : Object.keys(firstRow);

        // Helper checks - more precise timestamp detection
        const isTimeColumn = (name: string) => {
          // Exact match with timestamp key
          if (name === timestampKey || name.toLowerCase() === timestampKey.toLowerCase()) {
            return true;
          }
          
          const metaType = meta.find((m) => m.name === name)?.type;
          return isTimestampColumnUtil(name, metaType);
        };
        const isNumericType = (type?: string) => {
          if (!type) return false;
          // ClickHouse numeric types
          return /(u?int|float|double|decimal)/i.test(type) && !/date|datetime/i.test(type);
        };
        const sampleIsNumeric = (col: string) => {
          // check a few rows for numeric value
          for (let i = 0; i < Math.min(5, data.length); i++) {
            const v = (data[i] as Record<string, unknown>)[col];
            if (v === null || v === undefined) continue;
            if (typeof v === "number") return true;
            if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return true;
            return false;
          }
          return false;
        };

        // Classify non-time columns: numeric -> metric, otherwise label
        const candidateCols = allColumns.filter((c) => !isTimeColumn(c));
        const metricColumns: string[] = [];
        const labelColumns: string[] = [];
        candidateCols.forEach((col) => {
          const metaType = meta.find((m) => m.name === col)?.type;
          if (isNumericType(metaType) || sampleIsNumeric(col)) {
            metricColumns.push(col);
          } else {
            labelColumns.push(col);
          }
        });

        // Get unique timestamps and sort them
        // Convert all timestamps to milliseconds for consistent comparison
        const timestamps = Array.from(
          new Set(
            data.map((row) => {
              const ts = row[timestampKey] as number;
              return typeof ts === "number" && ts > 1e10 ? ts : ts * 1000;
            })
          )
        ).sort((a, b) => a - b);

        // Store timestamps in ref for brush event handler
        timestampsRef.current = timestamps;

        // Build x-axis data
        const xAxisData: string[] = timestamps.map((ts) => {
          const date = new Date(ts);
          return DateTimeExtension.formatDateTime(date, "HH:mm:ss") || "";
        });

        // Create a map: timestamp (ms) -> data point for quick lookup
        const timestampMap = new Map<number, Record<string, unknown>>();
        data.forEach((row) => {
          const ts = row[timestampKey] as number;
          const timestamp = typeof ts === "number" && ts > 1e10 ? ts : ts * 1000;
          timestampMap.set(timestamp, row);
        });

        // Build series data - group by labels if present
        const series: echarts.SeriesOption[] = [];
        const FormatterInstance = Formatter.getInstance();

        if (labelColumns.length > 0) {
          // Group data by label combinations for each metric
          metricColumns.forEach((metricCol) => {
            const labelGroups = new Map<string, Array<{ timestamp: number; value: number }>>();

            data.forEach((row) => {
              const ts = row[timestampKey] as number;
              const timestamp = typeof ts === "number" && ts > 1e10 ? ts : ts * 1000;
              const value = row[metricCol];

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

              // Build label key from all label columns, explicitly excluding timestamp
              // Filter out timestamp values if they somehow got included
              const labelKeyParts = labelColumns
                .filter(
                  (labelCol) => labelCol !== timestampKey && labelCol.toLowerCase() !== timestampKey.toLowerCase()
                )
                .map((labelCol) => {
                  const value = row[labelCol];
                  // Skip if value looks like a timestamp (large number)
                  if (typeof value === "number" && value > 1e10) {
                    return null;
                  }
                  // Convert to string, treating empty string as 'empty-hostname' for hostname-like columns
                  const strValue = String(value || "");
                  // If it's empty and the column name suggests it's a hostname identifier, use 'empty-hostname'
                  if (
                    strValue === "" &&
                    (labelCol.toLowerCase().includes("host") || labelCol.toLowerCase().includes("hostname"))
                  ) {
                    return "empty-hostname";
                  }
                  return strValue;
                })
                .filter((part) => part !== null);

              const labelKey = labelKeyParts.length > 0 ? labelKeyParts.join(" - ") : metricCol; // Fallback to metric name if no valid labels

              if (!labelGroups.has(labelKey)) {
                labelGroups.set(labelKey, []);
              }

              labelGroups.get(labelKey)!.push({ timestamp, value: numValue });
            });

            // Create series for each label group
            labelGroups.forEach((points, labelKey) => {
              // Sort points by timestamp
              points.sort((a, b) => a.timestamp - b.timestamp);

              // Create data array aligned with xAxisData
              const seriesData: (number | null)[] = timestamps.map((tsMs) => {
                const point = points.find((p) => {
                  return Math.abs(p.timestamp - tsMs) < 1000; // Within 1 second tolerance
                });
                return point ? point.value : null;
              });

              // Use label as series name (if multiple metrics, append metric name)
              const seriesName = metricColumns.length > 1 ? `${labelKey} (${metricCol})` : labelKey;
              series.push({
                name: seriesName,
                type: descriptor.type === "bar" ? "bar" : "line",
                data: seriesData,
                yAxisIndex: 0,
                smooth: true,
                showSymbol: false, // Hide dots, show only smooth lines
                areaStyle: descriptor.type === "area" ? { opacity: 0.3 } : undefined,
              });
            });
          });
        } else {
          // No labels - create one series per metric
          metricColumns.forEach((metricCol) => {
            // Create data array aligned with xAxisData
            const seriesData: (number | null)[] = timestamps.map((tsMs) => {
              const row = timestampMap.get(tsMs);
              if (!row) return null;

              const value = row[metricCol];
              if (typeof value === "number") {
                return value;
              } else if (typeof value === "string") {
                const num = parseFloat(value);
                return isNaN(num) ? null : num;
              }
              return null;
            });

            // Use metric name as series name
            series.push({
              name: metricCol,
              type: descriptor.type === "bar" ? "bar" : "line",
              data: seriesData,
              yAxisIndex: 0,
              smooth: true,
              showSymbol: false, // Hide dots, show only smooth lines
              areaStyle: descriptor.type === "area" ? { opacity: 0.3 } : undefined,
            });
          });
        }

        // Build y-axis configuration - don't use label names
        const yAxisOption = descriptor.yAxis?.[0] || {};
        const yAxis: echarts.EChartsOption["yAxis"] = [
          {
            type: "value",
            name: "", // Don't show label names
            min: yAxisOption.min,
            minInterval: yAxisOption.minInterval,
            interval: yAxisOption.interval,
            inverse: yAxisOption.inverse,
            splitLine: { show: true },
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              formatter: (value: number) => {
                // Use first metric's format for y-axis labels
                if (metricColumns.length > 0) {
                  const format = inferFormatFromMetricName(metricColumns[0]);
                  const formatter = FormatterInstance.getFormatter(format);
                  const formatted = formatter(value);
                  // Ensure we return a string
                  return typeof formatted === "string" ? formatted : String(formatted);
                }
                return String(value);
              },
            },
          },
        ];

        // Build final echarts option
        const option: echarts.EChartsOption = {
          backgroundColor: "transparent",
          title: {
            show: false,
          },
          toolbox: {
            show: false,
          },
          brush: hasDrilldown()
            ? {
                xAxisIndex: "all",
                brushLink: "all",
                outOfBrush: {
                  colorAlpha: 0.1,
                },
              }
            : undefined,
          tooltip: {
            trigger: "axis",
            axisPointer: {
              type: "line",
            },
            appendToBody: true,
            formatter: (params: unknown) => {
              if (!Array.isArray(params)) {
                return "";
              }
              const firstParam = params[0] as { axisValue: string };
              const timestamp = firstParam.axisValue;
              let result = `<div style="margin-bottom: 4px;">${timestamp}</div>`;

              // Get tooltip sort option, default to 'none'
              const sortValue = descriptor.tooltipOption?.sortValue || "none";

              // Create a copy of params array for sorting
              const sortedParams = [...params] as Array<{ value: number | null; seriesName: string; color: string }>;

              // Sort params based on tooltipOption.sortValue
              if (sortValue !== "none") {
                sortedParams.sort((a, b) => {
                  const valueA = a.value ?? -Infinity;
                  const valueB = b.value ?? -Infinity;
                  if (sortValue === "asc") {
                    return valueA - valueB;
                  } else {
                    // sortValue === "desc"
                    return valueB - valueA;
                  }
                });
              }

              sortedParams.forEach((param: { value: number | null; seriesName: string; color: string }) => {
                const value = param.value;
                if (value !== null && value !== undefined) {
                  // Find the metric column for this series
                  // If labels exist, series name is the label value; otherwise it's the metric name
                  let metricCol: string;
                  if (labelColumns.length > 0) {
                    // Series name is a label value, find the metric column
                    metricCol = metricColumns[0] || "";
                  } else {
                    // Series name is the metric column name
                    metricCol = param.seriesName;
                  }

                  const format = metricCol ? inferFormatFromMetricName(metricCol) : "short_number";
                  const formatter = FormatterInstance.getFormatter(format);
                  const formattedValue = formatter(value);

                  result += `<div style="margin-top: 2px; white-space: nowrap;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${param.color};margin-right:5px;"></span>
                    ${param.seriesName}: <strong>${formattedValue}</strong>
                  </div>`;
                }
              });
              return result;
            },
          },
          legend: {
            data: series.map((s) => s.name as string),
            show: series.length > 0,
            top: 0,
            type: "scroll",
            icon: "circle",
          },
          grid: {
            left: "3%",
            right: "4%",
            bottom: "10%",
            top: series.length > 0 ? "15%" : "5%",
            containLabel: true,
          },
          xAxis: {
            type: "category",
            data: xAxisData,
            boundaryGap: descriptor.type === "bar",
          },
          yAxis: yAxis,
          series: series,
        };

        chartInstanceRef.current.setOption(option, true);

        // Add brush event handler if drilldown is enabled
        if (hasDrilldown() && chartInstanceRef.current) {
          // Enable brush selection using dispatchAction
          chartInstanceRef.current.dispatchAction({
            type: "takeGlobalCursor",
            key: "brush",
            brushOption: {
              brushType: "lineX",
              brushMode: "single",
            },
          });

          chartInstanceRef.current.off("brushEnd");
          chartInstanceRef.current.off("brushSelected");
          chartInstanceRef.current.off("brush");
          const handleBrush = (...args: unknown[]) => {
            const params = args[0] as {
              batch?: Array<{
                areas?: Array<{ coordRange?: [number, number] | number[] }>;
              }>;
              brushComponents?: Array<{ coordRange?: [number, number] | number[] }>;
              areas?: Array<{ coordRange?: [number, number] | number[] }>;
            };
            const timestamps = timestampsRef.current;
            if (!timestamps || timestamps.length === 0) return;

            // ECharts brush event structure: try batch.areas first (brushSelected event), then brushComponents/areas
            let brushAreas: Array<{ coordRange?: [number, number] | number[] }> = [];
            if (params.batch && params.batch.length > 0 && params.batch[0].areas) {
              brushAreas = params.batch[0].areas;
            } else if (params.brushComponents) {
              brushAreas = params.brushComponents;
            } else if (params.areas) {
              brushAreas = params.areas;
            }

            if (brushAreas.length > 0) {
              const brushArea = brushAreas[0];
              // For category axis, coordRange is [startIndex, endIndex]
              if (brushArea.coordRange && Array.isArray(brushArea.coordRange) && brushArea.coordRange.length === 2) {
                const [startIndex, endIndex] = brushArea.coordRange;

                // Get the actual timestamps from the stored array
                if (startIndex >= 0 && endIndex < timestamps.length && startIndex <= endIndex) {
                  const startTimestamp = timestamps[Math.floor(startIndex)];
                  const endTimestamp = timestamps[Math.ceil(endIndex)];

                  const selectedTimeSpan: TimeSpan = {
                    startISO8601: DateTimeExtension.formatISO8601(new Date(startTimestamp)) || "",
                    endISO8601: DateTimeExtension.formatISO8601(new Date(endTimestamp)) || "",
                  };

                  setSelectedTimeRange(selectedTimeSpan);
                  return;
                }
              }
            }
            // Brush cleared or invalid selection
            setSelectedTimeRange(null);
          };

          chartInstanceRef.current.on("brushEnd", handleBrush);
        }

        // Resize after setting option to ensure proper rendering
        // Use multiple resize calls to handle cases where container size changes
        requestAnimationFrame(() => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.resize();
            // Second resize after a short delay to catch any layout changes
            setTimeout(() => {
              if (chartInstanceRef.current) {
                chartInstanceRef.current.resize();
              }
            }, 100);
          }
        });
      } catch (err) {
        console.error("Error updating chart:", err);
        setError(err instanceof Error ? err.message : "Error updating chart");
      }
    }, [data, descriptor, detectedColumns, meta, inferFormatFromMetricName, hasDrilldown]);

    // Track last successfully loaded parameters to avoid duplicate API calls
    const lastLoadedParamsRef = useRef<RefreshParameter | null>(null);

    // Load data from API
    const loadData = useCallback(
      async (param: RefreshParameter) => {
        if (!selectedConnection) {
          setError("No connection selected");
          return;
        }

        if (!descriptor.query) {
          setError("No query defined for this chart component.");
          return;
        }

        if (!param.selectedTimeSpan) {
          setError("Please choose time span.");
          return;
        }

        // Check if we're loading with the same parameters (avoid duplicate API calls)
        if (lastLoadedParamsRef.current && JSON.stringify(lastLoadedParamsRef.current) === JSON.stringify(param)) {
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

          // Replace time span template parameters in SQL
          let finalSql = replaceTimeSpanParams(query.sql, param.selectedTimeSpan);
          if (selectedConnection!.cluster.length > 0) {
            finalSql = finalSql.replace("{cluster}", selectedConnection!.cluster);
          }

          // Check if there are any remaining old-style placeholders (for backward compatibility)
          if (finalSql.includes("{rounding}") || finalSql.includes("{seconds}")) {
            console.warn(
              `[TimeseriesChart ${descriptor.id}] Warning: Old-style placeholders found in SQL (use {param_rounding:UInt32} and {param_seconds:UInt32})`
            );
          }

          // Store finalSql in a variable accessible to error handler
          const executedSql = finalSql;

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
                const meta = responseData.meta || [];

                // Check if rows are arrays or objects
                const firstRow = rows[0];
                const isArrayFormat = Array.isArray(firstRow);

                const transformedData = transformRowsToChartData(rows, meta);

                // Store meta for later use in chart rendering
                setMeta(meta);

                // Auto-detect columns if not specified in descriptor
                // Convert fieldOptions to array format for backward compatibility
                let columns: (string | FieldOption)[] = [];
                if (descriptor.type === "line" || descriptor.type === "bar" || descriptor.type === "area") {
                  const timeseriesDescriptor = descriptor as TimeseriesDescriptor;
                  if (timeseriesDescriptor.fieldOptions) {
                    // Convert Map/Record to array, sorted by position if available
                    const fieldOptionsArray = timeseriesDescriptor.fieldOptions instanceof Map
                      ? Array.from(timeseriesDescriptor.fieldOptions.entries())
                      : Object.entries(timeseriesDescriptor.fieldOptions);
                    
                    // Sort by position if available
                    fieldOptionsArray.sort((a, b) => {
                      const posA = a[1].position ?? Number.MAX_SAFE_INTEGER;
                      const posB = b[1].position ?? Number.MAX_SAFE_INTEGER;
                      return posA - posB;
                    });
                    
                    columns = fieldOptionsArray.map(([key, value]) => ({ ...value, name: key }));
                  }
                }
                if (
                  columns.length === 0 ||
                  (columns.length === 1 && typeof columns[0] === "string" && columns[0] === "value")
                ) {
                  // Find metric columns (exclude timestamp and label columns)
                  let metricColumns: string[];

                  if (isArrayFormat && meta.length > 0) {
                    // Use meta for array format - we have type information
                    const allColumns = meta.map((colMeta: { name: string; type?: string }) => colMeta.name);
                    // Identify timestamp column using both name and type
                    const timestampCol = meta.find((colMeta: { name: string; type?: string }) =>
                      isTimestampColumnUtil(colMeta.name, colMeta.type)
                    )?.name;
                    metricColumns = allColumns.filter((name: string) => name !== timestampCol);
                  } else if (rows.length > 0) {
                    // Use object keys for object format - no type info, rely on naming
                    const firstRowObj = rows[0] as Record<string, unknown>;
                    const allColumns = Object.keys(firstRowObj);
                    // Identify timestamp column by name only
                    const timestampCol = allColumns.find((name: string) => isTimestampColumnUtil(name));
                    metricColumns = allColumns.filter((name: string) => name !== timestampCol);
                  } else {
                    // No rows available, set empty array
                    metricColumns = [];
                  }

                  if (metricColumns.length > 0) {
                    setDetectedColumns(metricColumns);
                  }
                } else {
                  setDetectedColumns([]);
                }

                setData(transformedData);
                setError("");
                // Mark that we successfully loaded with these parameters
                lastLoadedParamsRef.current = param;
              } catch (err) {
                console.error("Error processing chart response:", err);
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

              console.error(`[TimeseriesChart ${descriptor.id}] API Error:`, error);
              console.error(`[TimeseriesChart ${descriptor.id}] SQL that failed:`, executedSql);
              console.error(`[TimeseriesChart ${descriptor.id}] Error details:`, {
                httpStatus: error.httpStatus,
                errorMessage: error.errorMessage,
                data: error.data,
              });
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
        }
      },
      [descriptor, selectedConnection]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshParameter) => {

        if (!descriptor.query) {
          console.error(`No query defined for chart [${descriptor.id}]`);
          setError("No query defined for this chart component.");
          return;
        }

        // loadData already has duplicate check - it will skip if parameters haven't changed
        loadData(param);
      },
      [descriptor, loadData]
    );

    // Use shared refreshable hook
    const getInitialParams = useCallback(() => {
      return propSelectedTimeSpan
        ? ({ inputFilter: propInputFilter, selectedTimeSpan: propSelectedTimeSpan } as RefreshParameter)
        : undefined;
    }, [propSelectedTimeSpan, propInputFilter]);

    const { componentRef, isCollapsed, setIsCollapsed, refresh, getLastRefreshParameter } = useRefreshable({
      componentId: descriptor.id,
      initialCollapsed: descriptor.collapsed ?? false,
      refreshInternal,
      getInitialParams,
    });

    // Initial load when component mounts or when props change
    // No manual initial refresh here; useRefreshable handles it via getInitialParams

    // Initialize echarts instance with theme support
    useEffect(() => {
      if (!chartContainerRef.current) {
        return;
      }

      // Dispose existing instance if theme changed
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }

      // Initialize with dark theme if in dark mode
      const chartTheme = isDark ? "dark" : undefined;
      const chartInstance = echarts.init(chartContainerRef.current, chartTheme);
      chartInstanceRef.current = chartInstance;

      // Handle window resize
      const handleResize = () => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.resize();
        }
      };
      window.addEventListener("resize", handleResize);

      // Use ResizeObserver to watch for container size changes
      const resizeObserver = new ResizeObserver(() => {
        if (chartInstanceRef.current) {
          // Use requestAnimationFrame to ensure DOM has updated
          requestAnimationFrame(() => {
            if (chartInstanceRef.current) {
              chartInstanceRef.current.resize();
            }
          });
        }
      });

      if (chartContainerRef.current) {
        resizeObserver.observe(chartContainerRef.current);
      }

      // Initial resize after a short delay to ensure container has final dimensions
      const initialResizeTimeout = setTimeout(() => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.resize();
        }
      }, 100);

      return () => {
        clearTimeout(initialResizeTimeout);
        resizeObserver.disconnect();
        window.removeEventListener("resize", handleResize);
        if (chartInstanceRef.current) {
          chartInstanceRef.current.dispose();
          chartInstanceRef.current = null;
        }
      };
    }, [isDark]);

    // Resize chart when expanded/collapsed state changes (since content is now hidden, not unmounted)
    useEffect(() => {
      if (!chartInstanceRef.current) {
        return;
      }

      // Use multiple animation frames and a timeout to ensure proper resize
      // This handles cases where the container becomes visible after being hidden
      let frameId2: number | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const frameId1 = requestAnimationFrame(() => {
        frameId2 = requestAnimationFrame(() => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.resize();
            // Additional resize after a delay to catch any delayed layout changes
            timeoutId = setTimeout(() => {
              if (chartInstanceRef.current) {
                chartInstanceRef.current.resize();
              }
            }, 150);
          }
        });
      });

      return () => {
        cancelAnimationFrame(frameId1);
        if (frameId2 !== null) {
          cancelAnimationFrame(frameId2);
        }
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      };
    }, [isCollapsed]);

    // Expose methods via ref (including getEChartInstance for echarts connection)
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
      getEChartInstance: () => chartInstanceRef.current || undefined,
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
    // Use stable key and imperative refresh to prevent remounting
    const renderDrilldownComponent = useCallback(
      (drilldownDescriptor: ChartDescriptor, timeSpan: TimeSpan) => {
        // Create a modified copy of the descriptor for drilldown
        // Always hide title in drilldown by explicitly setting showTitle to false
        const modifiedDescriptor: ChartDescriptor = {
          ...drilldownDescriptor,
          titleOption: drilldownDescriptor.titleOption
            ? {
                ...drilldownDescriptor.titleOption,
                showTitle: false, // Explicitly set to false to hide title
                // Keep title and description for potential future use, but hide it
              }
            : undefined, // If no titleOption, keep it undefined
        };

        // Use stable key (not including timeSpan) and wrapper that calls refresh imperatively
        return (
          <DrilldownChartRendererWithRefresh
            key={`drilldown-${modifiedDescriptor.id || "default"}`}
            descriptor={modifiedDescriptor}
            selectedTimeSpan={timeSpan}
            searchParams={props.searchParams}
          />
        );
      },
      [props.searchParams]
    );

    // Show raw data dialog
    const showRawDataDialog = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.length === 0) {
          Dialog.alert({
            title: "No Data",
            description: "There is no data to display.",
          });
          return;
        }

        // Get all unique column names from the data
        const allColumns = new Set<string>();
        data.forEach((row) => {
          Object.keys(row).forEach((key) => allColumns.add(key));
        });
        const rawColumns = Array.from(allColumns);

        Dialog.showDialog({
          title: "Query Result - " + descriptor.titleOption?.title,
          description: `Showing ${data.length} row(s) of raw query result data`,
          className: "max-w-[50vw] h-[70vh]",
          disableContentScroll: true,
          mainContent: (
            <div className="flex-1 min-h-0 overflow-auto bg-background">
              <table className="w-full caption-bottom text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-background [&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    {rawColumns.map((colName) => (
                      <th
                        key={colName}
                        className="px-4 py-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap bg-background"
                      >
                        {colName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {data.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                    >
                      {rawColumns.map((colName) => {
                        const value = row[colName];
                        // Format the value for display
                        let displayValue: React.ReactNode;
                        if (value === null || value === undefined) {
                          displayValue = <span className="text-muted-foreground">-</span>;
                        } else if (colName === "timestamp" && typeof value === "number") {
                          // Only format the 'timestamp' column (added by the component) as date/time
                          // Convert to milliseconds if it's in seconds (timestamp < 1e10)
                          const timestampMs = value > 1e10 ? value : value * 1000;
                          const date = new Date(timestampMs);
                          const formatted = DateTimeExtension.formatDateTime(date, "yyyy-MM-dd HH:mm:ss");
                          displayValue = <span>{formatted || date.toISOString()}</span>;
                        } else if (typeof value === "object") {
                          displayValue = <span className="font-mono text-xs">{JSON.stringify(value, null, 2)}</span>;
                        } else {
                          displayValue = <span>{String(value)}</span>;
                        }
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
      },
      [data, descriptor.titleOption?.title]
    );

    const hasTitle = !!descriptor.titleOption?.title && descriptor.titleOption?.showTitle !== false;

    // Memoize drilldown component to prevent unnecessary remounts
    // This ensures the table component doesn't lose its state when parent re-renders
    const drilldownComponent = useMemo(() => {
      if (!hasDrilldown() || !selectedTimeRange) {
        return null;
      }
      const drilldownDescriptor = getFirstDrilldownDescriptor();
      if (!drilldownDescriptor) {
        return null;
      }
      return renderDrilldownComponent(drilldownDescriptor, selectedTimeRange);
    }, [hasDrilldown, selectedTimeRange, getFirstDrilldownDescriptor, renderDrilldownComponent]);

    return (
      <Card ref={componentRef} className="@container/card relative overflow-hidden">
        <FloatingProgressBar show={isLoading} />
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
          {hasTitle && descriptor.titleOption && (
            <CardHeader className="p-0">
              <div className="flex items-center">
                <CollapsibleTrigger className="flex-1">
                  <div className={cn("flex items-center p-2 bg-muted/50 transition-colors gap-2 hover:bg-muted")}>
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
                    <div className="pr-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0 flex items-center justify-center bg-transparent hover:bg-muted hover:ring-2 hover:ring-foreground/20"
                            title="More options"
                            aria-label="More options"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={0}>
                          <DropdownMenuItem onClick={showRawDataDialog}>Show query result</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
          )}
          {!hasTitle && descriptor.titleOption && (
            <CardHeader className="pt-5 pb-3">
              <div className="flex items-center justify-between">
                {descriptor.titleOption.description && (
                  <CardDescription className="text-xs">{descriptor.titleOption.description}</CardDescription>
                )}
                <div className="ml-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Minus className="h-4 w-4" />
                        <span className="sr-only">More options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={showRawDataDialog}>Show query result</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
          )}
          {!descriptor.titleOption && (
            <CardHeader className="p-0">
              <div className="flex items-center justify-end pr-2 pt-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Minus className="h-4 w-4" />
                      <span className="sr-only">More options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={showRawDataDialog}>Show query result</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
          )}
          <CollapsibleContent>
            <CardContent className="px-0 p-0">
              {error ? (
                <div className="flex flex-col items-center justify-center h-[300px] gap-2 text-destructive p-8">
                  <p className="font-semibold">Error loading chart data:</p>
                  <p className="text-sm">{error}</p>
                </div>
              ) : isLoading && data.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : (
                <>
                  <div
                    ref={chartContainerRef}
                    className="h-[300px] w-full"
                    style={{
                      minHeight: descriptor.height ? `${descriptor.height}px` : undefined,
                      width: "100%",
                      minWidth: 0, // Ensure flex children can shrink
                    }}
                  />
                  {drilldownComponent && <div>{drilldownComponent}</div>}
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  }
);

RefreshableTimeseriesChart.displayName = "RefreshableTimeseriesChart";

export default RefreshableTimeseriesChart;
export type { RefreshableTimeseriesChartProps };

"use client";

import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import * as echarts from "echarts";
import { ChevronRight, EllipsisVertical, Minus } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Formatter, type FormatName } from "../../lib/formatter";
import FloatingProgressBar from "../floating-progress-bar";
import { useTheme } from "../theme-provider";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Skeleton } from "../ui/skeleton";
import { Dialog } from "../use-dialog";
import type { SQLQuery, TimeseriesDescriptor } from "./chart-utils";
import type { RefreshableComponent, RefreshParameter } from "./refreshable-component";
import type { TimeSpan } from "./timespan-selector";
import { useRefreshable } from "./use-refreshable";

// Transform API rows/meta into chart-friendly data points (file-local)
function transformRowsToChartData(
  inputRows: unknown[],
  inputMeta: Array<{ name: string; type?: string }>
): Record<string, unknown>[] {
  const first = inputRows[0];
  const arrayFormat = Array.isArray(first);

  return inputRows.map((row: unknown) => {
    const dataPoint: Record<string, unknown> = {};

    if (arrayFormat) {
      const rowArray = row as unknown[];
      inputMeta.forEach((colMeta: { name: string; type?: string }, index: number) => {
        const value = rowArray[index];
        const colName = colMeta.name;

        if (colName.toLowerCase().includes("time") || colName.toLowerCase().includes("date") || colName === "t") {
          if (typeof value === "string") {
            dataPoint.timestamp = new Date(value).getTime();
          } else if (typeof value === "number") {
            dataPoint.timestamp = value > 1e10 ? value : value * 1000;
          } else {
            dataPoint.timestamp = new Date(String(value)).getTime();
          }
          dataPoint[colName] = dataPoint.timestamp;
        } else {
          dataPoint[colName] = value;
        }
      });
    } else {
      const rowObject = row as Record<string, unknown>;
      Object.keys(rowObject).forEach((colName) => {
        const value = rowObject[colName];
        if (colName.toLowerCase().includes("time") || colName.toLowerCase().includes("date") || colName === "t") {
          if (typeof value === "string") {
            dataPoint.timestamp = new Date(value).getTime();
          } else if (typeof value === "number") {
            dataPoint.timestamp = value > 1e10 ? value : value * 1000;
          } else {
            dataPoint.timestamp = new Date(String(value)).getTime();
          }
          dataPoint[colName] = dataPoint.timestamp;
        } else {
          dataPoint[colName] = value;
        }
      });
    }

    return dataPoint;
  });
}

interface RefreshableTimeseriesChartProps {
  // The timeseries descriptor configuration
  descriptor: TimeseriesDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;
  inputFilter?: string;

  // Used for generating links
  searchParams?: URLSearchParams;
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
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

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

        // Helper checks
        const isTimeColumn = (name: string) => {
          const lower = name.toLowerCase();
          return (
            name === timestampKey ||
            name.toLowerCase() === timestampKey.toLowerCase() ||
            lower.includes("time") ||
            lower.includes("date") ||
            name === "t"
          );
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

        console.log(`[TimeseriesChart ${descriptor.id}] Column classification:`, {
          timestampKey,
          labelColumns,
          metricColumns,
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

            console.log(`[TimeseriesChart ${descriptor.id}] Label groups for metric ${metricCol}:`, {
              labelGroups: Array.from(labelGroups.entries()).map(([key, points]) => ({
                label: key,
                pointCount: points.length,
              })),
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
          tooltip: {
            trigger: "axis",
            axisPointer: {
              type: "line",
            },
            formatter: (params: unknown) => {
              if (!Array.isArray(params)) {
                return "";
              }
              const firstParam = params[0] as { axisValue: string };
              const timestamp = firstParam.axisValue;
              let result = `<div style="margin-bottom: 4px;">${timestamp}</div>`;

              params.forEach((param: { value: number | null; seriesName: string; color: string }) => {
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

                  result += `<div style="margin-top: 2px;">
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

        // Resize after setting option to ensure proper rendering
        setTimeout(() => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.resize();
          }
        }, 50);
      } catch (err) {
        console.error("Error updating chart:", err);
        setError(err instanceof Error ? err.message : "Error updating chart");
      }
    }, [data, descriptor, detectedColumns, meta, inferFormatFromMetricName]);

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
          console.trace(`[TimeseriesChart ${descriptor.id}] Skipping loadData - parameters unchanged`);
          return;
        }

        console.trace(`Loading data for timeseries chart [${descriptor.id}]...`);

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

          // Calculate rounding and seconds from selectedTimeSpan
          const startTime = new Date(param.selectedTimeSpan.startISO8601);
          const endTime = new Date(param.selectedTimeSpan.endISO8601);
          const seconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

          // Calculate rounding based on time span (default to 1/100 of the range, minimum 1 second)
          const rounding = Math.max(1, Math.floor(seconds / 100));

          // Replace template parameters with ClickHouse parameter syntax
          // {rounding} -> {param_rounding:UInt32}
          // {seconds} -> {param_seconds:UInt32}
          let finalSql = query.sql;
          finalSql = finalSql.replace(/{rounding:UInt32}/g, String(rounding));
          finalSql = finalSql.replace(/{seconds:UInt32}/g, String(seconds));

          // Log the SQL for debugging
          console.log(`[TimeseriesChart ${descriptor.id}] Executing SQL:`, finalSql);
          console.log(
            `[TimeseriesChart ${descriptor.id}] Parameters: param_rounding=${rounding}, param_seconds=${seconds}`
          );
          console.log(`[TimeseriesChart ${descriptor.id}] TimeSpan:`, param.selectedTimeSpan);

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
              headers: query.headers,
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

                console.log(`[TimeseriesChart ${descriptor.id}] Data format:`, isArrayFormat ? "array" : "object");
                console.log(`[TimeseriesChart ${descriptor.id}] First row sample:`, firstRow);

                const transformedData = transformRowsToChartData(rows, meta);

                // Store meta for later use in chart rendering
                setMeta(meta);

                // Auto-detect columns if not specified in descriptor
                if (
                  descriptor.columns.length === 0 ||
                  (descriptor.columns.length === 1 &&
                    typeof descriptor.columns[0] === "string" &&
                    descriptor.columns[0] === "value")
                ) {
                  // Find metric columns (exclude timestamp and label columns)
                  let metricColumns: string[];

                  if (isArrayFormat && meta.length > 0) {
                    // Use meta for array format
                    metricColumns = meta
                      .map((colMeta: { name: string; type?: string }) => colMeta.name)
                      .filter((name: string) => {
                        const lower = name.toLowerCase();
                        return (
                          !lower.includes("time") &&
                          !lower.includes("date") &&
                          name !== "t" &&
                          (name.includes("(") ||
                            name.includes("sum(") ||
                            name.includes("count(") ||
                            name.includes("avg(") ||
                            name.includes("min(") ||
                            name.includes("max("))
                        );
                      });
                  } else {
                    // Use object keys for object format
                    const firstRowObj = rows[0] as Record<string, unknown>;
                    metricColumns = Object.keys(firstRowObj).filter((name: string) => {
                      const lower = name.toLowerCase();
                      return (
                        !lower.includes("time") &&
                        !lower.includes("date") &&
                        name !== "t" &&
                        (name.includes("(") ||
                          name.includes("sum(") ||
                          name.includes("count(") ||
                          name.includes("avg(") ||
                          name.includes("min(") ||
                          name.includes("max("))
                      );
                    });
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
          console.error(error);
        }
      },
      [descriptor, selectedConnection]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshParameter) => {
        console.trace(`Refreshing timeseries chart [${descriptor.id}]...`);

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
      initialCollapsed: descriptor.isCollapsed ?? false,
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

      return () => {
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

      // Use requestAnimationFrame to wait for DOM update
      const frameId = requestAnimationFrame(() => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.resize();
        }
      });

      return () => cancelAnimationFrame(frameId);
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

    // Show raw data dialog
    const showRawDataDialog = useCallback(
      (e) => {
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
          className: "max-w-[50vw] max-h-[80vh]",
          disableContentScroll: true,
          mainContent: (
            <div className="overflow-auto max-h-[60vh] bg-background">
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
      [data]
    );

    const hasTitle = !!descriptor.titleOption?.title && descriptor.titleOption?.showTitle !== false;

    return (
      <Card ref={componentRef} className="@container/card relative">
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
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 p-0 flex items-center justify-center hover:ring-2 hover:ring-foreground/20"
                            title="More options"
                            aria-label="More options"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                <div
                  ref={chartContainerRef}
                  className="h-[300px] w-full"
                  style={{ minHeight: descriptor.height ? `${descriptor.height}px` : undefined }}
                />
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

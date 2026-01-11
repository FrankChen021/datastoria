"use client";

import { CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter, type FormatName, type ObjectFormatter } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import * as echarts from "echarts";
import { ChevronDown, ChevronUp } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isTimestampColumn as isTimestampColumnUtil,
  transformRowsToChartData,
} from "./dashboard-data-utils";
import { DashboardDropdownMenuItem } from "./dashboard-dropdown-menu-item";
import {
  applyReducer,
  type PanelDescriptor,
  type Reducer,
  type TimeseriesDescriptor,
} from "./dashboard-model";
import { DashboardPanel } from "./dashboard-panel";
import type { TimeSpan } from "./timespan-selector";
import useIsDarkTheme from "./use-is-dark-theme";

// Chart legend interface
interface Legend {
  color: string;
  series: string;
  valueFormatter: ObjectFormatter;
  dimensionValues: Record<string, string>;
  values: Map<Reducer, number>;
}

interface LegendData {
  dimensionNames: string[];
  legends: Legend[];
}

// Legend table props
interface LegendTableProps {
  chartInstance?: echarts.ECharts;
  legendOption: TimeseriesDescriptor["legendOption"];
  legendData?: LegendData;
}

// Legend table component
const LegendTable: React.FC<LegendTableProps> = ({ chartInstance, legendOption, legendData }) => {
  const [legendToggleState] = useState<Map<string, number>>(new Map());
  const [unselectedSeries, setUnselectedSeries] = useState<Map<string, boolean>>(new Map());
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "ascending" | "descending" | null;
  }>({
    key: "name",
    direction: null,
  });

  // Make sure internal states are cleared after legends to be displayed are changed
  useEffect(() => {
    setUnselectedSeries(new Map());
    legendToggleState.clear();
  }, [legendData, legendToggleState]);

  const onLegendClicked = useCallback(
    (e: React.MouseEvent<HTMLTableRowElement, globalThis.MouseEvent>, series: string) => {
      if (!legendData) return;

      if (e.ctrlKey || e.metaKey) {
        const isSelected = !unselectedSeries.has(series);
        if (isSelected) {
          // Current state is selected, we need to toggle it
          unselectedSeries.set(series, true);
        } else {
          unselectedSeries.delete(series);
        }
        // If Ctrl/Cmd is pressed, toggle the selected state of current row
        chartInstance?.dispatchAction({
          type: "legendToggleSelect",
          name: series,
        });

        setUnselectedSeries(new Map(unselectedSeries));
        return;
      }

      unselectedSeries.clear();

      // Get current selection state for this legend
      let state = legendToggleState.get(series);
      if (state === undefined) {
        state = 0;
      }
      legendToggleState.set(series, state + 1);

      if (state % 2 === 0) {
        // deselect all first
        legendData.legends.forEach((legend) => {
          chartInstance?.dispatchAction({
            type: "legendUnSelect",
            name: legend.series,
          });

          unselectedSeries.set(legend.series, true);
        });

        // select current
        chartInstance?.dispatchAction({
          type: "legendSelect",
          name: series,
        });
        unselectedSeries.delete(series);
      } else {
        unselectedSeries.clear();

        // select others
        chartInstance?.dispatchAction({
          type: "legendAllSelect",
        });
      }

      setUnselectedSeries(new Map(unselectedSeries));
    },
    [chartInstance, legendData, unselectedSeries, legendToggleState]
  );

  // New function to handle header click sorting
  const sort = useCallback((key: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === key) {
        // Change sort direction
        return {
          key,
          direction:
            prevConfig.direction === "ascending"
              ? "descending"
              : prevConfig.direction === "descending"
                ? null
                : "ascending",
        };
      }
      return { key, direction: "ascending" };
    });
  }, []);

  // Sort legends based on sort configuration
  const sortedLegends = useMemo(() => {
    if (!sortConfig.direction || !legendData) {
      return legendData?.legends || [];
    }

    return [...legendData.legends].sort((a, b) => {
      if (
        sortConfig.key === "min" ||
        sortConfig.key === "max" ||
        sortConfig.key === "sum" ||
        sortConfig.key === "avg" ||
        sortConfig.key === "count" ||
        sortConfig.key === "first" ||
        sortConfig.key === "last"
      ) {
        // Sort by value columns
        const aValue = a.values.get(sortConfig.key) ?? 0;
        const bValue = b.values.get(sortConfig.key) ?? 0;

        return sortConfig.direction === "ascending" ? aValue - bValue : bValue - aValue;
      }
      // Sort by legend name
      const lhs = a.dimensionValues[sortConfig.key];
      const rhs = b.dimensionValues[sortConfig.key];
      if (!lhs || !rhs) return 0;
      return sortConfig.direction === "ascending" ? lhs.localeCompare(rhs) : rhs.localeCompare(lhs);
    });
  }, [legendData, sortConfig]);

  // Function to render sort indicator
  const getSortDirectionIcon = useCallback(
    (key: string) => {
      if (sortConfig.key !== key || sortConfig.direction === null) {
        return null;
      }
      return sortConfig.direction === "ascending" ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3" />
      );
    },
    [sortConfig]
  );

  if (!legendData || !legendOption) {
    return null;
  }

  return (
    <div className="h-[25%] min-h-[70px] overflow-auto custom-scrollbar border-t flex-none">
      <Table>
        <TableHeader>
          <TableRow className="cursor-pointer bg-muted">
            {legendData.dimensionNames.map((title, index) => (
              <TableHead
                key={title}
                className={cn(
                  "h-0 p-0 whitespace-nowrap",
                  index === 0 ? "pl-2" : "px-2 text-center"
                )}
                onClick={() => sort(title)}
              >
                <div className={cn("flex items-center", index === 0 ? "" : "justify-center")}>
                  {/* Reserve space for the color bar in the first column, without affecting title↔icon spacing */}
                  {index === 0 && <div className="w-4 mr-2" />}
                  <div className="flex items-center">
                    <span>{title}</span>
                    <span className="w-4 h-4 flex items-center justify-center">
                      {getSortDirectionIcon(title)}
                    </span>
                  </div>
                </div>
              </TableHead>
            ))}

            {/* Show Aggregated Columns for each legend */}
            {legendOption.values?.map((value) => (
              <TableHead
                key={value}
                className="h-0 p-0 px-2 text-center whitespace-nowrap"
                onClick={() => sort(value)}
              >
                <div className="flex items-center justify-center">
                  <span>{value}</span>
                  <span className="w-4 h-4 flex items-center justify-center">
                    {getSortDirectionIcon(value)}
                  </span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedLegends.map((legend) => (
            <TableRow
              key={legend.series}
              className="cursor-pointer h-[20px]"
              onClick={(e) => onLegendClicked(e, legend.series)}
            >
              {legendData.dimensionNames.map((title, index) => (
                <TableCell key={title} className="h-[20px] p-0 text-xs whitespace-nowrap">
                  <div
                    className={cn(
                      "flex items-center gap-2 px-2",
                      unselectedSeries.has(legend.series) ? "text-gray-400" : ""
                    )}
                  >
                    {index === 0 && (
                      <div
                        className="w-4 h-[6px] rounded-[1px]"
                        style={{ backgroundColor: legend.color }}
                      />
                    )}
                    {legend.dimensionValues[title]}
                  </div>
                </TableCell>
              ))}

              {legendOption.values?.map((value) => (
                <TableCell
                  key={value}
                  className="h-[20px] px-2 py-0 text-xs text-center whitespace-nowrap"
                >
                  {legend.valueFormatter(legend.values.get(value) ?? 0)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export interface TimeseriesVisualizationProps {
  // Data from facade
  data: Record<string, unknown>[];
  meta: Array<{ name: string; type?: string }>;
  descriptor: TimeseriesDescriptor;
  isLoading: boolean;
  error: string;
  selectedTimeSpan?: TimeSpan;

  // Callbacks to facade
  onTimeSpanSelect?: (timeSpan: TimeSpan) => void;
  onShowRawData?: () => void;
}

export interface TimeseriesVisualizationRef {
  getDropdownItems: () => React.ReactNode;
}

/**
 * Pure timeseries visualization component.
 * Receives data as props and handles only rendering and UI interactions.
 * No data fetching, no useConnection, no useRefreshable.
 */
export const TimeseriesVisualization = React.forwardRef<
  TimeseriesVisualizationRef,
  TimeseriesVisualizationProps
>(function TimeseriesVisualization(props, ref) {
  const {
    data,
    meta,
    descriptor,
    error,
    selectedTimeSpan: _selectedTimeSpan,
    onTimeSpanSelect,
    onShowRawData,
  } = props;
  const isDark = useIsDarkTheme();

  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const timestampsRef = useRef<number[]>([]);

  // State for legend data
  const [legendData, setLegendData] = useState<LegendData | undefined>(undefined);
  // State for brush selection (drilldown)
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeSpan | null>(null);

  // Detect columns
  const detectedColumns = useMemo(() => {
    if (!data || data.length === 0)
      return { timestampColumn: "", valueColumns: [], labelColumns: [] };

    const firstRow = data[0];
    const allColumns = meta.length > 0 ? meta.map((m) => m.name) : Object.keys(firstRow);

    let timestampColumn = "";
    const valueColumns: string[] = [];
    const labelColumns: string[] = [];

    for (const col of allColumns) {
      // Find the type for this column from meta
      const colMeta = meta.find((m) => m.name === col);
      const colType = colMeta?.type;

      if (isTimestampColumnUtil(col, colType)) {
        timestampColumn = col;
      } else if (typeof firstRow[col] === "number") {
        valueColumns.push(col);
      } else {
        // Non-numeric, non-timestamp columns are label columns
        labelColumns.push(col);
      }
    }

    return { timestampColumn, valueColumns, labelColumns };
  }, [data, meta]);

  // Infer format from metric name (copied from dashboard-panel-timeseries.tsx)
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

  // Check if drilldown is available
  const hasDrilldown = useCallback((): boolean => {
    return descriptor.drilldown !== undefined && Object.keys(descriptor.drilldown).length > 0;
  }, [descriptor.drilldown]);

  // Get first drilldown descriptor
  const getFirstDrilldownDescriptor = useCallback((): PanelDescriptor | null => {
    if (!descriptor.drilldown) return null;
    const firstKey = Object.keys(descriptor.drilldown)[0];
    return descriptor.drilldown[firstKey] || null;
  }, [descriptor.drilldown]);

  // Render drilldown component
  const renderDrilldownComponent = useCallback(
    (drilldownDescriptor: PanelDescriptor, timeRange: TimeSpan) => {
      return (
        <div className="border-t pt-4">
          <DashboardPanel
            descriptor={drilldownDescriptor}
            selectedTimeSpan={timeRange}
            initialLoading={true}
          />
        </div>
      );
    },
    []
  );

  // Initialize echarts instance
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.dispose();
      chartInstanceRef.current = null;
    }

    const chartTheme = isDark ? "dark" : undefined;
    const chartInstance = echarts.init(chartContainerRef.current, chartTheme);
    chartInstanceRef.current = chartInstance;

    // Add click handler for time span selection
    if (onTimeSpanSelect) {
      chartInstance.on("click", (p: { dataIndex?: number }) => {
        if (!p || typeof p?.dataIndex !== "number") {
          return;
        }
        const dataIndex = p.dataIndex;
        const timestamps = timestampsRef.current;
        const ts = timestamps[dataIndex];
        if (!ts) {
          return;
        }

        // Estimate bucket size from neighboring points
        let bucketMs = 60_000;
        if (timestamps.length >= 2) {
          if (dataIndex < timestamps.length - 1) {
            bucketMs = timestamps[dataIndex + 1] - timestamps[dataIndex];
          } else if (dataIndex > 0) {
            bucketMs = timestamps[dataIndex] - timestamps[dataIndex - 1];
          }
        }
        if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
          bucketMs = 60_000;
        }

        const start = new Date(ts);
        const end = new Date(ts + bucketMs);
        const timeSpan: TimeSpan = {
          startISO8601: DateTimeExtension.formatISO8601(start) || start.toISOString(),
          endISO8601: DateTimeExtension.formatISO8601(end) || end.toISOString(),
        };
        onTimeSpanSelect(timeSpan);
      });
    }

    const handleResize = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize({ width: "auto", height: "auto" });
      }
    };
    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => {
      if (chartInstanceRef.current) {
        requestAnimationFrame(() => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.resize({ width: "auto", height: "auto" });
          }
        });
      }
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    const initialResizeTimeout = setTimeout(() => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize({ width: "auto", height: "auto" });
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
  }, [isDark, onTimeSpanSelect]);

  // Update chart when data changes
  useEffect(() => {
    if (!chartInstanceRef.current) {
      return;
    }

    // If there's an error, clear the chart (error message is shown in JSX)
    if (error) {
      chartInstanceRef.current.clear();
      setLegendData(undefined);
      timestampsRef.current = [];
      return;
    }

    // If no data, show "No data" message
    if (!data || data.length === 0) {
      chartInstanceRef.current.clear();
      setLegendData(undefined);
      timestampsRef.current = [];
      chartInstanceRef.current.setOption({
        title: { show: true, text: "No data", left: "center", top: "center" },
        backgroundColor: "transparent",
        xAxis: { type: "category", data: [] },
        yAxis: { type: "value" },
        series: [],
      });
      return;
    }

    try {
      const { timestampColumn, valueColumns, labelColumns } = detectedColumns;

      if (!timestampColumn || valueColumns.length === 0) {
        console.error("No valid timeseries data:", { timestampColumn, valueColumns });
        chartInstanceRef.current.setOption({
          title: {
            show: true,
            text: "No valid time series data",
            left: "center",
            top: "center",
          },
          backgroundColor: "transparent",
        });
        return;
      }

      // Transform data to normalize format (array format to object format)
      const transformedData = transformRowsToChartData(data, meta);

      // Get unique timestamps and sort them
      const timestamps = Array.from(
        new Set(
          transformedData.map((row) => {
            const ts = row[timestampColumn] as number;
            return typeof ts === "number" && ts > 1e10 ? ts : ts * 1000;
          })
        )
      ).sort((a, b) => a - b);

      // Store timestamps in ref for click handler
      timestampsRef.current = timestamps;

      // Build x-axis data with formatted time strings
      const xAxisData: string[] = timestamps.map((ts) => {
        const date = new Date(ts);
        return DateTimeExtension.formatDateTime(date, "HH:mm:ss") || "";
      });

      // Create a map for quick timestamp lookup
      const timestampMap = new Map<number, Record<string, unknown>>();
      transformedData.forEach((row) => {
        const ts = row[timestampColumn] as number;
        const timestamp = typeof ts === "number" && ts > 1e10 ? ts : ts * 1000;
        timestampMap.set(timestamp, row);
      });

      // Build series from value columns
      const series: echarts.SeriesOption[] = [];
      const newLegends: Legend[] = [];
      const FormatterInstance = Formatter.getInstance();

      if (labelColumns.length > 0) {
        // Group data by label combinations for each metric (same as old implementation)
        valueColumns.forEach((metricCol) => {
          const labelGroups = new Map<string, Array<{ timestamp: number; value: number }>>();

          transformedData.forEach((row) => {
            const ts = row[timestampColumn] as number;
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

            // Build label key from all label columns
            const labelKeyParts = labelColumns
              .filter((labelCol) => labelCol !== timestampColumn)
              .map((labelCol) => {
                const labelValue = row[labelCol];
                // Skip if value looks like a timestamp (large number)
                if (typeof labelValue === "number" && labelValue > 1e10) {
                  return null;
                }
                const strValue = String(labelValue || "");
                // Handle empty hostname-like columns
                if (
                  strValue === "" &&
                  (labelCol.toLowerCase().includes("host") ||
                    labelCol.toLowerCase().includes("hostname"))
                ) {
                  return "empty-hostname";
                }
                return strValue;
              })
              .filter((part) => part !== null);

            const labelKey = labelKeyParts.length > 0 ? labelKeyParts.join(" - ") : metricCol;

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
              const point = points.find((p) => Math.abs(p.timestamp - tsMs) < 1000);
              return point ? point.value : null;
            });

            // Get format and formatter
            const fieldOption =
              descriptor.fieldOptions instanceof Map
                ? descriptor.fieldOptions.get(metricCol)
                : descriptor.fieldOptions?.[metricCol];
            const inferredFormat = inferFormatFromMetricName(metricCol);
            const format = (fieldOption?.format as FormatName) || inferredFormat;
            const formatter = FormatterInstance.getFormatter(format);

            // Calculate reducer values
            const values = new Map<Reducer, number>();
            const reducers = descriptor.legendOption?.values || ["avg"];
            reducers.forEach((reducer: Reducer) => {
              const value = applyReducer(
                seriesData.filter((v): v is number => v !== null),
                reducer
              );
              values.set(reducer, value);
            });

            // Build dimension values from label key
            const dimensionValues: Record<string, string> = {};
            const labelValues = labelKey.split(" - ");
            labelColumns.forEach((labelCol, idx) => {
              dimensionValues[labelCol] = labelValues[idx] || "";
            });

            // Series name: if multiple metrics, append metric name in parentheses
            const seriesName = valueColumns.length > 1 ? `${labelKey} (${metricCol})` : labelKey;

            newLegends.push({
              color: "#5470c6", // ECharts will auto-assign colors
              series: seriesName,
              valueFormatter: formatter,
              dimensionValues,
              values,
            });

            const seriesOption: echarts.SeriesOption = {
              name: seriesName,
              type: descriptor.type === "bar" ? "bar" : "line",
              data: seriesData,
              yAxisIndex: 0,
              smooth: true,
              showSymbol: false,
              areaStyle: descriptor.type === "area" ? { opacity: 0.3 } : undefined,
              barMaxWidth: descriptor.type === "bar" ? 24 : undefined,
            };

            series.push(seriesOption);
          });
        });
      } else {
        // No label columns - create one series per value column (simple case)
        valueColumns.forEach((col) => {
          const fieldOption =
            descriptor.fieldOptions instanceof Map
              ? descriptor.fieldOptions.get(col)
              : descriptor.fieldOptions?.[col];
          const inferredFormat = inferFormatFromMetricName(col);
          const format = (fieldOption?.format as FormatName) || inferredFormat;
          const formatter = FormatterInstance.getFormatter(format);

          // Create data array aligned with xAxisData
          const seriesData: (number | null)[] = timestamps.map((tsMs) => {
            const row = timestampMap.get(tsMs);
            if (!row) return null;

            const value = row[col];
            if (typeof value === "number") {
              return value;
            } else if (typeof value === "string") {
              const num = parseFloat(value);
              return isNaN(num) ? null : num;
            }
            return null;
          });

          // Calculate reducer values
          const values = new Map<Reducer, number>();
          const reducers = descriptor.legendOption?.values || ["avg"];
          reducers.forEach((reducer: Reducer) => {
            const value = applyReducer(
              seriesData.filter((v): v is number => v !== null),
              reducer
            );
            values.set(reducer, value);
          });

          // Build dimension values - use metric name as dimension
          const dimensionValues: Record<string, string> = {};
          dimensionValues[valueColumns[0] || "value"] = col;

          newLegends.push({
            color: "#5470c6", // ECharts will auto-assign colors
            series: col,
            valueFormatter: formatter,
            dimensionValues,
            values,
          });

          const seriesOption: echarts.SeriesOption = {
            name: col,
            type: descriptor.type === "bar" ? "bar" : "line",
            data: seriesData,
            yAxisIndex: 0,
            smooth: true,
            showSymbol: false,
            areaStyle: descriptor.type === "area" ? { opacity: 0.3 } : undefined,
            barMaxWidth: descriptor.type === "bar" ? 24 : undefined,
          };

          series.push(seriesOption);
        });
      }

      // Build dimension names from label columns (same as old implementation)
      const dimensionNames = labelColumns.length > 0 ? labelColumns : valueColumns.slice(0, 1);

      setLegendData({ dimensionNames, legends: newLegends });

      // Build y-axis with proper formatting
      const yAxis: echarts.EChartsOption["yAxis"] = [
        {
          type: "value",
          name: "",
          splitLine: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            formatter: (value: number) => {
              // Use first metric's format for y-axis labels (same as old implementation)
              if (valueColumns.length > 0) {
                const format = inferFormatFromMetricName(valueColumns[0]);
                const formatter = FormatterInstance.getFormatter(format);
                const formatted = formatter(value);
                return typeof formatted === "string" ? formatted : String(formatted);
              }
              return String(value);
            },
          },
        },
      ];

      // Build ECharts option
      const option: echarts.EChartsOption = {
        animation: false,
        backgroundColor: "transparent",
        title: { show: false },
        toolbox: { show: false },
        brush: hasDrilldown()
          ? {
              xAxisIndex: "all",
              brushLink: "all",
              outOfBrush: { colorAlpha: 0.1 },
            }
          : undefined,
        tooltip: {
          trigger: "axis",
          confine: false,
          enterable: true,
          // Keep tooltip inside the viewport even when `confine: false`.
          // For `trigger: "axis"`, ECharts uses chart-local coordinates for `point`.
          // We compute placement in viewport coords (so we can clamp), then convert back.
          position: (point, _params, _dom, _rect, size) => {
            const [x, y] = point;
            const tooltipWidth = size.contentSize[0];
            const tooltipHeight = size.contentSize[1];
            const offset = 8; // keep a small gap from the mouse point (Grafana-like)

            const containerRect = chartContainerRef.current?.getBoundingClientRect();
            if (!containerRect) {
              return [x + offset, y + offset];
            }

            // Cursor position in viewport coordinates
            const cursorX = containerRect.left + x;
            const cursorY = containerRect.top + y;

            // Default: bottom-right of the mouse point (in viewport coords)
            let leftV = cursorX + offset;
            let topV = cursorY + offset;

            // If it would overflow right edge, place to the left of the mouse point
            if (leftV + tooltipWidth + offset > window.innerWidth) {
              leftV = cursorX - tooltipWidth - offset;
            }

            // If it would overflow bottom edge, place above the mouse point
            if (topV + tooltipHeight + offset > window.innerHeight) {
              topV = cursorY - tooltipHeight - offset;
            }

            // Final clamp to stay within viewport margins
            leftV = Math.min(Math.max(leftV, offset), window.innerWidth - tooltipWidth - offset);
            topV = Math.min(Math.max(topV, offset), window.innerHeight - tooltipHeight - offset);

            // Convert back to chart-local coords (what ECharts expects for positioning)
            return [leftV - containerRect.left, topV - containerRect.top];
          },
          axisPointer: { type: "line" },
          appendToBody: true,
          extraCssText: "max-height: 80vh; overflow-y: auto; font-size: 12px; line-height: 1.25;",
          formatter: (params: unknown) => {
            if (!Array.isArray(params) || params.length === 0) return "";
            const firstParam = params[0] as { axisValue: string; dataIndex: number };
            const dataIndex = firstParam.dataIndex;
            let tooltipTitle = firstParam.axisValue;

            if (timestamps && timestamps[dataIndex]) {
              const currentTimestamp = timestamps[dataIndex];
              let bucketMs = 60_000;

              if (timestamps.length >= 2) {
                if (dataIndex < timestamps.length - 1) {
                  bucketMs = timestamps[dataIndex + 1] - currentTimestamp;
                } else if (dataIndex > 0) {
                  bucketMs = currentTimestamp - timestamps[dataIndex - 1];
                }
              }

              if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
                bucketMs = 60_000;
              }

              const startDate = new Date(currentTimestamp);
              const endDate = new Date(currentTimestamp + bucketMs);
              tooltipTitle = `${DateTimeExtension.toYYYYMMddHHmmss(startDate)}<br/>${DateTimeExtension.toYYYYMMddHHmmss(endDate)}`;
            }

            let result = `<div style="margin-bottom: 6px; font-weight: 600;">${tooltipTitle}</div>`;

            // Get tooltip sort option, default to 'none'
            const sortValue = descriptor.tooltipOption?.sortValue || "none";

            // Create a copy of params array for sorting
            const sortedParams = [...params] as Array<{
              value: number | null;
              seriesName: string;
              color: string;
            }>;

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

            sortedParams.forEach(
              (param: { value: number | null; seriesName: string; color: string }) => {
                const value = param.value;
                if (value !== null && value !== undefined) {
                  const legend = newLegends.find((l) => l.series === param.seriesName);
                  const formattedValue = legend ? legend.valueFormatter(value) : value;

                  result += `
                  <div style="
                    display:flex;
                    align-items:center;
                    gap:8px;
                    padding:2px 6px;
                    margin-top:2px;
                    border-radius:4px;
                  ">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${param.color};flex:0 0 auto;"></span>
                    <span style="
                      flex:1 1 auto;
                      min-width:0;
                      overflow:hidden;
                      text-overflow:ellipsis;
                      white-space:nowrap;
                    ">${param.seriesName}</span>
                    <span style="
                      flex:0 0 auto;
                      text-align:right;
                      min-width:72px;
                      font-variant-numeric: tabular-nums;
                      white-space:nowrap;
                    ">${formattedValue}</span>
                  </div>
                `;
                }
              }
            );
            return result;
          },
        },
        legend: {
          data: series.map((s) => s.name as string),
          // Show ECharts legend only if:
          // 1. There are series to display, AND
          // 2. Either no legendOption is configured, OR legendOption.placement is "inside"
          show:
            series.length > 0 &&
            (!descriptor.legendOption || descriptor.legendOption.placement === "inside"),
          top: 0,
          type: "scroll",
          icon: "circle",
        },
        grid: {
          left: 20,
          right: 20,
          bottom: 8,
          // Adjust top margin based on whether ECharts legend is shown
          top:
            series.length > 0 &&
            (!descriptor.legendOption || descriptor.legendOption.placement === "inside")
              ? 32
              : 12,
          containLabel: true,
        },
        xAxis: {
          type: "category",
          data: xAxisData,
          boundaryGap: descriptor.type === "bar",
        },
        yAxis,
        series,
      };

      chartInstanceRef.current.setOption(option, true);

      // Add brush event handler if drilldown is enabled (same as old implementation)
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
            if (
              brushArea.coordRange &&
              Array.isArray(brushArea.coordRange) &&
              brushArea.coordRange.length === 2
            ) {
              const [startIndex, endIndex] = brushArea.coordRange;

              // Get the actual timestamps from the stored array
              if (startIndex >= 0 && endIndex < timestamps.length && startIndex <= endIndex) {
                const startTime = timestamps[Math.floor(startIndex)];
                const endTime = timestamps[Math.ceil(endIndex)];

                if (startTime && endTime) {
                  const startISO = new Date(startTime).toISOString();
                  const endISO = new Date(endTime).toISOString();

                  setSelectedTimeRange({
                    startISO8601: startISO,
                    endISO8601: endISO,
                  });
                }
              }
            }
          }
        };

        chartInstanceRef.current.on("brushEnd", handleBrush);
      }

      requestAnimationFrame(() => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.resize({ width: "auto", height: "auto" });
        }
      });
    } catch (err) {
      console.error("Error updating timeseries chart:", err);
    }
  }, [data, descriptor, detectedColumns, meta, inferFormatFromMetricName, hasDrilldown, error]);

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    getDropdownItems: () => (
      <>
        {onShowRawData && (
          <DashboardDropdownMenuItem onClick={onShowRawData}>
            Show query result
          </DashboardDropdownMenuItem>
        )}
      </>
    ),
  }));

  // Memoize drilldown component
  const drilldownComponent = useMemo(() => {
    if (!hasDrilldown() || !selectedTimeRange) return null;
    const drilldownDescriptor = getFirstDrilldownDescriptor();
    if (!drilldownDescriptor) return null;
    return renderDrilldownComponent(drilldownDescriptor, selectedTimeRange);
  }, [hasDrilldown, selectedTimeRange, getFirstDrilldownDescriptor, renderDrilldownComponent]);

  return (
    <CardContent
      className={cn("px-0 p-0 flex flex-col h-full", drilldownComponent ? "overflow-y-auto" : "")}
    >
      {error ? (
        <div
          key="error"
          className="flex flex-col items-center justify-center h-full gap-2 text-destructive p-4 overflow-hidden"
        >
          <p className="font-semibold shrink-0">Error loading chart data:</p>
          <p className="text-sm overflow-auto w-full text-center max-h-full custom-scrollbar">
            {error}
          </p>
        </div>
      ) : (
        <>
          <div
            ref={chartContainerRef}
            className={cn("w-full min-h-0", drilldownComponent ? "" : "flex-1")}
            style={{
              height: descriptor.height
                ? `${descriptor.height}px`
                : drilldownComponent
                  ? "300px"
                  : "100%",
              width: "100%",
              minWidth: 0,
            }}
          />
          {descriptor.legendOption &&
            descriptor.legendOption.placement !== "none" &&
            descriptor.legendOption.placement === "bottom" &&
            legendData && (
              <LegendTable
                chartInstance={chartInstanceRef.current || undefined}
                legendData={legendData}
                legendOption={descriptor.legendOption}
              />
            )}
          {drilldownComponent && <div>{drilldownComponent}</div>}
        </>
      )}
    </CardContent>
  );
});

TimeseriesVisualization.displayName = "TimeseriesVisualization";

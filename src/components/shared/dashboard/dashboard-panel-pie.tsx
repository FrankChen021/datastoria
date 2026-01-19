"use client";

/**
 * @deprecated This component is deprecated. Use DashboardVisualizationPanel facade instead.
 * This component will be removed in a future version.
 * Kept temporarily for backward compatibility.
 *
 * Migration: Simply use <DashboardVisualizationPanel descriptor={pieDescriptor} /> instead of
 * <DashboardPanelPie descriptor={pieDescriptor} />
 *
 * Dashboard Pie Chart Component
 *
 * Renders data as a pie chart using ECharts. Follows the same pattern as the timeseries component.
 *
 * Expected data format:
 * - Query should return rows with at least 2 columns:
 *   1. Name/Label column (string): Used for pie slice names
 *   2. Value column (number): Used for pie slice values
 *
 * Column detection:
 * - Looks for columns named: 'name', 'label', 'category' (for names) and 'value', 'count', 'amount' (for values)
 * - Falls back to first string column for names and first numeric column for values
 *
 * Features:
 * - Supports drilldown: Click on pie slices to show detailed data in a dialog
 * - Configurable legend placement: inside, bottom, right, or none
 * - Configurable labels: show/hide and format options
 * - Value formatting support using Formatter
 * - Theme support (dark/light mode)
 *
 * Example descriptor:
 * ```typescript
 * {
 *   type: "pie",
 *   titleOption: { title: "Distribution by Category" },
 *   query: {
 *     sql: "SELECT category as name, count(*) as value FROM table GROUP BY category"
 *   },
 *   legendOption: { placement: "right" },
 *   labelOption: { show: true, format: "name-percent" },
 *   valueFormat: "short_number",
 *   drilldown: {
 *     "Category1": { type: "table", query: { sql: "SELECT * FROM table WHERE category = 'Category1'" } }
 *   }
 * }
 * ```
 */
import { useConnection } from "@/components/connection/connection-context";
import { Dialog } from "@/components/shared/use-dialog";
import { CardContent } from "@/components/ui/card";
import { type JSONFormatResponse, type QueryError } from "@/lib/connection/connection";
import { Formatter } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import * as echarts from "echarts";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { transformRowsToChartData } from "./dashboard-data-utils";
import { showQueryDialog } from "./dashboard-dialog-utils";
import { DashboardDropdownMenuItem } from "./dashboard-dropdown-menu-item";
import {
  type PanelDescriptor,
  type PieDescriptor,
  type SQLQuery,
  type TableDescriptor,
} from "./dashboard-model";
import {
  DashboardVisualizationLayout,
  type DashboardVisualizationComponent,
  type RefreshOptions,
} from "./dashboard-visualization-layout";
import { DashboardVisualizationPanel } from "./dashboard-visualization-panel";
import { replaceTimeSpanParams } from "./sql-time-utils";
import type { TimeSpan } from "./timespan-selector";
import useIsDarkTheme from "./use-is-dark-theme";
import { useRefreshable } from "./use-refreshable";

interface DashboardPanelPieProps {
  // The pie descriptor configuration
  descriptor: PieDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;

  // Initial loading state (useful for drilldown dialogs)
  initialLoading?: boolean;

  // Callback when collapsed state changes
  onCollapsedChange?: (isCollapsed: boolean) => void;

  className?: string;
}

const DashboardPanelPie = forwardRef<DashboardVisualizationComponent, DashboardPanelPieProps>(
  function DashboardPanelPie(props, ref) {
    const { descriptor, selectedTimeSpan: propSelectedTimeSpan } = props;
    const { connection } = useConnection();
    const isDark = useIsDarkTheme();

    // State
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [meta, setMeta] = useState<Array<{ name: string; type?: string }>>([]);
    const [isLoading, setIsLoading] = useState(props.initialLoading ?? false);
    const [error, setError] = useState("");
    const [executedSql, setExecutedSql] = useState<string>("");

    // Refs
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartInstanceRef = useRef<echarts.ECharts | null>(null);
    const apiCancellerRef = useRef<AbortController | null>(null);

    // Check if drilldown is available
    const hasDrilldown = useCallback((): boolean => {
      return descriptor.drilldown !== undefined && Object.keys(descriptor.drilldown).length > 0;
    }, [descriptor.drilldown]);

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
        // Pie chart expects data in format: { name: string, value: number }[]
        // We need to identify name and value columns from the data
        const firstRow = data[0];
        const allColumns = meta.length > 0 ? meta.map((m) => m.name) : Object.keys(firstRow);

        // Find name and value columns
        // Name column: first string column or column named 'name', 'label', 'category', etc.
        // Value column: first numeric column or column named 'value', 'count', 'amount', etc.
        let nameColumn = "";
        let valueColumn = "";

        // Try to find by name first
        const nameColumnCandidates = ["name", "label", "category", "key"];
        const valueColumnCandidates = ["value", "count", "amount", "total"];

        for (const candidate of nameColumnCandidates) {
          if (allColumns.some((col) => col.toLowerCase() === candidate)) {
            nameColumn = allColumns.find((col) => col.toLowerCase() === candidate) || "";
            break;
          }
        }

        for (const candidate of valueColumnCandidates) {
          if (allColumns.some((col) => col.toLowerCase() === candidate)) {
            valueColumn = allColumns.find((col) => col.toLowerCase() === candidate) || "";
            break;
          }
        }

        // If not found by name, use first string and first numeric column
        if (!nameColumn) {
          // Find first string column
          for (const col of allColumns) {
            const sampleValue = firstRow[col];
            if (typeof sampleValue === "string") {
              nameColumn = col;
              break;
            }
          }
        }

        if (!valueColumn) {
          // Find first numeric column
          for (const col of allColumns) {
            const sampleValue = firstRow[col];
            if (typeof sampleValue === "number") {
              valueColumn = col;
              break;
            }
          }
        }

        // If still not found, use first two columns
        if (!nameColumn && allColumns.length > 0) {
          nameColumn = allColumns[0];
        }
        if (!valueColumn && allColumns.length > 1) {
          valueColumn = allColumns[1];
        } else if (!valueColumn && allColumns.length === 1) {
          valueColumn = allColumns[0];
        }

        // Build pie chart data
        const pieData: Array<{ name: string; value: number }> = [];
        data.forEach((row) => {
          const name = String(row[nameColumn] || "");
          const value = row[valueColumn];

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

          pieData.push({ name, value: numValue });
        });

        // Get formatter for values
        const FormatterInstance = Formatter.getInstance();
        const valueFormat = descriptor.valueFormat || "short_number";
        const valueFormatter = FormatterInstance.getFormatter(valueFormat);

        // Build label formatter based on labelOption
        const labelFormat = descriptor.labelOption?.format || "name-percent";
        const showLabel = descriptor.labelOption?.show !== false; // Default to true

        let labelFormatter: (params: { name: string; value: number; percent: number }) => string;
        switch (labelFormat) {
          case "name":
            labelFormatter = (params) => params.name;
            break;
          case "value":
            labelFormatter = (params) => {
              const formatted = valueFormatter(params.value);
              return typeof formatted === "string" ? formatted : String(formatted);
            };
            break;
          case "percent":
            labelFormatter = (params) => `${params.percent.toFixed(1)}%`;
            break;
          case "name-value":
            labelFormatter = (params) => {
              const formatted = valueFormatter(params.value);
              const formattedStr = typeof formatted === "string" ? formatted : String(formatted);
              return `${params.name}: ${formattedStr}`;
            };
            break;
          case "name-percent":
          default:
            labelFormatter = (params) => `${params.name}: ${params.percent.toFixed(1)}%`;
            break;
        }

        // Build legend configuration
        const legendOption = descriptor.legendOption;
        const showLegend = !legendOption || legendOption.placement !== "none";
        const legendPlacement = legendOption?.placement || "inside";

        // Build final echarts option
        const option: echarts.EChartsOption = {
          animation: false,
          backgroundColor: "transparent",
          title: {
            show: false,
          },
          tooltip: {
            trigger: "item",
            confine: false,
            enterable: true,
            appendToBody: true,
            formatter: (params: unknown) => {
              const param = params as { name: string; value: number; percent: number };
              const formatted = valueFormatter(param.value);
              const formattedStr = typeof formatted === "string" ? formatted : String(formatted);
              return `
                <div style="font-weight: 600; margin-bottom: 4px;">${param.name}</div>
                <div style="display: flex; justify-content: space-between; gap: 16px;">
                  <span>Value:</span>
                  <span style="font-weight: 600;">${formattedStr}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 16px;">
                  <span>Percent:</span>
                  <span style="font-weight: 600;">${param.percent.toFixed(1)}%</span>
                </div>
              `;
            },
          },
          legend: {
            show: showLegend && legendPlacement === "inside",
            top: "5%",
            left: "center",
            type: "scroll",
            icon: "circle",
          },
          series: [
            {
              type: "pie",
              radius: legendPlacement === "right" ? ["40%", "70%"] : ["50%", "75%"],
              center: legendPlacement === "right" ? ["35%", "50%"] : ["50%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: {
                borderRadius: 4,
                borderColor: isDark ? "#1f1f1f" : "#fff",
                borderWidth: 2,
              },
              label: {
                show: showLabel,
                formatter: (params: unknown) => {
                  const param = params as { name: string; value: number; percent: number };
                  return labelFormatter(param);
                },
              },
              emphasis: {
                label: {
                  show: true,
                  fontSize: 14,
                  fontWeight: "bold",
                },
                itemStyle: {
                  shadowBlur: 10,
                  shadowOffsetX: 0,
                  shadowColor: "rgba(0, 0, 0, 0.5)",
                },
              },
              data: pieData,
            },
          ],
        };

        // Add right-side legend if placement is "right"
        if (showLegend && legendPlacement === "right") {
          option.legend = {
            show: true,
            orient: "vertical",
            right: "5%",
            top: "center",
            type: "scroll",
            icon: "circle",
          };
        } else if (showLegend && legendPlacement === "bottom") {
          option.legend = {
            show: true,
            bottom: "5%",
            left: "center",
            type: "scroll",
            icon: "circle",
          };
        }

        chartInstanceRef.current.setOption(option, true);

        // Add click event handler if drilldown is enabled
        if (hasDrilldown() && chartInstanceRef.current) {
          chartInstanceRef.current.off("click");
          chartInstanceRef.current.on("click", (params: unknown) => {
            const clickParams = params as { name: string; value: number };
            handlePieClick(clickParams.name);
          });
        }

        // Resize after setting option to ensure proper rendering
        requestAnimationFrame(() => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.resize({ width: "auto", height: "auto" });
            // Second resize after a short delay to catch any layout changes
            setTimeout(() => {
              if (chartInstanceRef.current) {
                chartInstanceRef.current.resize({ width: "auto", height: "auto" });
              }
            }, 100);
          }
        });
      } catch (err) {
        console.error("Error updating chart:", err);
        setError(err instanceof Error ? err.message : "Error updating chart");
      }
    }, [data, descriptor, meta, isDark, hasDrilldown]);

    // Handle pie slice click for drilldown
    const handlePieClick = useCallback(
      (sliceName: string) => {
        if (!hasDrilldown()) {
          return;
        }

        // Get drilldown descriptor - use the slice name as key, or use the first drilldown if not found
        const drilldownKey = descriptor.drilldown?.[sliceName]
          ? sliceName
          : Object.keys(descriptor.drilldown || {})[0];
        const drilldownDescriptor = descriptor.drilldown?.[drilldownKey];

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

        const title = drilldownDescriptor.titleOption?.title || `${sliceName} - Details`;
        const description = drilldownDescriptor.titleOption?.description;

        Dialog.showDialog({
          title,
          description,
          className: "max-w-[60vw] h-[70vh]",
          disableContentScroll: false,
          mainContent: (
            <div className="w-full h-full overflow-auto">
              <DashboardVisualizationPanel
                descriptor={modifiedDescriptor}
                selectedTimeSpan={propSelectedTimeSpan}
                initialLoading={true}
              />
            </div>
          ),
        });
      },
      [descriptor.drilldown, hasDrilldown, propSelectedTimeSpan]
    );

    // Load data from API
    const loadData = useCallback(
      async (param: RefreshOptions) => {
        if (!connection) {
          setError("No connection selected");
          return;
        }

        if (!descriptor.query) {
          setError("No query defined for this chart component.");
          return;
        }

        setIsLoading(true);
        setError("");

        try {
          // Cancel previous request if any
          if (apiCancellerRef.current) {
            apiCancellerRef.current.abort();
            apiCancellerRef.current = null;
          }

          // Build query from descriptor
          const query = Object.assign({}, descriptor.query) as SQLQuery;

          // Replace time span template parameters in SQL if time span is provided
          const finalSql = replaceTimeSpanParams(
            query.sql,
            param.selectedTimeSpan,
            connection.metadata.timezone
          );
          setExecutedSql(finalSql);

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

          (async () => {
            try {
              const apiResponse = await response;

              // Check if request was aborted
              if (abortController.signal.aborted) {
                setIsLoading(false);
                return;
              }

              const responseData = apiResponse.data.json<JSONFormatResponse>();

              // JSON format returns { meta: [...], data: [...], rows: number, statistics: {...} }
              const rows = responseData.data || [];
              const meta = responseData.meta || [];

              const transformedData = transformRowsToChartData(rows, meta);

              // Store meta for later use in chart rendering
              setMeta(meta);
              setData(transformedData);
              setError("");
              setIsLoading(false);
            } catch (error) {
              // Check if request was aborted
              if (abortController.signal.aborted) {
                setIsLoading(false);
                return;
              }

              const apiError = error as QueryError;
              const errorMessage = apiError.message || "Unknown error occurred";
              const lowerErrorMessage = errorMessage.toLowerCase();
              if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
                setIsLoading(false);
                return;
              }

              setError(apiError.data);
              setIsLoading(false);
            }
          })();
        } catch (error) {
          const errorMessage = (error as Error).message || "Unknown error occurred";
          setError(errorMessage);
          setIsLoading(false);
        }
      },
      [descriptor, connection]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshOptions) => {
        if (!descriptor.query) {
          console.error(
            `No query defined for chart [${descriptor.titleOption?.title || descriptor.type}]`
          );
          setError("No query defined for this chart component.");
          return;
        }

        loadData(param);
      },
      [descriptor, loadData]
    );

    // Use shared refreshable hook
    const getInitialParams = useCallback(() => {
      return propSelectedTimeSpan
        ? ({ selectedTimeSpan: propSelectedTimeSpan } as RefreshOptions)
        : undefined;
    }, [propSelectedTimeSpan]);

    const { componentRef, isCollapsed, setIsCollapsed, refresh, getLastRefreshParameter } =
      useRefreshable({
        initialCollapsed: descriptor.collapsed ?? false,
        refreshInternal,
        getInitialParams,
        onCollapsedChange: props.onCollapsedChange,
      });

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
          chartInstanceRef.current.resize({ width: "auto", height: "auto" });
        }
      };
      window.addEventListener("resize", handleResize);

      // Use ResizeObserver to watch for container size changes
      const resizeObserver = new ResizeObserver(() => {
        if (chartInstanceRef.current) {
          // Use requestAnimationFrame to ensure DOM has updated
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

      // Initial resize after a short delay to ensure container has final dimensions
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
    }, [isDark]);

    // Resize chart when expanded/collapsed state changes
    useEffect(() => {
      if (!chartInstanceRef.current) {
        return;
      }

      // Use multiple animation frames and a timeout to ensure proper resize
      let frameId2: number | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const frameId1 = requestAnimationFrame(() => {
        frameId2 = requestAnimationFrame(() => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.resize({ width: "auto", height: "auto" });
            // Additional resize after a delay to catch any delayed layout changes
            timeoutId = setTimeout(() => {
              if (chartInstanceRef.current) {
                chartInstanceRef.current.resize({ width: "auto", height: "auto" });
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

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
      getLastRefreshOptions: getLastRefreshParameter, // Alias for compatibility
      getEChartInstance: () => chartInstanceRef.current || undefined,
    }));

    // Cleanup API canceller on unmount
    useEffect(() => {
      return () => {
        if (apiCancellerRef.current) {
          apiCancellerRef.current.abort();
          apiCancellerRef.current = null;
        }
      };
    }, []);

    // Handler for showing query dialog
    const handleShowQuery = useCallback(() => {
      showQueryDialog(descriptor.query, descriptor.titleOption?.title, executedSql);
    }, [descriptor.query, descriptor.titleOption, executedSql]);

    // Build dropdown menu items
    const dropdownItems = (
      <>
        {descriptor.query?.sql && (
          <DashboardDropdownMenuItem onClick={handleShowQuery}>
            Show query
          </DashboardDropdownMenuItem>
        )}
      </>
    );

    // Handler for refresh button
    const handleRefresh = useCallback(() => {
      const lastParams = getLastRefreshParameter();
      refresh({ ...lastParams, forceRefresh: true });
    }, [getLastRefreshParameter, refresh]);

    return (
      <DashboardVisualizationLayout
        componentRef={componentRef}
        className={props.className}
        isLoading={isLoading}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        titleOption={descriptor.titleOption}
        dropdownItems={dropdownItems}
        onRefresh={handleRefresh}
        headerBackground={true}
      >
        <CardContent className="px-0 p-0 h-full flex flex-col">
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
            <div
              ref={chartContainerRef}
              className={cn("flex-1 w-full min-h-0", hasDrilldown() && "cursor-pointer")}
              style={{
                height: descriptor.height ? `${descriptor.height}px` : "100%",
                width: "100%",
                minWidth: 0,
              }}
            />
          )}
        </CardContent>
      </DashboardVisualizationLayout>
    );
  }
);

export default DashboardPanelPie;

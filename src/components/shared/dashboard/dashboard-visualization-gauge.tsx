"use client";

import { Dialog } from "@/components/shared/use-dialog";
import { CardContent } from "@/components/ui/card";
import { Formatter } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import * as echarts from "echarts";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DRILLDOWN_DIALOG_CLASS_NAME } from "./dashboard-dialog-utils";
import type { GaugeDescriptor, PanelDescriptor, TableDescriptor } from "./dashboard-model";
import type { VisualizationRef } from "./dashboard-visualization-layout";
import { DashboardVisualizationPanel } from "./dashboard-visualization-panel";
import type { TimeSpan } from "./timespan-selector";
import { useEcharts } from "./use-echarts";
import useIsDarkTheme from "./use-is-dark-theme";

export interface GaugeVisualizationProps {
  // Data from facade
  data: Record<string, unknown>[];
  meta: Array<{ name: string; type?: string }>;
  descriptor: GaugeDescriptor;
  selectedTimeSpan?: TimeSpan;
}

export type GaugeVisualizationRef = VisualizationRef;

/**
 * Pure gauge visualization component.
 * Receives data as props and handles only rendering and UI interactions.
 * No data fetching, no useConnection, no useRefreshable.
 */
export const GaugeVisualization = React.forwardRef<GaugeVisualizationRef, GaugeVisualizationProps>(
  function GaugeVisualization(props, ref) {
    const { data, meta, descriptor, selectedTimeSpan } = props;
    const isDark = useIsDarkTheme();

    // Refs
    const { chartContainerRef, chartInstanceRef } = useEcharts({
      useExplicitSize: true,
      initOptions: {
        devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
        renderer: "canvas",
      },
    });
    const [chartColor, setChartColor] = useState<string>("hsl(var(--chart-1))");

    // Check if drilldown is available
    const hasDrilldown = useCallback((): boolean => {
      return descriptor.drilldown !== undefined && descriptor.drilldown.main !== undefined;
    }, [descriptor.drilldown]);

    // Handle drilldown click
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
        className: DRILLDOWN_DIALOG_CLASS_NAME,
        disableContentScroll: false,
        mainContent: (
          <div className="w-full h-full overflow-auto">
            <DashboardVisualizationPanel
              descriptor={modifiedDescriptor}
              initialTimeSpan={selectedTimeSpan}
              initialLoading={true}
            />
          </div>
        ),
      });
    }, [descriptor.drilldown, selectedTimeSpan]);

    // Get chart color from CSS variable
    useEffect(() => {
      const updateChartColor = () => {
        const tempEl = document.createElement("div");
        tempEl.style.color = "var(--chart-1)";
        tempEl.style.position = "absolute";
        tempEl.style.visibility = "hidden";
        document.body.appendChild(tempEl);

        const computedColor = getComputedStyle(tempEl).color;
        document.body.removeChild(tempEl);

        if (
          computedColor &&
          computedColor !== "rgba(0, 0, 0, 0)" &&
          computedColor !== "rgb(0, 0, 0)"
        ) {
          setChartColor(computedColor);
        } else {
          tempEl.style.color = "var(--primary)";
          document.body.appendChild(tempEl);
          const fallbackColor = getComputedStyle(tempEl).color;
          document.body.removeChild(tempEl);
          if (
            fallbackColor &&
            fallbackColor !== "rgba(0, 0, 0, 0)" &&
            fallbackColor !== "rgb(0, 0, 0)"
          ) {
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
        // Gauge chart expects a single numeric value
        // We need to identify the value column from the data
        const firstRow = data[0];
        const allColumns = meta.length > 0 ? meta.map((m) => m.name) : Object.keys(firstRow);

        // Find value column - prefer numeric columns
        let valueColumn = "";
        for (const col of allColumns) {
          const sampleValue = firstRow[col];
          if (typeof sampleValue === "number") {
            valueColumn = col;
            break;
          }
        }

        // If not found, try to parse first column as number
        if (!valueColumn && allColumns.length > 0) {
          const firstColValue = firstRow[allColumns[0]];
          if (typeof firstColValue === "string") {
            const parsed = parseFloat(firstColValue);
            if (!isNaN(parsed)) {
              valueColumn = allColumns[0];
            }
          }
        }

        if (!valueColumn) {
          chartInstanceRef.current.setOption({
            title: {
              show: true,
              text: "No valid numeric data",
              left: "center",
              top: "center",
            },
            backgroundColor: "transparent",
          });
          return;
        }

        // Get the value from the first row (gauge shows a single value)
        const rawValue = firstRow[valueColumn];
        let gaugeValue: number;
        if (typeof rawValue === "number") {
          gaugeValue = rawValue;
        } else if (typeof rawValue === "string") {
          gaugeValue = parseFloat(rawValue);
          if (isNaN(gaugeValue)) {
            chartInstanceRef.current.setOption({
              title: {
                show: true,
                text: "Invalid numeric value",
                left: "center",
                top: "center",
              },
              backgroundColor: "transparent",
            });
            return;
          }
        } else {
          chartInstanceRef.current.setOption({
            title: {
              show: true,
              text: "No valid numeric data",
              left: "center",
              top: "center",
            },
            backgroundColor: "transparent",
          });
          return;
        }

        // Get gauge configuration
        const gaugeOption = descriptor.gaugeOption || {};
        const min = gaugeOption.min ?? 0;
        const max = gaugeOption.max ?? 100;
        const splitNumber = gaugeOption.splitNumber ?? 10;
        const showAxisLine = gaugeOption.showAxisLine !== false;
        const showAxisLabel = gaugeOption.showAxisLabel !== false;
        const showDetail = gaugeOption.showDetail !== false;
        const detailFormatter = gaugeOption.detailFormatter ?? "{value}%";
        const valueFormat = gaugeOption.valueFormat || "short_number";

        // Get formatter for values
        const FormatterInstance = Formatter.getInstance();
        const valueFormatter = FormatterInstance.getFormatter(valueFormat);

        // Format the detail value
        const formattedValue = valueFormatter(gaugeValue);
        const detailText = detailFormatter.replace(
          "{value}",
          typeof formattedValue === "string" ? formattedValue : String(formattedValue)
        );

        // Calculate percentage for color gradient
        const percentage = ((gaugeValue - min) / (max - min)) * 100;

        // Build ECharts gauge option with cleaner, simpler styling
        // For semi-circular gauge (200° to -20°), we position center lower so the visible arc appears centered
        const option: echarts.EChartsOption = {
          backgroundColor: "transparent",
          grid: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            containLabel: false,
          },
          series: [
            {
              type: "gauge",
              min,
              max,
              splitNumber: showAxisLabel ? splitNumber : 0, // Hide splits if labels are hidden
              radius: "95%", // Use 95% to maximize size while leaving small margin
              startAngle: 200,
              endAngle: -20,
              center: ["50%", "65%"], // Center horizontally, position center lower to vertically center the visible semi-circle
              // Make the gauge interactive for click events
              silent: false,
              emphasis: {
                disabled: false,
              },
              axisLine: {
                show: showAxisLine,
                lineStyle: {
                  width: 8,
                  color: [
                    [
                      percentage / 100,
                      chartColor, // Progress color
                    ],
                    [
                      1,
                      isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)", // Background color
                    ],
                  ],
                },
              },
              splitLine: {
                show: false, // Hide split lines for cleaner look
              },
              axisTick: {
                show: false, // Hide axis ticks for cleaner look
              },
              axisLabel: {
                show: false,
                color: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
                fontSize: 11,
                distance: -5,
              },
              pointer: {
                show: false,
                length: "70%",
                width: 1,
                itemStyle: {
                  color: chartColor,
                  shadowBlur: 5,
                  shadowColor: chartColor,
                },
              },
              detail: {
                show: showDetail,
                formatter: detailText,
                fontSize: 12,
                fontWeight: "bold",
                color: isDark ? "rgba(255, 255, 255, 0.95)" : "rgba(0, 0, 0, 0.95)",
                offsetCenter: [0, 0],
                // Add underline style when drilldown is available to indicate it's clickable
                ...(hasDrilldown() && {
                  textStyle: {
                    textDecoration: "underline",
                  },
                }),
              },
              data: [
                {
                  value: gaugeValue,
                  name: "",
                },
              ],
            },
          ],
        };

        chartInstanceRef.current.setOption(option, true);

        // Add click handler for drilldown - make the entire gauge clickable
        if (hasDrilldown()) {
          chartInstanceRef.current.off("click");
          // Handle clicks on the gauge series
          chartInstanceRef.current.on("click", (params: unknown) => {
            const clickParams = params as { componentType?: string; componentSubType?: string };
            // Accept clicks on the gauge series or any part of the chart
            if (
              clickParams.componentType === "series" ||
              clickParams.componentSubType === "gauge" ||
              !clickParams.componentType
            ) {
              handleDrilldownClick();
            }
          });

          // Add pointer cursor to ECharts canvas when drilldown is available
          requestAnimationFrame(() => {
            const canvas = chartContainerRef.current?.querySelector("canvas");
            if (canvas) {
              canvas.style.cursor = "pointer";
            }
          });
        } else {
          // Remove pointer cursor if no drilldown
          requestAnimationFrame(() => {
            const canvas = chartContainerRef.current?.querySelector("canvas");
            if (canvas) {
              canvas.style.cursor = "default";
            }
          });
        }

        // Resize after setting option with explicit dimensions for crisp rendering
        requestAnimationFrame(() => {
          if (chartInstanceRef.current && chartContainerRef.current) {
            const { width, height } = chartContainerRef.current.getBoundingClientRect();
            // Only resize if container has valid dimensions
            if (width > 0 && height > 0) {
              chartInstanceRef.current.resize({
                width: Math.round(width),
                height: Math.round(height),
              });
            }
          }
        });
      } catch (err) {
        console.error("Error updating gauge chart:", err);
      }
    }, [data, meta, descriptor, isDark, chartColor, hasDrilldown, handleDrilldownClick]);

    // Expose methods via ref
    React.useImperativeHandle(ref, () => ({
      getDropdownItems: () => null, // No visualization-specific dropdown items for gauge
      prepareDataFetchSql: (sql: string, _pageNumber?: number) => sql,
    }));

    return (
      <CardContent className="px-0 p-0 h-full flex flex-col">
        <div
          ref={chartContainerRef}
          className={cn(
            "flex-1 w-full min-h-0 flex items-center justify-center",
            hasDrilldown() && "cursor-pointer"
          )}
          style={{
            height: descriptor.height ? `${descriptor.height}px` : "100%",
            width: "100%",
            minWidth: 0,
            // Prevent blur from CSS transforms
            transform: "translateZ(0)",
            willChange: "auto",
            // Add pointer cursor when drilldown is available
            cursor: hasDrilldown() ? "pointer" : "default",
          }}
          onClick={hasDrilldown() ? handleDrilldownClick : undefined}
          onKeyDown={
            hasDrilldown()
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleDrilldownClick();
                  }
                }
              : undefined
          }
          role={hasDrilldown() ? "button" : undefined}
          tabIndex={hasDrilldown() ? 0 : undefined}
          aria-label={hasDrilldown() ? "Click to view details" : undefined}
        />
      </CardContent>
    );
  }
);

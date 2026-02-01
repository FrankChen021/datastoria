"use client";

import { Dialog } from "@/components/shared/use-dialog";
import { CardContent } from "@/components/ui/card";
import { Formatter } from "@/lib/formatter";
import * as echarts from "echarts";
import React, { useCallback, useEffect, useRef } from "react";
import { DRILLDOWN_DIALOG_CLASS_NAME } from "./dashboard-dialog-utils";
import type { PanelDescriptor, PieDescriptor, TableDescriptor } from "./dashboard-model";
import type { VisualizationRef } from "./dashboard-visualization-layout";
import { DashboardVisualizationPanel } from "./dashboard-visualization-panel";
import type { TimeSpan } from "./timespan-selector";
import { useEcharts } from "./use-echarts";
import useIsDarkTheme from "./use-is-dark-theme";

export interface PieVisualizationProps {
  // Data from facade
  data: Record<string, unknown>[];
  meta: Array<{ name: string; type?: string }>;
  descriptor: PieDescriptor;
  selectedTimeSpan?: TimeSpan;
}

export type PieVisualizationRef = VisualizationRef;

/**
 * Pure pie visualization component.
 * Receives data as props and handles only rendering and UI interactions.
 * No data fetching, no useConnection, no useRefreshable.
 */
export const PieVisualization = React.forwardRef<PieVisualizationRef, PieVisualizationProps>(
  function PieVisualization(props, ref) {
    const { data, meta, descriptor, selectedTimeSpan } = props;
    const isDark = useIsDarkTheme();

    // Refs
    const { chartContainerRef, chartInstanceRef } = useEcharts();

    // Check if drilldown is available
    const hasDrilldown = useCallback((): boolean => {
      return descriptor.drilldown !== undefined && Object.keys(descriptor.drilldown).length > 0;
    }, [descriptor.drilldown]);

    // Handle drilldown click
    const handleDrilldownClick = useCallback(
      (sliceName: string) => {
        const drilldownDescriptor = descriptor.drilldown?.[sliceName];
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
      },
      [descriptor.drilldown, selectedTimeSpan]
    );

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
          for (const col of allColumns) {
            const sampleValue = firstRow[col];
            if (typeof sampleValue === "string") {
              nameColumn = col;
              break;
            }
          }
        }

        if (!valueColumn) {
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

          let numValue: number;
          if (typeof value === "number") {
            numValue = value;
          } else if (typeof value === "string") {
            numValue = parseFloat(value);
            if (isNaN(numValue)) return;
          } else {
            return;
          }

          pieData.push({ name, value: numValue });
        });

        // Get formatter for values
        const FormatterInstance = Formatter.getInstance();
        const valueFormat = descriptor.valueFormat || "short_number";
        const valueFormatter = FormatterInstance.getFormatter(valueFormat);

        // Build label formatter based on labelOption
        const labelFormat = descriptor.labelOption?.format || "name-percent";
        const showLabel = descriptor.labelOption?.show !== false;

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

        let legendConfig: echarts.EChartsOption["legend"];
        if (showLegend) {
          const baseLegendConfig = {
            itemWidth: 18,
            itemHeight: 8,
          };
          if (legendPlacement === "bottom") {
            legendConfig = {
              type: "scroll",
              orient: "horizontal",
              bottom: 0,
              left: "center",
              ...baseLegendConfig,
            };
          } else if (legendPlacement === "right") {
            legendConfig = {
              type: "scroll",
              orient: "vertical",
              right: 10,
              top: "center",
              ...baseLegendConfig,
            };
          } else {
            // inside
            legendConfig = {
              type: "scroll",
              orient: "horizontal",
              top: 0,
              left: "center",
              ...baseLegendConfig,
            };
          }
        } else {
          legendConfig = { show: false };
        }

        // Build ECharts option
        const option: echarts.EChartsOption = {
          backgroundColor: "transparent",
          tooltip: {
            trigger: "item",
            formatter: (params: unknown) => {
              const p = params as { name: string; value: number; percent: number };
              const formattedValue = valueFormatter(p.value);
              return `${p.name}<br/>${formattedValue} (${p.percent.toFixed(1)}%)`;
            },
          },
          legend: legendConfig,
          series: [
            {
              type: "pie",
              radius: legendPlacement === "right" ? ["40%", "70%"] : "50%",
              center: legendPlacement === "right" ? ["40%", "50%"] : ["50%", "50%"],
              data: pieData,
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowOffsetX: 0,
                  shadowColor: "rgba(0, 0, 0, 0.5)",
                },
              },
              label: {
                show: showLabel,
                formatter: (params: unknown) => {
                  const p = params as { name: string; value: number; percent: number };
                  return labelFormatter(p);
                },
              },
            },
          ],
        };

        chartInstanceRef.current.setOption(option, true);

        // Add click handler for drilldown
        if (hasDrilldown()) {
          chartInstanceRef.current.off("click");
          chartInstanceRef.current.on("click", (params: unknown) => {
            const p = params as { name: string };
            if (p.name) {
              handleDrilldownClick(p.name);
            }
          });
        }

        // Resize after setting option
        requestAnimationFrame(() => {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.resize({ width: "auto", height: "auto" });
          }
        });
      } catch (err) {
        console.error("Error updating pie chart:", err);
      }
    }, [data, meta, descriptor, hasDrilldown, handleDrilldownClick]);

    // Expose methods via ref
    React.useImperativeHandle(ref, () => ({
      getDropdownItems: () => null, // No visualization-specific dropdown items for pie
      prepareDataFetchSql: (sql: string, _pageNumber?: number) => sql,
    }));

    return (
      <CardContent className="px-0 p-0 h-full flex flex-col">
        <div
          ref={chartContainerRef}
          className="flex-1 w-full min-h-0"
          style={{
            height: descriptor.height ? `${descriptor.height}px` : "100%",
            width: "100%",
            minWidth: 0,
          }}
        />
      </CardContent>
    );
  }
);

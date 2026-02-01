"use client";

import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import * as echarts from "echarts";
import { CircleAlert, TrendingDown, TrendingUpIcon } from "lucide-react";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { classifyColumns, transformRowsToChartData } from "./dashboard-data-utils";
import { DRILLDOWN_DIALOG_CLASS_NAME } from "./dashboard-dialog-utils";
import { DashboardDropdownMenuItem } from "./dashboard-dropdown-menu-item";
import {
  applyReducer,
  type MinimapOption,
  type PanelDescriptor,
  type Reducer,
  type StatDescriptor,
  type TableDescriptor,
} from "./dashboard-model";
import type { VisualizationRef } from "./dashboard-visualization-layout";
import { DashboardVisualizationPanel } from "./dashboard-visualization-panel";
import type { TimeSpan } from "./timespan-selector";
import { useEcharts } from "./use-echarts";
import useIsDarkTheme from "./use-is-dark-theme";

// Safety scale used in the initial font size calculation.
const INITIAL_SAFETY_SCALE = 0.97;

// Safety scale used in the verification step if the text is still too large.
const VERIFY_SAFETY_SCALE = 0.98;

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

// Helper function to measure text dimensions at a given font size
const measureTextDimensions = (
  fontSize: string,
  textContent: string,
  textStyles: CSSStyleDeclaration
): { width: number; height: number } => {
  const element = createMeasurementElement(fontSize, textContent, textStyles);
  document.body.appendChild(element);
  void element.offsetWidth; // Force reflow
  const width = Math.max(element.scrollWidth, element.offsetWidth);
  const height = element.offsetHeight;
  document.body.removeChild(element);
  return { width, height };
};

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

const StatMinimap = React.memo<StatMinimapProps>(function StatMinimap({
  id,
  data,
  isLoading,
  option,
  onBrushChange,
}) {
  const hasData = data.length > 0;
  const { chartContainerRef, chartInstanceRef } = useEcharts({
    dependencies: [hasData],
  });
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

export interface StatVisualizationProps {
  data: Record<string, unknown>[];
  meta: Array<{ name: string; type?: string }>;
  secondaryData?: Record<string, unknown>[];
  descriptor: StatDescriptor;
  selectedTimeSpan?: TimeSpan;
  isLoading?: boolean;
  isSecondaryLoading?: boolean;
  secondaryError?: string;
}

export type StatVisualizationRef = VisualizationRef;

/**
 * Pure stat visualization component.
 * Receives data as props and handles only rendering and UI interactions.
 */
export const StatVisualization = forwardRef<StatVisualizationRef, StatVisualizationProps>(
  function StatVisualization(props, ref) {
    const {
      data: inputData,
      meta,
      secondaryData: inputSecondaryData,
      descriptor,
      selectedTimeSpan,
      isLoading,
      isSecondaryLoading = false,
      secondaryError = "",
    } = props;

    // State
    const [data, setData] = useState<string | number>(0);
    const [offsetData, setOffsetData] = useState<string | number>(0);
    const [minimapData, setMinimapData] = useState<MinimapDataPoint[]>([]);

    const valueTextRef = useRef<HTMLDivElement>(null);
    const valueContainerRef = useRef<HTMLDivElement>(null);
    const [fontSize, setFontSize] = useState(3);
    const fontSizeRef = useRef(3);

    // Helpers
    const shouldShowMinimap = useCallback((): boolean => {
      if (!descriptor.minimapOption || descriptor.minimapOption.type === "none") {
        return false;
      }
      return true;
    }, [descriptor]);

    const calculateReducedValue = useCallback(
      (data: MinimapDataPoint[], reducer: Reducer): number => {
        return applyReducer(
          data.map((d) => d.value),
          reducer
        );
      },
      []
    );

    const processData = useCallback(
      (
        rows: Record<string, unknown>[]
      ): { value: string | number; minimap: MinimapDataPoint[] } => {
        if (!rows || rows.length === 0) {
          return { value: 0, minimap: [] };
        }

        const showMinimap = shouldShowMinimap();

        if (showMinimap) {
          // Transform for minimap
          const transformedData = transformRowsToChartData(rows, meta);

          // Classify columns
          const allColumns =
            meta.length > 0 ? meta.map((m) => m.name) : Object.keys(transformedData[0] || {});

          const { timestampKey, metricColumns } = classifyColumns(
            allColumns,
            meta,
            transformedData
          );
          const valueColumn = metricColumns[0] || "value";

          // Build minimap data points
          const dataPoints: MinimapDataPoint[] = [];
          transformedData.forEach((row) => {
            const timestamp = row[timestampKey] as number;
            const value = row[valueColumn];

            if (timestamp && value !== null && value !== undefined) {
              let numValue: number;
              if (typeof value === "number") {
                numValue = value;
              } else if (typeof value === "string") {
                numValue = parseFloat(value);
                if (isNaN(numValue)) return;
              } else {
                return;
              }

              dataPoints.push({ timestamp, value: numValue });
            }
          });

          dataPoints.sort((a, b) => a.timestamp - b.timestamp);

          const reducer = descriptor.valueOption?.reducer || "avg";
          const reducedValue = calculateReducedValue(dataPoints, reducer);

          return { value: reducedValue, minimap: dataPoints };
        } else {
          // Scalar value
          if (rows.length > 0) {
            // Get first value from first row (assuming scalar query result)
            const firstRow = rows[0];
            const keys = Object.keys(firstRow);
            const values = Object.values(firstRow);
            if (values.length > 0) {
              const val = values[0];
              const key = keys[0];

              // Check if the column type is DateTime/Date
              const columnMeta = meta.find((m) => m.name === key);
              const isDateTimeType =
                columnMeta?.type &&
                (columnMeta.type.toLowerCase().includes("datetime") ||
                  columnMeta.type.toLowerCase().includes("date"));

              if (typeof val === "number") {
                return { value: val, minimap: [] };
              } else if (typeof val === "string") {
                // If it's a DateTime type, preserve the string
                if (isDateTimeType) {
                  return { value: val, minimap: [] };
                }
                // Try to parse as number, but preserve string if it's not a valid number
                const num = parseFloat(val);
                // Only convert to number if the entire string is a valid number
                // (parseFloat("2026-01-27 20:03:09") returns 2026, but we want to preserve the string)
                if (isNaN(num) || num.toString() !== val.trim()) {
                  return { value: val, minimap: [] };
                }
                return { value: num, minimap: [] };
              } else {
                // For other types, convert to string
                return { value: String(val), minimap: [] };
              }
            }
          }
          return { value: 0, minimap: [] };
        }
      },
      [meta, descriptor.valueOption, shouldShowMinimap, calculateReducedValue]
    );

    // Effect to process data
    useEffect(() => {
      const { value, minimap } = processData(inputData);
      setData(value);
      setMinimapData(minimap);
    }, [inputData, processData]);

    // Effect to process secondary data
    useEffect(() => {
      if (inputSecondaryData) {
        const { value } = processData(inputSecondaryData);
        setOffsetData(value);
      } else {
        setOffsetData(0);
      }
    }, [inputSecondaryData, processData]);

    // Auto-scale text
    useEffect(() => {
      const adjustFontSize = () => {
        if (!valueTextRef.current || !valueContainerRef.current) return;

        const container = valueContainerRef.current;
        const text = valueTextRef.current;
        const containerStyles = getComputedStyle(container);
        const textStyles = getComputedStyle(text);

        const paddingLeft = parseFloat(containerStyles.paddingLeft) || 0;
        const paddingRight = parseFloat(containerStyles.paddingRight) || 0;
        const containerWidth =
          container.clientWidth || container.offsetWidth - paddingLeft - paddingRight;
        const containerHeight = container.offsetHeight;

        if (containerWidth <= 0 || containerHeight <= 0) return;

        const textContent = text.textContent?.trim() || "";
        if (!textContent) return;

        const widthMargin = 16;
        const heightMargin = 4;
        const availableWidth = Math.max(0, containerWidth - widthMargin);
        const availableHeight = Math.max(0, containerHeight - heightMargin);

        const measureElement = createMeasurementElement("3rem", textContent, textStyles);
        document.body.appendChild(measureElement);
        void measureElement.offsetWidth;
        const naturalWidth = Math.max(measureElement.scrollWidth, measureElement.offsetWidth);
        const naturalHeight = measureElement.offsetHeight;
        document.body.removeChild(measureElement);

        if (naturalWidth <= availableWidth && naturalHeight <= availableHeight) {
          if (fontSizeRef.current !== 3) {
            setFontSize(3);
            fontSizeRef.current = 3;
          }
          return;
        }

        if (naturalWidth <= 0 || naturalHeight <= 0) return;

        const widthScale = availableWidth / naturalWidth;
        const heightScale = availableHeight / naturalHeight;
        const scale = Math.min(widthScale, heightScale, 1);

        const safetyScale = INITIAL_SAFETY_SCALE;
        let newFontSizeRem = Math.max(0.75, scale * 3 * safetyScale);

        const { width: verifiedWidth, height: verifiedHeight } = measureTextDimensions(
          `${newFontSizeRem}rem`,
          textContent,
          textStyles
        );

        if (verifiedWidth > availableWidth || verifiedHeight > availableHeight) {
          const widthScaleVerify =
            verifiedWidth > availableWidth ? availableWidth / verifiedWidth : 1;
          const heightScaleVerify =
            verifiedHeight > availableHeight ? availableHeight / verifiedHeight : 1;
          const additionalScale =
            Math.min(widthScaleVerify, heightScaleVerify) * VERIFY_SAFETY_SCALE;
          newFontSizeRem = Math.max(0.75, newFontSizeRem * additionalScale);
        }

        if (Math.abs(newFontSizeRem - fontSizeRef.current) > 0.05) {
          setFontSize(newFontSizeRem);
          fontSizeRef.current = newFontSizeRem;
        }
      };

      let pendingAdjustment = false;
      let rafId: number | null = null;
      const scheduleAdjustment = () => {
        if (pendingAdjustment) return;
        pendingAdjustment = true;
        rafId = requestAnimationFrame(() => {
          rafId = requestAnimationFrame(() => {
            adjustFontSize();
            pendingAdjustment = false;
          });
        });
      };

      scheduleAdjustment();

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
    }, [data]);

    // Drilldown Logic
    const hasMainDrilldown =
      descriptor.drilldown !== undefined && descriptor.drilldown.main !== undefined;

    const hasMinimapDrilldown =
      descriptor.drilldown !== undefined && descriptor.drilldown.minimap !== undefined;

    const handleDrilldownClick = useCallback(() => {
      const drilldownDescriptor = descriptor.drilldown?.main;
      if (!drilldownDescriptor) return;

      const modifiedDescriptor: PanelDescriptor = { ...drilldownDescriptor };

      if (modifiedDescriptor.titleOption) {
        modifiedDescriptor.titleOption = {
          ...modifiedDescriptor.titleOption,
          showTitle: false,
        };
      }
      modifiedDescriptor.collapsed = false;

      if (modifiedDescriptor.type === "table") {
        const tableDescriptor = modifiedDescriptor as TableDescriptor;
        tableDescriptor.headOption = {
          ...tableDescriptor.headOption,
          isSticky: true,
        };
        if (!tableDescriptor.height) {
          tableDescriptor.height = 70;
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

    const handleMinimapDrilldown = useCallback(
      (startTimestamp: number, endTimestamp: number) => {
        const drilldownDescriptor = descriptor.drilldown?.minimap;
        if (!drilldownDescriptor) return;

        const modifiedDescriptor: PanelDescriptor = { ...drilldownDescriptor };

        if (modifiedDescriptor.titleOption) {
          modifiedDescriptor.titleOption = {
            ...modifiedDescriptor.titleOption,
            showTitle: false,
          };
        }
        modifiedDescriptor.collapsed = false;

        if (modifiedDescriptor.type === "table") {
          const tableDescriptor = modifiedDescriptor as TableDescriptor;
          tableDescriptor.headOption = {
            ...tableDescriptor.headOption,
            isSticky: true,
          };
          if (!tableDescriptor.height) {
            tableDescriptor.height = 70;
          }
        }

        const selectedTimeSpan: TimeSpan = {
          startISO8601: DateTimeExtension.formatISO8601(new Date(startTimestamp)) || "",
          endISO8601: DateTimeExtension.formatISO8601(new Date(endTimestamp)) || "",
        };

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
      [descriptor.drilldown]
    );

    // Render comparison
    const renderComparison = () => {
      // Logic for determining if offset is used
      // Since secondaryData comes from DashboardVisualizationPanel which handles the query,
      // we just check if descriptor has comparisonOption.
      if (!descriptor.comparisonOption) {
        return null;
      }

      if (secondaryError) {
        return (
          <Button
            variant="link"
            size="sm"
            className="absolute right-2 top-2 text-xs flex items-center gap-1 hover:opacity-70 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <CircleAlert className="size-3 text-yellow-600" />
          </Button>
        );
      }

      if (isSecondaryLoading) {
        return (
          <div className="absolute right-4 top-4 text-xs flex items-center gap-1">
            <Skeleton className="h-3 w-8" />
          </div>
        );
      }

      // Only show comparison if both values are numbers
      if (typeof data !== "number" || typeof offsetData !== "number") {
        return null;
      }

      const delta = data - offsetData;
      const change =
        delta === 0 && offsetData === 0
          ? 0
          : (delta / (offsetData === 0 ? delta : offsetData)) * 100;

      return (
        <div
          className="absolute right-4 top-4 text-xs flex items-center gap-1"
          title={"Compared to data in the same period of " + descriptor.comparisonOption.offset}
        >
          {change >= 0 ? (
            <TrendingUpIcon className="size-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}%
        </div>
      );
    };

    // Helper for NumberFlow check
    const shouldUseNumberFlow = useCallback((): boolean => {
      return false; // Same as original
    }, []);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getDropdownItems: () => {
        return (
          <>
            {hasMainDrilldown && (
              <DashboardDropdownMenuItem onClick={handleDrilldownClick}>
                View details
              </DashboardDropdownMenuItem>
            )}
          </>
        );
      },
      prepareDataFetchSql: (sql: string, _pageNumber?: number) => sql,
    }));

    return (
      <div className="flex flex-col h-full w-full">
        <CardContent className={cn("py-0 px-0 relative flex-1 min-h-0")}>
          <CardTitle
            className={cn(
              descriptor.valueOption?.align
                ? "text-" + descriptor.valueOption.align
                : "text-center",
              "font-semibold h-full tabular-nums flex flex-col justify-center"
            )}
          >
            <div
              ref={valueContainerRef}
              className="h-full flex items-center justify-center overflow-hidden"
            >
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
                {shouldUseNumberFlow()
                  ? null
                  : descriptor.valueOption?.format // NumberFlow logic omitted/simplified as in original it returns false
                    ? Formatter.getInstance().getFormatter(descriptor.valueOption.format)(data)
                    : data}
              </div>
            </div>
          </CardTitle>

          {renderComparison()}
        </CardContent>

        {shouldShowMinimap() && (
          <CardFooter className="px-0 pb-1">
            <StatMinimap
              id={"stat"}
              data={minimapData}
              isLoading={isLoading ?? false}
              option={descriptor.minimapOption!}
              onBrushChange={hasMinimapDrilldown ? handleMinimapDrilldown : undefined}
            />
          </CardFooter>
        )}
      </div>
    );
  }
);

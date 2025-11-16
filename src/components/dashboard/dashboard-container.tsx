"use client";

import { connect } from "echarts";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import type {
  ChartDescriptor,
  GridPos,
  StatDescriptor,
  TableDescriptor,
  TimeseriesDescriptor,
  TransposeTableDescriptor,
} from "./chart-utils";
import { DashboardGroupSection } from "./dashboard-group-section";
import type { Dashboard, DashboardGroup } from "./dashboard-model";
import type { RefreshableComponent, RefreshParameter } from "./refreshable-component";
import RefreshableStatComponent from "./refreshable-stat-chart";
import RefreshableTableComponent from "./refreshable-table-component";
import RefreshableTimeseriesChart from "./refreshable-timeseries-chart";
import RefreshableTransposedTableComponent from "./refreshable-transposed-table-component";
import type { TimeSpan } from "./timespan-selector";
import TimeSpanSelector, { BUILT_IN_TIME_SPAN_LIST } from "./timespan-selector";

export interface DashboardContainerRef {
  refresh: (timeSpan?: TimeSpan) => void;
}

interface DashboardViewProps {
  dashboard: Dashboard;
  searchParams?: Record<string, unknown> | URLSearchParams;
  headerActions?: React.ReactNode;
  hideTimeSpanSelector?: boolean;
  externalTimeSpan?: TimeSpan;

  children?: React.ReactNode;
}

// Helper function to check if an item is a DashboardGroup
function isDashboardGroup(item: unknown): item is DashboardGroup {
  return (
    typeof item === "object" &&
    item !== null &&
    "title" in item &&
    "charts" in item &&
    Array.isArray((item as { charts: unknown }).charts)
  );
}

// Helper function to flatten all charts from dashboard (including charts in groups)
function getAllCharts(dashboard: Dashboard): ChartDescriptor[] {
  const allCharts: ChartDescriptor[] = [];
  dashboard.charts.forEach((item) => {
    if (isDashboardGroup(item)) {
      allCharts.push(...item.charts);
    } else {
      allCharts.push(item);
    }
  });
  return allCharts;
}

// Helper function to get default height based on chart type
function getDefaultHeight(chart: ChartDescriptor): number {
  if (chart.type === "table" || chart.type === "transpose-table") {
    return 6; // Tables need more height
  }
  if (chart.type === "stat") {
    return 2; // Stats are compact
  }
  return 4; // Default for charts (line, bar, area, etc.)
}

// Helper function to get gridPos from chart, with fallback to width-based system
function getGridPos(chart: ChartDescriptor): GridPos {
  // If gridPos exists, use it
  if (chart.gridPos) {
    return chart.gridPos;
  }

  // Fallback: create gridPos from width (for backward compatibility)
  // Clamp width to valid range (1-24)
  const rawWidth = chart.width ?? 24;
  const width = Math.max(1, Math.min(24, rawWidth));
  const height = getDefaultHeight(chart);
  return {
    w: width,
    h: height,
    // x and y are undefined for auto-positioning
  };
}

// Helper function to calculate auto-positioning for charts without x, y
// Uses a simple row-based algorithm: place items left-to-right, top-to-bottom
function calculateAutoPositions(
  charts: ChartDescriptor[],
  startY: number = 0
): Array<{ chart: ChartDescriptor; gridPos: GridPos; y: number }> {
  const result: Array<{ chart: ChartDescriptor; gridPos: GridPos; y: number }> = [];
  let currentY = startY;
  let currentX = 0;

  for (const chart of charts) {
    const gridPos = getGridPos(chart);
    const w = gridPos.w;
    const h = gridPos.h;

    // If manual positioning is specified, use it
    if (gridPos.x !== undefined && gridPos.y !== undefined) {
      result.push({ chart, gridPos, y: gridPos.y });
      // Update currentY to be after this manually positioned item
      currentY = Math.max(currentY, gridPos.y + h);
      currentX = 0; // Reset X for next auto-positioned item
      continue;
    }

    // Auto-positioning: check if item fits on current row
    if (currentX + w > 24) {
      // Move to next row - find the tallest item in current row
      const currentRowItems = result.filter((r) => r.y === currentY);
      const maxHeightInRow = currentRowItems.length > 0
        ? Math.max(...currentRowItems.map((r) => getGridPos(r.chart).h))
        : 1;
      currentY += maxHeightInRow;
      currentX = 0;
    }

    // Place item at current position
    result.push({
      chart,
      gridPos: {
        ...gridPos,
        x: currentX,
        y: currentY,
      },
      y: currentY,
    });

    // Move X position for next item
    currentX += w;
  }

  return result;
}

// Helper function to render chart component (extracted for reuse)
function renderChartComponent(
  chart: ChartDescriptor,
  index: number,
  onSubComponentUpdated: (subComponent: RefreshableComponent | null, index: number) => void,
  getCurrentTimeSpan: () => TimeSpan,
  inputFilter?: string,
  searchParams?: URLSearchParams
): React.ReactNode {
  if (chart.type === "line" || chart.type === "bar" || chart.type === "area") {
    return (
      <RefreshableTimeseriesChart
        ref={(el) => {
          onSubComponentUpdated(el, index);
        }}
        descriptor={chart as TimeseriesDescriptor}
        selectedTimeSpan={getCurrentTimeSpan()}
        inputFilter={inputFilter}
        searchParams={searchParams}
      />
    );
  }
  if (chart.type === "stat") {
    return (
      <RefreshableStatComponent
        ref={(el) => {
          onSubComponentUpdated(el, index);
        }}
        descriptor={chart as StatDescriptor}
        selectedTimeSpan={getCurrentTimeSpan()}
        searchParams={searchParams}
      />
    );
  }
  if (chart.type === "table") {
    return (
      <RefreshableTableComponent
        ref={(el) => {
          onSubComponentUpdated(el, index);
        }}
        descriptor={chart as TableDescriptor}
        selectedTimeSpan={getCurrentTimeSpan()}
        searchParams={searchParams}
      />
    );
  }
  if (chart.type === "transpose-table") {
    return (
      <RefreshableTransposedTableComponent
        ref={(el) => {
          onSubComponentUpdated(el, index);
        }}
        descriptor={chart as TransposeTableDescriptor}
        selectedTimeSpan={getCurrentTimeSpan()}
        searchParams={searchParams}
      />
    );
  }
  return null;
}

// Helper function to upgrade dashboard versions
// Version 1: 4-column system (width: 1-4)
// Version 2: 24-column system (width: 1-24)
// Version 3: gridPos system (gridPos with optional x, y, required w, h)
function upgradeDashboard(dashboard: Dashboard): Dashboard {
  const version = dashboard.version ?? 1;

  // If already version 3 or higher, return as-is
  if (version >= 3) {
    return dashboard;
  }

  // Upgrade from version 2 to version 3 (convert width to gridPos)
  if (version === 2) {
    const upgradedCharts = dashboard.charts.map((item) => {
      if (isDashboardGroup(item)) {
        // Upgrade charts within groups
        const upgradedGroupCharts = item.charts.map((chart: ChartDescriptor) => {
          // Ensure we have a chart descriptor with width property
          const chartWithWidth = chart as ChartDescriptor & { width?: number };
          const defaultHeight = getDefaultHeight(chart);
          // For version 2, width should be 1-24, clamp to valid range
          const rawWidth = chartWithWidth.width ?? 24;
          const chartWidth = Math.max(1, Math.min(24, rawWidth));
          
          // Only add gridPos if it doesn't already exist
          if (chart.gridPos) {
            return chart;
          }
          
          return {
            ...chart,
            gridPos: {
              w: chartWidth, // Use existing width from version 2 (clamped to 1-24)
              h: defaultHeight,
              // x and y are optional - will use auto-positioning
            },
            // Keep width for backward compatibility but gridPos takes precedence
          };
        });
        return {
          ...item,
          charts: upgradedGroupCharts,
        };
      } else {
        // Upgrade standalone charts
        const chart = item as ChartDescriptor & { width?: number };
        const defaultHeight = getDefaultHeight(chart);
        // For version 2, width should be 1-24, clamp to valid range
        const rawWidth = chart.width ?? 24;
        const chartWidth = Math.max(1, Math.min(24, rawWidth));
        
        // Only add gridPos if it doesn't already exist
        if (chart.gridPos) {
          return chart;
        }
        
        return {
          ...chart,
          gridPos: {
            w: chartWidth, // Use existing width from version 2 (clamped to 1-24)
            h: defaultHeight,
            // x and y are optional - will use auto-positioning
          },
          // Keep width for backward compatibility but gridPos takes precedence
        };
      }
    });

    return {
      ...dashboard,
      version: 3,
      charts: upgradedCharts,
    };
  }

  // Upgrade from version 1 to version 2, then to version 3
  if (version === 1) {
    // First upgrade to version 2
    const v2Charts = dashboard.charts.map((item) => {
      if (isDashboardGroup(item)) {
        const upgradedGroupCharts = item.charts.map((chart: ChartDescriptor) => {
          const chartWidth = chart.width ?? 1; // Default to 1 if width is missing
          return {
            ...chart,
            width: chartWidth * 6, // Multiply by 6 to convert from 4-column to 24-column
          };
        });
        return {
          ...item,
          charts: upgradedGroupCharts,
        };
      } else {
        const chart = item as ChartDescriptor;
        const chartWidth = chart.width ?? 1; // Default to 1 if width is missing
        return {
          ...chart,
          width: chartWidth * 6, // Multiply by 6 to convert from 4-column to 24-column
        };
      }
    });

    // Then upgrade to version 3
    const upgradedCharts = v2Charts.map((item) => {
      if (isDashboardGroup(item)) {
        const upgradedGroupCharts = item.charts.map((chart: ChartDescriptor) => {
          const defaultHeight = getDefaultHeight(chart);
          const chartWidth = chart.width ?? 24;
          return {
            ...chart,
            gridPos: {
              w: chartWidth,
              h: defaultHeight,
            },
          };
        });
        return {
          ...item,
          charts: upgradedGroupCharts,
        };
      } else {
        const chart = item as ChartDescriptor;
        const defaultHeight = getDefaultHeight(chart);
        const chartWidth = chart.width ?? 24;
        return {
          ...chart,
          gridPos: {
            w: chartWidth,
            h: defaultHeight,
          },
        };
      }
    });

    return {
      ...dashboard,
      version: 3,
      charts: upgradedCharts,
    };
  }

  // For any other version, return as-is (future-proofing)
  return dashboard;
}

const DashboardContainer = forwardRef<DashboardContainerRef, DashboardViewProps>(
  ({ dashboard, searchParams = {}, headerActions, hideTimeSpanSelector = false, externalTimeSpan, children }, ref) => {
    const inputFilterRef = useRef<HTMLInputElement>(undefined);
    const subComponentRefs = useRef<(RefreshableComponent | null)[]>([]);
    const filterRef = useRef<TimeSpanSelector | null>(null);

    // Upgrade dashboard version if needed (version 1 -> version 2)
    const upgradedDashboard : Dashboard = useMemo(() => upgradeDashboard(dashboard), [dashboard]);

    // Function to connect all chart instances together
    const connectAllCharts = useCallback(() => {
      const chartInstances: echarts.ECharts[] = subComponentRefs.current
        .filter(
          (ref): ref is RefreshableComponent =>
            ref !== null &&
            typeof (ref as unknown as { getEChartInstance?: () => echarts.ECharts }).getEChartInstance === "function"
        )
        .map((ref) => {
          const component = ref as unknown as { getEChartInstance: () => echarts.ECharts };
          return component.getEChartInstance();
        })
        .filter((echartInstance) => echartInstance !== undefined);

      if (chartInstances.length === 0) {
        return;
      }

      const allCharts = getAllCharts(upgradedDashboard);
      const chartNumber = allCharts.filter((chart: ChartDescriptor) => chart.type !== "table").length;
      if (chartInstances.length === chartNumber) {
        // Connect all echarts together on this page
        connect(chartInstances);
      }
    }, [upgradedDashboard]);

    // Callback when the sub component is mounted or unmounted
    // Charts are now responsible for their own initial loading via props
    const onSubComponentUpdated = useCallback(
      (subComponent: RefreshableComponent | null, index: number) => {
        subComponentRefs.current[index] = subComponent;
        connectAllCharts();
      },
      [connectAllCharts]
    );

    const refreshAllCharts = useCallback(
      (overrideTimeSpan?: TimeSpan) => {
        let timeSpan: TimeSpan | undefined;

        // Use override time span if provided, otherwise use external or filter ref
        if (overrideTimeSpan) {
          timeSpan = overrideTimeSpan;
        } else if (hideTimeSpanSelector && externalTimeSpan) {
          timeSpan = externalTimeSpan;
        } else if (filterRef.current) {
          timeSpan = filterRef.current.getSelectedTimeSpan()?.calculateAbsoluteTimeSpan();
        }

        // Always include inputFilter to force refresh even when timeSpan hasn't changed
        // This ensures that clicking refresh button multiple times with the same timeSpan will still trigger refresh
        const refreshParam: RefreshParameter = timeSpan
          ? { selectedTimeSpan: timeSpan, inputFilter: `refresh_${Date.now()}` }
          : { inputFilter: `refresh_${Date.now()}` };

        subComponentRefs.current.forEach((chart) => {
          if (chart !== null) {
            chart.refresh(refreshParam);
          }
        });
      },
      [hideTimeSpanSelector, externalTimeSpan]
    );

    // Expose refresh method via imperative handle
    useImperativeHandle(
      ref,
      () => ({
        refresh: (timeSpan?: TimeSpan) => {
          refreshAllCharts(timeSpan);
        },
      }),
      [refreshAllCharts]
    );

    const onQueryConditionChange = useCallback(() => {
      // Start a timer to refresh all charts so that the refresh does not block any UI updates
      setTimeout(() => {
        refreshAllCharts();
      }, 10);
    }, [refreshAllCharts]);

    // Provide a default DisplayTimeSpan instance if not provided or if it's not an instance
    const defaultTimeSpan = useMemo(() => {
      // Otherwise, use the default "Last 15 Mins"
      return BUILT_IN_TIME_SPAN_LIST[3];
    }, []);

    // Get the current selected time span with fallback to default
    // This ensures charts always get a valid time span, even when filterRef is not ready yet
    const getCurrentTimeSpan = useCallback(() => {
      // Use external time span if provided and time span selector is hidden
      if (hideTimeSpanSelector && externalTimeSpan) {
        return externalTimeSpan;
      }
      if (filterRef.current) {
        return filterRef.current.getSelectedTimeSpan()?.calculateAbsoluteTimeSpan();
      }
      // Fallback to default time span when filterRef is not ready
      // This allows charts to trigger their initial load immediately
      return defaultTimeSpan.calculateAbsoluteTimeSpan();
    }, [defaultTimeSpan, hideTimeSpanSelector, externalTimeSpan]);

    // No initial refresh here; each component handles its own initial refresh via useRefreshable
    // Charts will get the default time span initially, then refresh when TimeSpanSelector
    // triggers onSelectedSpanChanged (which happens on mount via componentDidUpdate)

    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Time span selector and header actions - fixed at top */}
        {(headerActions || !hideTimeSpanSelector) && (
          <div className="flex-shrink-0 flex justify-end items-center gap-2 pt-2 pb-2">
            {headerActions}
            {!hideTimeSpanSelector && (
              <TimeSpanSelector
                ref={filterRef}
                size="sm"
                defaultTimeSpan={defaultTimeSpan}
                onSelectedSpanChanged={onQueryConditionChange}
              />
            )}
          </div>
        )}

        {/* Dashboard section - scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {upgradedDashboard &&
            upgradedDashboard.charts &&
            (() => {
              const dashboardVersion = upgradedDashboard.version ?? 1;
              const useGridLayout = dashboardVersion >= 3;

              // For version 3+, use CSS Grid layout
              if (useGridLayout) {
                // Flatten all charts (including groups) for grid layout
                const allChartsWithPositions: Array<{
                  chart: ChartDescriptor;
                  gridPos: GridPos;
                  y: number;
                  isInGroup: boolean;
                  groupTitle?: string;
                  groupIndex?: number;
                }> = [];

                let currentY = 0;
                let groupIndex = 0;

                // Process items and store processed data by original index
                // Map from original chart index to processed data
                const processedItems = new Map<
                  number,
                  | {
                      type: "standalone";
                      charts: Array<{
                        chart: ChartDescriptor;
                        gridPos: GridPos;
                        y: number;
                      }>;
                    }
                  | {
                      type: "group";
                      groupIndex: number;
                      group: DashboardGroup;
                      charts: Array<{
                        chart: ChartDescriptor;
                        gridPos: GridPos;
                        y: number;
                      }>;
                    }
                >();

                // Collect consecutive standalone charts to position them together
                let consecutiveStandaloneCharts: ChartDescriptor[] = [];
                let standaloneStartIndex = -1;

                const processStandaloneCharts = (charts: ChartDescriptor[], startIndex: number) => {
                  if (charts.length > 0) {
                    const positionedCharts = calculateAutoPositions(charts, currentY);
                    const batch: Array<{
                      chart: ChartDescriptor;
                      gridPos: GridPos;
                      y: number;
                    }> = [];
                    positionedCharts.forEach(({ chart, gridPos, y }) => {
                      allChartsWithPositions.push({
                        chart,
                        gridPos,
                        y,
                        isInGroup: false,
                      });
                      batch.push({ chart, gridPos, y });
                    });
                    processedItems.set(startIndex, { type: "standalone", charts: batch });
                    // Update currentY to be after the tallest item in this batch
                    const maxY = Math.max(...positionedCharts.map((pc) => pc.y + getGridPos(pc.chart).h), currentY);
                    currentY = maxY + 1; // Add spacing
                  }
                };

                upgradedDashboard.charts.forEach((item, index) => {
                  if (isDashboardGroup(item)) {
                    // Process any accumulated standalone charts before this group
                    if (consecutiveStandaloneCharts.length > 0) {
                      processStandaloneCharts(consecutiveStandaloneCharts, standaloneStartIndex);
                      consecutiveStandaloneCharts = [];
                      standaloneStartIndex = -1;
                    }

                    const group = item;
                    // Calculate positions for charts in this group
                    const groupCharts = calculateAutoPositions(group.charts, currentY);
                    const batch: Array<{
                      chart: ChartDescriptor;
                      gridPos: GridPos;
                      y: number;
                    }> = [];
                    groupCharts.forEach(({ chart, gridPos, y }) => {
                      allChartsWithPositions.push({
                        chart,
                        gridPos,
                        y,
                        isInGroup: true,
                        groupTitle: group.title,
                        groupIndex,
                      });
                      batch.push({ chart, gridPos, y });
                    });
                    processedItems.set(index, {
                      type: "group",
                      groupIndex,
                      group,
                      charts: batch,
                    });
                    // Update currentY to be after the tallest item in this group
                    const maxY = Math.max(...groupCharts.map((gc) => gc.y + getGridPos(gc.chart).h), currentY);
                    currentY = maxY + 1; // Add spacing between groups
                    groupIndex++;
                  } else {
                    // Collect consecutive standalone charts to position them together
                    if (consecutiveStandaloneCharts.length === 0) {
                      standaloneStartIndex = index;
                    }
                    consecutiveStandaloneCharts.push(item as ChartDescriptor);
                  }
                });

                // Process any remaining standalone charts at the end
                if (consecutiveStandaloneCharts.length > 0) {
                  processStandaloneCharts(consecutiveStandaloneCharts, standaloneStartIndex);
                }

                return (
                  <div className="space-y-2">
                    {/* Render items directly from upgradedDashboard.charts in order */}
                    {upgradedDashboard.charts.map((_item, index) => {
                      const processed = processedItems.get(index);
                      if (!processed) return null;

                      if (processed.type === "standalone") {
                        const { charts } = processed;
                        if (charts.length === 0) return null;

                        // Calculate min and max Y for this batch
                        const minY = Math.min(...charts.map((b) => b.y));
                        const maxYInBatch = Math.max(...charts.map((b) => b.y + b.gridPos.h)) - minY;

                        return (
                          <div
                            key={`standalone-${index}`}
                            className="grid gap-x-2 gap-y-2"
                            style={{
                              gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
                              gridAutoRows: "minmax(88px, auto)",
                              minHeight: `${Math.max(maxYInBatch, 1) * 88 + (Math.max(maxYInBatch, 1) - 1) * 4}px`,
                            }}
                          >
                            {charts.map(({ chart, gridPos }, batchIndex) => {
                              const gridStyle: React.CSSProperties = {};

                              // Make Y position relative to this batch
                              const relativeY = gridPos.y !== undefined ? gridPos.y - minY + 1 : undefined;

                              // Set grid column span and start position
                              if (gridPos.x !== undefined) {
                                gridStyle.gridColumnStart = gridPos.x + 1;
                                gridStyle.gridColumnEnd = gridPos.x + 1 + gridPos.w;
                              } else {
                                gridStyle.gridColumn = `span ${gridPos.w}`;
                              }

                              // Set grid row span and start position
                              if (relativeY !== undefined) {
                                gridStyle.gridRowStart = relativeY;
                                gridStyle.gridRowEnd = relativeY + gridPos.h;
                              } else {
                                gridStyle.gridRow = `span ${gridPos.h}`;
                              }

                              return (
                                <div key={`chart-${batchIndex}`} style={gridStyle} className="w-full">
                                  {renderChartComponent(
                                    chart,
                                    batchIndex,
                                    onSubComponentUpdated,
                                    getCurrentTimeSpan,
                                    inputFilterRef.current?.value,
                                    searchParams instanceof URLSearchParams ? searchParams : undefined
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      } else {
                        // Render group
                        const { group, charts: groupCharts } = processed;
                        if (groupCharts.length === 0) return null;

                        // Calculate grid positions for this group - use relative Y positions within the group
                        const minYInGroup = Math.min(...groupCharts.map((gc) => gc.y));
                        const groupMaxY = Math.max(...groupCharts.map((gc) => gc.y + gc.gridPos.h)) - minYInGroup;

                        return (
                          <DashboardGroupSection
                            key={`group-${index}`}
                            title={group.title}
                            defaultOpen={!group.collapsed}
                          >
                            <div
                              className="grid gap-x-2 gap-y-2"
                              style={{
                                gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
                                gridAutoRows: "minmax(88px, auto)",
                                minHeight: `${Math.max(groupMaxY, 1) * 88 + (Math.max(groupMaxY, 1) - 1) * 4}px`,
                              }}
                            >
                              {groupCharts.map(({ chart, gridPos }, chartIndex) => {
                                // Make Y position relative to the group (CSS Grid is 1-indexed)
                                const relativeY = gridPos.y !== undefined ? gridPos.y - minYInGroup + 1 : undefined;
                                const relativeX = gridPos.x !== undefined ? gridPos.x + 1 : undefined;

                                const gridStyle: React.CSSProperties = {};

                                // Set grid column span and start position
                                if (relativeX !== undefined) {
                                  // Explicit positioning: set both start and span
                                  gridStyle.gridColumnStart = relativeX;
                                  gridStyle.gridColumnEnd = relativeX + gridPos.w;
                                } else {
                                  // Auto-positioning: just set span
                                  gridStyle.gridColumn = `span ${gridPos.w}`;
                                }

                                // Set grid row span and start position
                                if (relativeY !== undefined) {
                                  // Explicit positioning: set both start and span
                                  gridStyle.gridRowStart = relativeY;
                                  gridStyle.gridRowEnd = relativeY + gridPos.h;
                                } else {
                                  // Auto-positioning: just set span
                                  gridStyle.gridRow = `span ${gridPos.h}`;
                                }

                                return (
                                  <div key={`chart-${chartIndex}`} style={gridStyle} className="w-full">
                                    {renderChartComponent(
                                      chart,
                                      chartIndex,
                                      onSubComponentUpdated,
                                      getCurrentTimeSpan,
                                      inputFilterRef.current?.value,
                                      searchParams instanceof URLSearchParams ? searchParams : undefined
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </DashboardGroupSection>
                        );
                      }
                    })}

                    {children}
                  </div>
                );
              }

              // For version 1-2, use legacy flexbox layout
              let globalChartIndex = 0;

              // Group consecutive non-grouped charts together
              const renderItems: Array<{
                type: "group" | "charts";
                data: DashboardGroup | ChartDescriptor[];
                index: number;
              }> = [];
              let currentCharts: ChartDescriptor[] = [];
              let currentChartsStartIndex = -1;

              upgradedDashboard.charts.forEach((item, itemIndex) => {
                if (isDashboardGroup(item)) {
                  // If we have collected charts, add them as a group
                  if (currentCharts.length > 0) {
                    renderItems.push({
                      type: "charts",
                      data: currentCharts,
                      index: currentChartsStartIndex,
                    });
                    currentCharts = [];
                    currentChartsStartIndex = -1;
                  }
                  // Add the group
                  renderItems.push({
                    type: "group",
                    data: item,
                    index: itemIndex,
                  });
                } else {
                  // Collect consecutive charts
                  if (currentCharts.length === 0) {
                    currentChartsStartIndex = itemIndex;
                  }
                  currentCharts.push(item as ChartDescriptor);
                }
              });

              // Add any remaining collected charts
              if (currentCharts.length > 0) {
                renderItems.push({
                  type: "charts",
                  data: currentCharts,
                  index: currentChartsStartIndex,
                });
              }

              return (
                <div className="space-y-2">
                  {renderItems.map((renderItem) => {
                    if (renderItem.type === "group") {
                      // Render as a collapsible group
                      const group = renderItem.data as DashboardGroup;
                      const groupStartIndex = globalChartIndex;
                      return (
                        <DashboardGroupSection
                          key={`group-${renderItem.index}`}
                          title={group.title}
                          defaultOpen={!group.collapsed}
                        >
                          <div className="card-container flex flex-wrap gap-x-1 gap-y-2">
                            {group.charts.map((chart: ChartDescriptor, chartIndex) => {
                              const currentIndex = groupStartIndex + chartIndex;
                              globalChartIndex++;
                              // Calculate width accounting for gaps
                              // For 24 columns with 23 gaps of 0.25rem each, we need to account for the gap space
                              // Formula: calc(percentage - (number_of_gaps * gap_size) / number_of_items)
                              // For width=6 (25%): calc(25% - 5.75rem / 24) = calc(25% - 0.2396rem)
                              const widthPercent = (chart.width ?? 24) >= 24 ? 100 : ((chart.width ?? 24) / 24) * 100;
                              // For a row of 24 charts, there are 23 gaps. Each chart accounts for its share of gap space
                              // Number of gaps in a full row = 23, so each chart accounts for 23/24 of a gap
                              const gapAdjustment = (chart.width ?? 24) >= 24 ? 0 : (23 * 0.25) / 24; // ~0.2396rem per chart
                              const widthStyle =
                                (chart.width ?? 24) >= 24 ? "100%" : `calc(${widthPercent}% - ${gapAdjustment}rem)`;
                              return (
                                <div
                                  key={`chart-${chartIndex}`}
                                  style={{
                                    width: widthStyle,
                                  }}
                                >
                                  {renderChartComponent(chart, currentIndex, onSubComponentUpdated, getCurrentTimeSpan)}
                                </div>
                              );
                            })}
                          </div>
                        </DashboardGroupSection>
                      );
                    } else {
                      // Render consecutive charts in a flex-wrap container
                      const charts = renderItem.data as ChartDescriptor[];
                      return (
                        <div
                          key={`charts-${renderItem.index}`}
                          className="card-container flex flex-wrap gap-x-1 gap-y-2"
                        >
                          {charts.map((chart: ChartDescriptor, chartIndex) => {
                            const currentIndex = globalChartIndex++;
                            // Calculate width accounting for gaps (same logic as groups)
                            // For 24 columns with 23 gaps of 0.25rem each
                            const widthPercent = (chart.width ?? 24) >= 24 ? 100 : ((chart.width ?? 24) / 24) * 100;
                            const gapAdjustment = (chart.width ?? 24) >= 24 ? 0 : (23 * 0.25) / 24; // ~0.2396rem per chart
                            const widthStyle =
                              (chart.width ?? 24) >= 24 ? "100%" : `calc(${widthPercent}% - ${gapAdjustment}rem)`;
                            return (
                              <div
                                key={`chart-${chartIndex}`}
                                style={{
                                  width: widthStyle,
                                }}
                              >
                                {renderChartComponent(chart, currentIndex, onSubComponentUpdated, getCurrentTimeSpan)}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                  })}
                  {children}
                </div>
              );
            })()}

          <div className="h-[100px]">{/* Margin for scroll */}</div>
        </div>
      </div>
    );
  }
);

DashboardContainer.displayName = "DashboardView";

export default DashboardContainer;

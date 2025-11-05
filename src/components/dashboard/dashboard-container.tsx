"use client";

import { connect } from "echarts";
import { useCallback, useMemo, useRef } from "react";
import type { ChartDescriptor, StatDescriptor, TimeseriesDescriptor } from "./chart-utils";
import { DashboardGroupSection } from "./dashboard-group-section";
import type { Dashboard, DashboardGroup } from "./dashboard-model";
import type { RefreshableComponent, RefreshParameter } from "./refreshable-component";
import RefreshableStatComponent from "./refreshable-stat-chart";

import RefreshableTimeseriesChart from "./refreshable-timeseries-chart";
import TimeSpanSelector, { BUILT_IN_TIME_SPAN_LIST } from "./timespan-selector";

interface DashboardViewProps {
  dashboard: Dashboard;
  searchParams?: Record<string, unknown> | URLSearchParams;
  headerActions?: React.ReactNode;

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

const DashboardView: React.FC<DashboardViewProps> = ({ dashboard, searchParams = {}, headerActions, children }) => {
  const inputFilterRef = useRef<HTMLInputElement>(undefined);
  const subComponentRefs = useRef<(RefreshableComponent | null)[]>([]);
  const filterRef = useRef<TimeSpanSelector | null>(null);

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

    const allCharts = getAllCharts(dashboard);
    const chartNumber = allCharts.filter((chart: ChartDescriptor) => chart.type !== "table").length;
    if (chartInstances.length === chartNumber) {
      // Connect all echarts together on this page
      connect(chartInstances);
    }
  }, [dashboard]);

  // Callback when the sub component is mounted or unmounted
  // Charts are now responsible for their own initial loading via props
  const onSubComponentUpdated = useCallback(
    (subComponent: RefreshableComponent | null, index: number) => {
      subComponentRefs.current[index] = subComponent;
      connectAllCharts();
    },
    [connectAllCharts]
  );

  const refreshAllCharts = useCallback(() => {
    if (!filterRef.current) {
      return;
    }

    console.trace("Refreshing all charts/tables...");
    const refreshParam = {
      selectedTimeSpan: filterRef.current.getSelectedTimeSpan().calculateAbsoluteTimeSpan(),
    } as RefreshParameter;
    filterRef.current.getSelectedTimeSpan();
    subComponentRefs.current.forEach((chart) => {
      if (chart !== null) {
        chart.refresh(refreshParam);
      }
    });
  }, []);

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
    if (filterRef.current) {
      return filterRef.current.getSelectedTimeSpan()?.calculateAbsoluteTimeSpan();
    }
    // Fallback to default time span when filterRef is not ready
    // This allows charts to trigger their initial load immediately
    return defaultTimeSpan.calculateAbsoluteTimeSpan();
  }, [defaultTimeSpan]);

  // No initial refresh here; each component handles its own initial refresh via useRefreshable
  // Charts will get the default time span initially, then refresh when TimeSpanSelector
  // triggers onSelectedSpanChanged (which happens on mount via componentDidUpdate)

  console.log("Rendering dashboard", dashboard?.name);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Time span selector and header actions - fixed at top */}
      <div className="flex-shrink-0 flex justify-end items-center gap-2 pt-2 px-2">
        {headerActions}
        <TimeSpanSelector
          ref={filterRef}
          defaultTimeSpan={defaultTimeSpan}
          onSelectedSpanChanged={onQueryConditionChange}
        />
      </div>

      {/* Dashboard section - scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2 px-2">
        {dashboard &&
          dashboard.charts &&
          (() => {
            let globalChartIndex = 0;

            // Group consecutive non-grouped charts together
            const renderItems: Array<{
              type: "group" | "charts";
              data: DashboardGroup | ChartDescriptor[];
              index: number;
            }> = [];
            let currentCharts: ChartDescriptor[] = [];
            let currentChartsStartIndex = -1;

            dashboard.charts.forEach((item, itemIndex) => {
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
                        <div className="card-container flex flex-wrap gap-1">
                          {group.charts.map((chart: ChartDescriptor, chartIndex) => {
                            const currentIndex = groupStartIndex + chartIndex;
                            globalChartIndex++;
                            // Calculate width accounting for gaps
                            // For 4 columns with 3 gaps of 0.25rem each, we need to account for the gap space
                            // Formula: calc(percentage - (number_of_gaps * gap_size) / number_of_items)
                            // For width=1 (25%): calc(25% - 0.75rem / 4) = calc(25% - 0.1875rem)
                            const widthPercent = chart.width >= 4 ? 100 : (chart.width / 4) * 100;
                            // For a row of 4 charts, there are 3 gaps. Each chart should account for its share of gap space
                            // Number of gaps in a full row = 3, so each chart accounts for 3/4 = 0.75 of a gap
                            const gapAdjustment = chart.width >= 4 ? 0 : (3 * 0.25) / 4; // 0.1875rem per chart
                            const widthStyle =
                              chart.width >= 4 ? "100%" : `calc(${widthPercent}% - ${gapAdjustment}rem)`;
                            return (
                              <div
                                key={`chart-${chartIndex}`}
                                style={{
                                  width: widthStyle,
                                }}
                              >
                                {(chart.type === "line" || chart.type === "bar" || chart.type === "area") && (
                                  <RefreshableTimeseriesChart
                                    ref={(el) => {
                                      onSubComponentUpdated(el, currentIndex);
                                    }}
                                    descriptor={chart as TimeseriesDescriptor}
                                    selectedTimeSpan={getCurrentTimeSpan()}
                                    inputFilter={inputFilterRef.current?.value}
                                    searchParams={searchParams instanceof URLSearchParams ? searchParams : undefined}
                                  />
                                )}
                                {chart.type === "stat" && (
                                  <RefreshableStatComponent
                                    ref={(el) => {
                                      onSubComponentUpdated(el, currentIndex);
                                    }}
                                    descriptor={chart as StatDescriptor}
                                    selectedTimeSpan={getCurrentTimeSpan()}
                                    searchParams={searchParams instanceof URLSearchParams ? searchParams : undefined}
                                  />
                                )}
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
                      <div key={`charts-${renderItem.index}`} className="card-container flex flex-wrap gap-1">
                        {charts.map((chart: ChartDescriptor, chartIndex) => {
                          const currentIndex = globalChartIndex++;
                          // Calculate width accounting for gaps (same logic as groups)
                          const widthPercent = chart.width >= 4 ? 100 : (chart.width / 4) * 100;
                          const gapAdjustment = chart.width >= 4 ? 0 : (3 * 0.25) / 4; // 0.1875rem per chart
                          const widthStyle = chart.width >= 4 ? "100%" : `calc(${widthPercent}% - ${gapAdjustment}rem)`;
                          return (
                            <div
                              key={`chart-${chartIndex}`}
                              style={{
                                width: widthStyle,
                              }}
                            >
                              {(chart.type === "line" || chart.type === "bar" || chart.type === "area") && (
                                <RefreshableTimeseriesChart
                                  ref={(el) => {
                                    onSubComponentUpdated(el, currentIndex);
                                  }}
                                  descriptor={chart as TimeseriesDescriptor}
                                  selectedTimeSpan={getCurrentTimeSpan()}
                                  inputFilter={inputFilterRef.current?.value}
                                  searchParams={searchParams instanceof URLSearchParams ? searchParams : undefined}
                                />
                              )}
                              {chart.type === "stat" && (
                                <RefreshableStatComponent
                                  ref={(el) => {
                                    onSubComponentUpdated(el, currentIndex);
                                  }}
                                  descriptor={chart as StatDescriptor}
                                  selectedTimeSpan={getCurrentTimeSpan()}
                                  searchParams={searchParams instanceof URLSearchParams ? searchParams : undefined}
                                />
                              )}
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
};

export default DashboardView;

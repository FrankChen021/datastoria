"use client";

import { connect } from "echarts";
import { ChevronRight } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Dashboard, DashboardGroup, GridPos, PanelDescriptor } from "./dashboard-model";
import { DashboardPanel } from "./dashboard-panel";
import type { DashboardPanelComponent, RefreshOptions } from "./dashboard-panel-layout";
import type { TimeSpan } from "./timespan-selector";

export interface DashboardPanelsRef {
  refresh: (timeSpan?: TimeSpan) => void;
}

interface DashboardPanelsProps {
  dashboard: Dashboard;
  selectedTimeSpan: TimeSpan;
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

// Helper function to flatten all charts (including charts in groups)
function getAllCharts(charts: (PanelDescriptor | DashboardGroup)[]): PanelDescriptor[] {
  const allCharts: PanelDescriptor[] = [];
  charts.forEach((item) => {
    if (isDashboardGroup(item)) {
      allCharts.push(...item.charts);
    } else {
      allCharts.push(item);
    }
  });
  return allCharts;
}

// Helper function to get default height based on chart type
function getDefaultHeight(chart: PanelDescriptor): number {
  if (chart.type === "table" || chart.type === "transpose-table") {
    return 6; // Tables need more height
  }
  if (chart.type === "stat") {
    return 4; // Stats are compact
  }
  return 6; // Default for charts
}

// Helper function to get gridPos from chart, with fallback to width-based system
function getGridPos(chart: PanelDescriptor): GridPos {
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
        const upgradedGroupCharts = item.charts.map((chart: PanelDescriptor) => {
          // Ensure we have a chart descriptor with width property
          const chartWithWidth = chart as PanelDescriptor & { width?: number };
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
        const chart = item as PanelDescriptor & { width?: number };
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
        const upgradedGroupCharts = item.charts.map((chart: PanelDescriptor) => {
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
        const chart = item as PanelDescriptor;
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
        const upgradedGroupCharts = item.charts.map((chart: PanelDescriptor) => {
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
        const chart = item as PanelDescriptor;
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

// Component to render a panel with grid styling
interface DashboardGridPanelProps {
  descriptor: PanelDescriptor;
  panelIndex: number;
  isVisible: boolean;
  onSubComponentUpdated: (subComponent: DashboardPanelComponent | null, index: number) => void;
  selectedTimeSpan: TimeSpan;
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
}

const DashboardGridPanel: React.FC<DashboardGridPanelProps> = ({
  descriptor: chart,
  panelIndex,
  isVisible,
  onSubComponentUpdated,
  selectedTimeSpan,
  isCollapsed,
  onCollapsedChange,
}) => {
  const gridPos = getGridPos(chart);

  // Use minimal row span (1) when collapsed, full height when expanded
  const effectiveRowSpan = isCollapsed ? 1 : gridPos.h;

  // Calculate max height based on grid rows: each row is 32px min + 8px gap between rows
  // This ensures the panel doesn't grow beyond its intended height even with gridAutoRows: auto
  const ROW_HEIGHT = 36; // minmax(32px, auto) plus title padding
  const GAP_SIZE = 8; // gap-y-2 = 0.5rem = 8px
  const maxHeight = effectiveRowSpan * ROW_HEIGHT + (effectiveRowSpan - 1) * GAP_SIZE;

  const gridStyle: React.CSSProperties = {
    display: isVisible ? "block" : "none",
    gridColumn: `span ${gridPos.w}`,
    gridRow: `span ${effectiveRowSpan}`,
    minHeight: 0, // Allow grid item to shrink below content size
  };

  // Always constrain height to prevent grid rows from expanding beyond intended size
  // This ensures error messages or large content don't break the dashboard layout
  gridStyle.maxHeight = `${maxHeight}px`;
  gridStyle.overflow = "hidden";

  // Use explicit positioning only if x/y are specified
  if (gridPos.x !== undefined) {
    gridStyle.gridColumnStart = gridPos.x + 1;
    gridStyle.gridColumnEnd = gridPos.x + 1 + gridPos.w;
  }
  if (gridPos.y !== undefined) {
    gridStyle.gridRowStart = gridPos.y + 1;
    gridStyle.gridRowEnd = gridPos.y + 1 + effectiveRowSpan;
  }

  return (
    <div style={gridStyle} className="w-full h-full">
      <DashboardPanel
        descriptor={chart}
        selectedTimeSpan={selectedTimeSpan}
        onRef={(el) => onSubComponentUpdated(el, panelIndex)}
        onCollapsedChange={onCollapsedChange}
      />
    </div>
  );
};

const DashboardPanels = forwardRef<DashboardPanelsRef, DashboardPanelsProps>(
  ({ dashboard, selectedTimeSpan, children }, ref) => {
    // Track group collapse states at component level
    const [groupCollapseStates, setGroupCollapseStates] = useState<Map<number, boolean>>(new Map());
    // Track individual panel collapse states
    const [panelCollapseStates, setPanelCollapseStates] = useState<Map<number, boolean>>(new Map());
    const subComponentRefs = useRef<(DashboardPanelComponent | null)[]>([]);

    // Upgrade dashboard version if needed and memoize only the charts array
    const panels = useMemo(() => {
      const upgraded = upgradeDashboard(dashboard);
      return upgraded.charts;
    }, [dashboard]);

    // Memoize the panel flattening logic - no x,y calculation needed, CSS Grid handles it
    const { allPanels, groups } = useMemo(() => {
      // Flatten all charts (standalone + from groups) into one list with group tracking
      const flattenPanels: Array<{
        panel: PanelDescriptor;
        groupIndex?: number; // undefined for standalone charts
        group?: DashboardGroup; // reference to group for group panels
      }> = [];

      // Track group information
      const groupInfos: Array<{
        group: DashboardGroup;
        groupIndex: number;
        startPanelIndex: number; // index in panels where this group's panels start
        endPanelIndex: number; // index in panels where this group's panels end (exclusive)
      }> = [];

      let groupIndex = 0;

      // Process charts: flatten panels (no positioning calculation needed)
      panels.forEach((item) => {
        if (isDashboardGroup(item)) {
          const group = item;
          const startPanelIndex = flattenPanels.length;

          // Add all panels from this group
          group.charts.forEach((chart: PanelDescriptor) => {
            flattenPanels.push({
              panel: chart,
              groupIndex,
              group,
            });
          });

          // Store group info
          groupInfos.push({
            group,
            groupIndex,
            startPanelIndex,
            endPanelIndex: flattenPanels.length,
          });

          groupIndex++;
        } else {
          // Standalone chart
          flattenPanels.push({
            panel: item as PanelDescriptor,
          });
        }
      });

      return { allPanels: flattenPanels, groups: groupInfos };
    }, [panels]);

    // Initialize group collapse states from dashboard (only once when groups change)
    useEffect(() => {
      groups.forEach((g) => {
        if (!groupCollapseStates.has(g.groupIndex)) {
          setGroupCollapseStates((prev) => {
            const next = new Map(prev);
            next.set(g.groupIndex, g.group.collapsed ?? false);
            return next;
          });
        }
      });
    }, [groups, groupCollapseStates]);

    // Initialize panel collapse states from descriptors
    useEffect(() => {
      allPanels.forEach((item, index) => {
        if (!panelCollapseStates.has(index)) {
          setPanelCollapseStates((prev) => {
            const next = new Map(prev);
            next.set(index, item.panel.collapsed ?? false);
            return next;
          });
        }
      });
    }, [allPanels, panelCollapseStates]);

    const toggleGroup = useCallback((groupIndex: number) => {
      setGroupCollapseStates((prev) => {
        const next = new Map(prev);
        next.set(groupIndex, !(next.get(groupIndex) ?? false));
        return next;
      });
    }, []);

    const onPanelCollapsedChange = useCallback((panelIndex: number, isCollapsed: boolean) => {
      setPanelCollapseStates((prev) => {
        const next = new Map(prev);
        next.set(panelIndex, isCollapsed);
        return next;
      });
    }, []);

    // Determine which panels should be visible based on group collapse states
    const isPanelVisible = useCallback(
      (panelIndex: number): boolean => {
        const panel = allPanels[panelIndex];
        if (panel.groupIndex === undefined) {
          // Standalone panel - always visible
          return true;
        }

        // Check if the group this panel belongs to is collapsed
        // If state not initialized yet, check the group's collapsed property
        if (!groupCollapseStates.has(panel.groupIndex)) {
          // State not initialized, use group's default collapsed state
          const group = groups.find((g) => g.groupIndex === panel.groupIndex);
          return !(group?.group.collapsed ?? false);
        }

        const isCollapsed = groupCollapseStates.get(panel.groupIndex) ?? false;
        return !isCollapsed;
      },
      [allPanels, groupCollapseStates, groups]
    );

    // Function to connect all chart instances together
    const connectAllCharts = useCallback(() => {
      const chartInstances: echarts.ECharts[] = subComponentRefs.current
        .filter(
          (ref): ref is DashboardPanelComponent =>
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

      const allCharts = getAllCharts(panels);
      const chartNumber = allCharts.filter((chart: PanelDescriptor) => chart.type !== "table").length;
      if (chartInstances.length === chartNumber) {
        // Connect all echarts together on this page
        connect(chartInstances);
      }
    }, [panels]);

    // Callback when the sub component is mounted or unmounted
    const onSubComponentUpdated = useCallback(
      (subComponent: DashboardPanelComponent | null, index: number) => {
        subComponentRefs.current[index] = subComponent;
        connectAllCharts();
      },
      [connectAllCharts]
    );

    const refreshAllCharts = useCallback(
      (overrideTimeSpan?: TimeSpan) => {
        const timeSpan = overrideTimeSpan ?? selectedTimeSpan;

        // Always include inputFilter to force refresh even when timeSpan hasn't changed
        // This ensures that clicking refresh button multiple times with the same timeSpan will still trigger refresh
        const refreshParam: RefreshOptions = timeSpan
          ? { selectedTimeSpan: timeSpan, inputFilter: `refresh_${Date.now()}` }
          : { inputFilter: `refresh_${Date.now()}` };

        subComponentRefs.current.forEach((chart) => {
          if (chart !== null) {
            chart.refresh(refreshParam);
          }
        });
      },
      [selectedTimeSpan]
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

    // Memoize selectedTimeSpan to prevent unnecessary prop changes
    // This prevents all panels from refreshing when group collapse state changes
    const memoizedTimeSpan = useMemo(() => selectedTimeSpan, [selectedTimeSpan]);

    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Dashboard section - scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {panels &&
            panels.length > 0 &&
            (() => {
              // All dashboards are upgraded to version 3, so we always use CSS Grid layout
              // Grafana's approach: flatten all panels into one grid, render group headers as special items

              return (
                <div
                  className="grid gap-x-2 gap-y-2"
                  style={{
                    gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
                    gridAutoRows: "minmax(32px, auto)",
                  }}
                >
                  {/* Render group headers and panels in order - CSS Grid auto-places them */}
                  {panels.map((panel, panelIndex) => {
                    if (isDashboardGroup(panel)) {
                      const group = panel;
                      const groupInfo = groups.find((g) => g.group === group);
                      if (!groupInfo) return null;

                      const isCollapsed = groupCollapseStates.get(groupInfo.groupIndex) ?? false;

                      return (
                        <React.Fragment key={`group-${panelIndex}`}>
                          {/* Group header */}
                          <div
                            style={{
                              gridColumn: "1 / -1",
                              alignSelf: "start", // Align to start to minimize height
                            }}
                            className="w-full"
                          >
                            <div
                              onClick={() => toggleGroup(groupInfo.groupIndex)}
                              className="flex rounded-sm items-center py-1 transition-colors gap-1 cursor-pointer hover:bg-muted/50"
                              style={{
                                backgroundColor: isCollapsed ? "var(--muted)" : "transparent",
                              }}
                            >
                              <ChevronRight
                                className={`h-4 w-4 transition-transform duration-200 shrink-0 ${!isCollapsed ? "rotate-90" : ""
                                  }`}
                              />
                              <h3 className="text-md font-semibold">{group.title}</h3>
                            </div>
                          </div>

                          {/* Group panels - always render but hide when collapsed to prevent remounting */}
                          {group.charts.map((chart: PanelDescriptor, chartIndex) => {
                            const panelIndex = groupInfo.startPanelIndex + chartIndex;
                            const isVisible = isPanelVisible(panelIndex) && !isCollapsed;
                            const isPanelCollapsed = panelCollapseStates.get(panelIndex) ?? chart.collapsed ?? false;

                            return (
                              <DashboardGridPanel
                                key={`panel-${panelIndex}`}
                                descriptor={chart}
                                panelIndex={panelIndex}
                                isVisible={isVisible}
                                onSubComponentUpdated={onSubComponentUpdated}
                                selectedTimeSpan={memoizedTimeSpan}
                                isCollapsed={isPanelCollapsed}
                                onCollapsedChange={(collapsed) => onPanelCollapsedChange(panelIndex, collapsed)}
                              />
                            );
                          })}
                        </React.Fragment>
                      );
                    } else {
                      // Standalone chart
                      const panelDescriptor = panel as PanelDescriptor;
                      const panelIndex = allPanels.findIndex((p) => p.panel === panelDescriptor);
                      if (panelIndex === -1) return null;

                      const isVisible = isPanelVisible(panelIndex);
                      if (!isVisible) return null;

                      const isPanelCollapsed =
                        panelCollapseStates.get(panelIndex) ?? panelDescriptor.collapsed ?? false;

                      return (
                        <DashboardGridPanel
                          key={`panel-${panelIndex}`}
                          descriptor={panelDescriptor}
                          panelIndex={panelIndex}
                          isVisible={isVisible}
                          onSubComponentUpdated={onSubComponentUpdated}
                          selectedTimeSpan={memoizedTimeSpan}
                          isCollapsed={isPanelCollapsed}
                          onCollapsedChange={(collapsed) => onPanelCollapsedChange(panelIndex, collapsed)}
                        />
                      );
                    }
                  })}

                  {children && (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                      }}
                    >
                      {children}
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      </div>
    );
  }
);

DashboardPanels.displayName = "DashboardPanels";

export default DashboardPanels;

"use client";

import { cn } from "@/lib/utils";
import { connect } from "echarts";
import { ChevronRight } from "lucide-react";
import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dashboard, DashboardGroup, GridPos, PanelDescriptor } from "./dashboard-model";
import type {
  DashboardVisualizationComponent,
  RefreshOptions,
} from "./dashboard-visualization-layout";
import { DashboardVisualizationPanel } from "./dashboard-visualization-panel";
import type { TimeSpan } from "./timespan-selector";

export interface DashboardPanelContainerRef {
  refresh: (timeSpan?: TimeSpan, filterExpression?: string) => void;
}

/**
 * Interface for child components that can be refreshed by the dashboard.
 * Children that implement this interface will be automatically refreshed
 * when the dashboard is refreshed.
 */
export interface RefreshableChild {
  refresh: (timeSpan?: TimeSpan, filterExpression?: string) => void;
}

/**
 * Context for dashboard refresh registration.
 * Child components can use the useDashboardRefresh hook to register
 * themselves for automatic refresh when the dashboard refreshes.
 */
interface DashboardRefreshContextValue {
  register: (child: RefreshableChild) => void;
  unregister: (child: RefreshableChild) => void;
}

const DashboardRefreshContext = createContext<DashboardRefreshContextValue | null>(null);

/**
 * Hook for child components to register themselves for dashboard refresh.
 * When the dashboard is refreshed, the provided refresh function will be called.
 *
 * @param refreshFn - Function to call when dashboard refreshes
 *
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const fetchData = useCallback((timeSpan?: TimeSpan) => {
 *     // fetch data...
 *   }, []);
 *
 *   useDashboardRefresh(fetchData);
 *
 *   return <div>...</div>;
 * };
 * ```
 */
export function useDashboardRefresh(
  refreshFn: (timeSpan?: TimeSpan, filterExpression?: string) => void
) {
  const ctx = useContext(DashboardRefreshContext);

  useEffect(() => {
    if (!ctx) return;

    const child: RefreshableChild = { refresh: refreshFn };
    ctx.register(child);

    return () => {
      ctx.unregister(child);
    };
  }, [ctx, refreshFn]);
}

interface DashboardPanelContainerProps {
  dashboard: Dashboard;
  initialTimeSpan?: TimeSpan;
  initialFilterExpression?: string;
  initialLoading?: boolean;
  onChartSelection?: (
    timeSpan: TimeSpan,
    selection: { name: string; series: string; value: number }
  ) => void;
  /**
   * Children to render below the dashboard panels.
   * Children can use the useDashboardRefresh hook to register
   * themselves for automatic refresh when the dashboard refreshes.
   */
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

const DASHBOARD_MOBILE_BREAKPOINT = 768;
const DASHBOARD_DESKTOP_BREAKPOINT = 1024;

/** Single source of truth for dashboard grid column counts: mobile | tablet | desktop */
export type DashboardGridColumns = 1 | 6 | 24;

/**
 * Returns the number of grid columns for the dashboard layout:
 * - 1: mobile (< 768px) – single column
 * - 8: tablet (768px–1023px) – 8 columns
 * - 24: desktop (≥ 1024px) – 24 columns
 */
function useDashboardGridColumns(): DashboardGridColumns {
  const [columns, setColumns] = useState<DashboardGridColumns>(24);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < DASHBOARD_MOBILE_BREAKPOINT) setColumns(1);
      else if (w < DASHBOARD_DESKTOP_BREAKPOINT) setColumns(6);
      else setColumns(24);
    };
    const mqlMobile = window.matchMedia(`(max-width: ${DASHBOARD_MOBILE_BREAKPOINT - 1}px)`);
    const mqlDesktop = window.matchMedia(`(min-width: ${DASHBOARD_DESKTOP_BREAKPOINT}px)`);
    const onChange = () => update();
    mqlMobile.addEventListener("change", onChange);
    mqlDesktop.addEventListener("change", onChange);
    update();
    return () => {
      mqlMobile.removeEventListener("change", onChange);
      mqlDesktop.removeEventListener("change", onChange);
    };
  }, []);

  return columns;
}

// Helper function to get gridPos from chart
// All dashboards must be version 3 with gridPos defined
function getGridPos(chart: PanelDescriptor): GridPos {
  if (chart.gridPos) {
    return chart.gridPos;
  }

  // Fallback for panels without gridPos (should not happen in version 3)
  // This provides a reasonable default to prevent runtime errors
  console.warn(
    `Panel "${chart.titleOption?.title ?? chart.type}" is missing gridPos. Using default.`
  );
  return {
    w: 24,
    h: 6,
  };
}

// Component to render a panel with grid styling (layout is defined in 24-col base)
interface DashboardGridPanelProps {
  descriptor: PanelDescriptor;
  panelIndex: number;
  isVisible: boolean;
  gridColumns: DashboardGridColumns;
  onSubComponentUpdated: (
    subComponent: DashboardVisualizationComponent | null,
    index: number
  ) => void;
  initialTimeSpan?: TimeSpan;
  initialFilterExpression?: string;
  initialLoading?: boolean;
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  onChartSelection?: (
    timeSpan: TimeSpan,
    selection: { name: string; series: string; value: number }
  ) => void;
}

const DashboardGridPanel: React.FC<DashboardGridPanelProps> = ({
  descriptor: chart,
  panelIndex,
  isVisible,
  gridColumns,
  onSubComponentUpdated,
  initialTimeSpan,
  initialFilterExpression,
  initialLoading,
  isCollapsed,
  onCollapsedChange,
  onChartSelection,
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
    gridRow: `span ${effectiveRowSpan}`,
    minHeight: 0, // Allow grid item to shrink below content size
  };

  if (gridColumns === 1) {
    gridStyle.gridColumn = "1 / -1";
  } else {
    // Scale from 24-column base to current grid (8 or 24).
    // On tablet (gridColumns < 24), enforce a minimum span so small panels (e.g. w=3)
    // don't shrink to 1 column and pack 6+ per row; aim for at most 2 panels per row.
    const wScaled = Math.round((gridPos.w / 24) * gridColumns);
    const minSpan = gridColumns < 24 ? Math.ceil(gridColumns / 2) : 1;
    const span = Math.max(minSpan, Math.min(wScaled, gridColumns));
    if (gridPos.x !== undefined) {
      const xScaled = Math.round((gridPos.x / 24) * gridColumns);
      gridStyle.gridColumnStart = xScaled + 1;
      gridStyle.gridColumnEnd = xScaled + 1 + span;
    } else {
      gridStyle.gridColumn = `span ${span}`;
    }
  }

  if (gridPos.y !== undefined && gridColumns !== 1) {
    gridStyle.gridRowStart = gridPos.y + 1;
    gridStyle.gridRowEnd = gridPos.y + 1 + effectiveRowSpan;
  }

  // Always constrain height to prevent grid rows from expanding beyond intended size
  gridStyle.maxHeight = `${maxHeight}px`;
  gridStyle.overflow = "hidden";

  return (
    <div style={gridStyle} className={cn("w-full", isCollapsed ? "h-auto" : "h-full")}>
      <DashboardVisualizationPanel
        descriptor={chart}
        initialTimeSpan={initialTimeSpan}
        initialFilterExpression={initialFilterExpression}
        initialLoading={initialLoading}
        ref={(el) => onSubComponentUpdated(el, panelIndex)}
        onCollapsedChange={onCollapsedChange}
        onChartSelection={onChartSelection}
      />
    </div>
  );
};

const DashboardPanelContainer = forwardRef<
  DashboardPanelContainerRef,
  DashboardPanelContainerProps
>(
  (
    {
      dashboard,
      initialTimeSpan,
      initialFilterExpression,
      initialLoading,
      onChartSelection,
      children,
    },
    ref
  ) => {
    // Track group collapse states at component level
    const [groupCollapseStates, setGroupCollapseStates] = useState<Map<number, boolean>>(new Map());
    // Track individual panel collapse states
    const [panelCollapseStates, setPanelCollapseStates] = useState<Map<number, boolean>>(new Map());
    const subComponentRefs = useRef<(DashboardVisualizationComponent | null)[]>([]);

    // Track registered refreshable children
    const registeredChildrenRef = useRef<Set<RefreshableChild>>(new Set());

    // 1 col mobile, 8 col tablet (e.g. iPad), 24 col desktop
    const gridColumns = useDashboardGridColumns();

    // Memoize the charts array from the dashboard
    // All dashboards must be version 3 with gridPos defined
    const panels = useMemo(() => dashboard.charts, [dashboard]);

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
          (ref): ref is DashboardVisualizationComponent =>
            ref !== null &&
            typeof (ref as unknown as { getEChartInstance?: () => echarts.ECharts })
              .getEChartInstance === "function"
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
      const chartNumber = allCharts.filter(
        (chart: PanelDescriptor) => chart.type !== "table"
      ).length;
      if (chartInstances.length === chartNumber) {
        // Connect all echarts together on this page
        connect(chartInstances);
      }
    }, [panels]);

    // Callback when the sub component is mounted or unmounted
    const onSubComponentUpdated = useCallback(
      (subComponent: DashboardVisualizationComponent | null, index: number) => {
        subComponentRefs.current[index] = subComponent;
        connectAllCharts();
      },
      [connectAllCharts]
    );

    const refreshAllCharts = useCallback(
      (newTimeSpan?: TimeSpan, newFilterExpression?: string) => {
        const refreshParam: RefreshOptions = {
          timeSpan: newTimeSpan ?? initialTimeSpan,
          filterExpression: newFilterExpression ?? initialFilterExpression,

          // Use forceRefresh to ensure refresh happens even when timeSpan/filterExpression haven't changed
          // This is important for clicking refresh button multiple times with the same parameters
          forceRefresh: true,
        };

        subComponentRefs.current.forEach((chart) => {
          if (chart !== null) {
            chart.refresh(refreshParam);
          }
        });

        // Also refresh all registered child components
        registeredChildrenRef.current.forEach((child) => {
          child.refresh(
            newTimeSpan ?? initialTimeSpan,
            newFilterExpression ?? initialFilterExpression
          );
        });
      },
      [initialTimeSpan, initialFilterExpression]
    );

    // Expose refresh method via imperative handle
    useImperativeHandle(
      ref,
      () => ({
        refresh: (timeSpan?: TimeSpan, filterExpression?: string) => {
          refreshAllCharts(timeSpan, filterExpression);
        },
      }),
      [refreshAllCharts]
    );

    // Context value for child registration
    const contextValue = useMemo<DashboardRefreshContextValue>(
      () => ({
        register: (child: RefreshableChild) => {
          registeredChildrenRef.current.add(child);
        },
        unregister: (child: RefreshableChild) => {
          registeredChildrenRef.current.delete(child);
        },
      }),
      []
    );

    return (
      <DashboardRefreshContext.Provider value={contextValue}>
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
                      gridTemplateColumns:
                        gridColumns === 1 ? "1fr" : `repeat(${gridColumns}, minmax(0, 1fr))`,
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
                                  className={`h-4 w-4 transition-transform duration-200 shrink-0 ${
                                    !isCollapsed ? "rotate-90" : ""
                                  }`}
                                />
                                <h3 className="text-md font-semibold">{group.title}</h3>
                                <span className="text-xs text-muted-foreground">
                                  &nbsp;({group.charts.length} panels)
                                </span>
                              </div>
                            </div>

                            {/* Group panels - always render but hide when collapsed to prevent remounting */}
                            {group.charts.map((chart: PanelDescriptor, chartIndex) => {
                              const panelIndex = groupInfo.startPanelIndex + chartIndex;
                              const isVisible = isPanelVisible(panelIndex) && !isCollapsed;
                              const isPanelCollapsed =
                                panelCollapseStates.get(panelIndex) ?? chart.collapsed ?? false;

                              return (
                                <DashboardGridPanel
                                  key={`panel-${panelIndex}`}
                                  descriptor={chart}
                                  panelIndex={panelIndex}
                                  isVisible={isVisible}
                                  gridColumns={gridColumns}
                                  onSubComponentUpdated={onSubComponentUpdated}
                                  initialTimeSpan={initialTimeSpan}
                                  initialFilterExpression={initialFilterExpression}
                                  initialLoading={initialLoading}
                                  isCollapsed={isPanelCollapsed}
                                  onCollapsedChange={(collapsed) =>
                                    onPanelCollapsedChange(panelIndex, collapsed)
                                  }
                                  onChartSelection={onChartSelection}
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
                            gridColumns={gridColumns}
                            onSubComponentUpdated={onSubComponentUpdated}
                            initialTimeSpan={initialTimeSpan}
                            initialFilterExpression={initialFilterExpression}
                            initialLoading={initialLoading}
                            isCollapsed={isPanelCollapsed}
                            onCollapsedChange={(collapsed) =>
                              onPanelCollapsedChange(panelIndex, collapsed)
                            }
                            onChartSelection={onChartSelection}
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
      </DashboardRefreshContext.Provider>
    );
  }
);

export default DashboardPanelContainer;

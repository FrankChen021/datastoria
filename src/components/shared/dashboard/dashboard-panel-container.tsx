"use client";

import { connect } from "echarts";
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
import { invalidateLegacySectionLayoutKeys } from "./dashboard-layout-storage";
import type { Dashboard, DashboardGroup, PanelDescriptor } from "./dashboard-model";
import { DashboardSection } from "./dashboard-section";
import type {
  DashboardVisualizationComponent,
  RefreshOptions,
} from "./dashboard-visualization-layout";
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
  /** Unique identifier for layout persistence */
  dashboardId?: string;
  initialTimeSpan?: TimeSpan;
  initialFilterExpression?: string;
  initialLoading?: boolean;
  onChartSelection?: (
    timeSpan: TimeSpan,
    selection: { name: string; series: string; value: number }
  ) => void;
  /** Whether to show edit controls for sections (custom dashboards) */
  showSectionEditControls?: boolean;
  /** Callback when section is renamed */
  onSectionRename?: (sectionIndex: number, newTitle: string) => void;
  /** Callback when section is deleted */
  onSectionDelete?: (sectionIndex: number) => void;
  /** Callback when section collapse state changes */
  onSectionCollapseChange?: (sectionIndex: number, collapsed: boolean) => void;
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

export function requiresLegacySectionLayoutInvalidation(
  charts: (PanelDescriptor | DashboardGroup)[]
): boolean {
  let hasUngroupedPanels = false;

  for (const item of charts) {
    if (isDashboardGroup(item)) {
      if (hasUngroupedPanels) {
        return true;
      }
      continue;
    }

    hasUngroupedPanels = true;
  }

  return false;
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

/** Single source of truth for dashboard grid column counts: mobile | tablet | desktop */
export type DashboardGridColumns = 1 | 6 | 24;

/** Represents a section with its panels and metadata */
interface SectionInfo {
  group: DashboardGroup | null; // null for ungrouped panels
  sectionIndex: number;
  panels: PanelDescriptor[];
  globalPanelStartIndex: number; // Global index of first panel in this section
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function panelSignature(panel: PanelDescriptor): string {
  const title = panel.titleOption?.title ?? "";
  const gp = panel.gridPos;
  const grid = gp ? `${gp.x ?? "a"},${gp.y ?? "a"},${gp.w},${gp.h}` : "auto";
  return `${panel.type}|${title}|${grid}|${panel.datasource.sql}`;
}

function getAutoDashboardId(dashboard: Dashboard): string {
  const signature = dashboard.charts
    .map((item) =>
      isDashboardGroup(item)
        ? `g:${item.title}[${item.charts.map(panelSignature).join("||")}]`
        : `p:${panelSignature(item)}`
    )
    .join("::");
  return `auto-${hashString(signature)}`;
}

const DashboardPanelContainer = forwardRef<
  DashboardPanelContainerRef,
  DashboardPanelContainerProps
>(
  (
    {
      dashboard,
      dashboardId,
      initialTimeSpan,
      initialFilterExpression,
      initialLoading,
      onChartSelection,
      showSectionEditControls = false,
      onSectionRename,
      onSectionDelete,
      onSectionCollapseChange,
      children,
    },
    ref
  ) => {
    // Track individual panel collapse states (keyed by global panel index)
    const [panelCollapseStates, setPanelCollapseStates] = useState<Map<number, boolean>>(new Map());
    // Track section collapse states (keyed by section index) - local state, not persisted
    const [sectionCollapseStates, setSectionCollapseStates] = useState<Map<number, boolean>>(
      new Map()
    );
    const subComponentRefs = useRef<(DashboardVisualizationComponent | null)[]>([]);

    // Track registered refreshable children
    const registeredChildrenRef = useRef<Set<RefreshableChild>>(new Set());

    // Memoize the charts array from the dashboard
    const panels = useMemo(() => dashboard.charts, [dashboard]);

    // Build sections from dashboard panels
    const sections = useMemo<SectionInfo[]>(() => {
      const result: SectionInfo[] = [];
      let globalPanelIndex = 0;
      let sectionIndex = 0;
      let ungroupedPanels: PanelDescriptor[] = [];
      let ungroupedStartIndex: number | null = null;

      const flushUngrouped = () => {
        if (ungroupedPanels.length === 0 || ungroupedStartIndex === null) {
          return;
        }
        result.push({
          group: null,
          sectionIndex,
          panels: ungroupedPanels,
          globalPanelStartIndex: ungroupedStartIndex,
        });
        sectionIndex++;
        ungroupedPanels = [];
        ungroupedStartIndex = null;
      };

      panels.forEach((item) => {
        if (isDashboardGroup(item)) {
          flushUngrouped();

          // This is a group - create a section for it
          result.push({
            group: item,
            sectionIndex,
            panels: item.charts,
            globalPanelStartIndex: globalPanelIndex,
          });
          globalPanelIndex += item.charts.length;
          sectionIndex++;
        } else {
          // Standalone panel - collect into current ungrouped block
          if (ungroupedStartIndex === null) {
            ungroupedStartIndex = globalPanelIndex;
          }
          ungroupedPanels.push(item);
          globalPanelIndex++;
        }
      });

      flushUngrouped();

      return result;
    }, [panels]);

    // Initialize panel collapse states from descriptors
    useEffect(() => {
      setPanelCollapseStates((prev) => {
        const next = new Map(prev);
        let changed = false;
        sections.forEach((section) => {
          section.panels.forEach((panel, localIndex) => {
            const globalIndex = section.globalPanelStartIndex + localIndex;
            if (!prev.has(globalIndex)) {
              next.set(globalIndex, panel.collapsed ?? false);
              changed = true;
            }
          });
        });
        return changed ? next : prev;
      });
    }, [sections]);

    // Store callback in ref to avoid stale closure in setState
    const onSectionCollapseChangeRef = useRef(onSectionCollapseChange);
    onSectionCollapseChangeRef.current = onSectionCollapseChange;

    // Store sections in ref to access current value in toggle handler
    const sectionsRef = useRef(sections);
    sectionsRef.current = sections;

    // Track pending collapse change to notify parent after state update
    const pendingCollapseChangeRef = useRef<{ sectionIndex: number; collapsed: boolean } | null>(
      null
    );

    // Toggle section collapse - uses local state, optionally notifies parent
    const handleSectionToggle = useCallback((sectionIndex: number) => {
      console.log("[handleSectionToggle] Called for section:", sectionIndex);
      const section = sectionsRef.current.find((s) => s.sectionIndex === sectionIndex);
      const configCollapsed = section?.group?.collapsed ?? false;

      setSectionCollapseStates((prev) => {
        const currentCollapsed = prev.has(sectionIndex) ? prev.get(sectionIndex)! : configCollapsed;
        const newCollapsed = !currentCollapsed;
        console.log(
          "[handleSectionToggle] Previous state:",
          currentCollapsed,
          "-> New state:",
          newCollapsed
        );

        // Store pending change to notify parent after render
        pendingCollapseChangeRef.current = { sectionIndex, collapsed: newCollapsed };

        const next = new Map(prev);
        next.set(sectionIndex, newCollapsed);
        return next;
      });
    }, []);

    // Notify parent after state update settles
    useEffect(() => {
      if (pendingCollapseChangeRef.current) {
        const { sectionIndex, collapsed } = pendingCollapseChangeRef.current;
        pendingCollapseChangeRef.current = null;
        onSectionCollapseChangeRef.current?.(sectionIndex, collapsed);
      }
    }, [sectionCollapseStates]);

    const onPanelCollapsedChange = useCallback((globalPanelIndex: number, isCollapsed: boolean) => {
      setPanelCollapseStates((prev) => {
        const next = new Map(prev);
        next.set(globalPanelIndex, isCollapsed);
        return next;
      });
    }, []);

    // Function to connect all chart instances together
    const connectAllCharts = useCallback(() => {
      const chartInstances: echarts.ECharts[] = subComponentRefs.current
        .filter(
          (chartRef): chartRef is DashboardVisualizationComponent =>
            chartRef !== null &&
            typeof (chartRef as unknown as { getEChartInstance?: () => echarts.ECharts })
              .getEChartInstance === "function"
        )
        .map((chartRef) => {
          const component = chartRef as unknown as { getEChartInstance: () => echarts.ECharts };
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

    // Callback when a subcomponent is mounted or unmounted
    const onSubComponentUpdated = useCallback(
      (subComponent: DashboardVisualizationComponent | null, globalIndex: number) => {
        subComponentRefs.current[globalIndex] = subComponent;
        connectAllCharts();
      },
      [connectAllCharts]
    );

    const refreshAllCharts = useCallback(
      (newTimeSpan?: TimeSpan, newFilterExpression?: string) => {
        const refreshParam: RefreshOptions = {
          timeSpan: newTimeSpan ?? initialTimeSpan,
          filterExpression: newFilterExpression ?? initialFilterExpression,
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

    const effectiveDashboardId = useMemo(() => {
      const explicitId = dashboardId?.trim();
      if (explicitId) {
        return explicitId;
      }
      const namedId = dashboard.name?.trim();
      if (namedId) {
        return namedId;
      }
      return getAutoDashboardId(dashboard);
    }, [dashboardId, dashboard]);

    const shouldInvalidateLegacySectionLayouts = useMemo(
      () => requiresLegacySectionLayoutInvalidation(panels),
      [panels]
    );

    useEffect(() => {
      if (!shouldInvalidateLegacySectionLayouts) {
        return;
      }
      invalidateLegacySectionLayoutKeys(effectiveDashboardId);
    }, [effectiveDashboardId, shouldInvalidateLegacySectionLayouts]);

    return (
      <DashboardRefreshContext.Provider value={contextValue}>
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {sections.map((section) => {
              // Use local state for collapse only (no persistence)
              const isCollapsed = sectionCollapseStates.get(section.sectionIndex) ?? false;

              return (
                <DashboardSection
                  key={`section-${section.sectionIndex}`}
                  dashboardId={effectiveDashboardId}
                  sectionIndex={section.sectionIndex}
                  group={section.group}
                  panels={section.panels}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={() => handleSectionToggle(section.sectionIndex)}
                  onSubComponentUpdated={onSubComponentUpdated}
                  globalPanelStartIndex={section.globalPanelStartIndex}
                  initialTimeSpan={initialTimeSpan}
                  initialFilterExpression={initialFilterExpression}
                  initialLoading={initialLoading}
                  panelCollapseStates={panelCollapseStates}
                  onPanelCollapsedChange={onPanelCollapsedChange}
                  onChartSelection={onChartSelection}
                  showEditControls={showSectionEditControls && section.group !== null}
                  onRename={
                    onSectionRename
                      ? (title) => onSectionRename(section.sectionIndex, title)
                      : undefined
                  }
                  onDelete={
                    onSectionDelete ? () => onSectionDelete(section.sectionIndex) : undefined
                  }
                />
              );
            })}
            {children}
          </div>
        </div>
      </DashboardRefreshContext.Provider>
    );
  }
);

export default DashboardPanelContainer;

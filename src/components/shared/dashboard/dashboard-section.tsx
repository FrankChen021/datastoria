"use client";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout/react";
import { getPanelConstraints } from "./dashboard-layout-constraints";
import { useDashboardLayoutOptional } from "./dashboard-layout-provider";
import { loadSectionLayout, saveSectionLayout } from "./dashboard-layout-storage";
import type { DashboardGroup, GridPos, PanelDescriptor } from "./dashboard-model";
import { SectionHeader } from "./dashboard-section-header";
import type { DashboardVisualizationComponent } from "./dashboard-visualization-layout";
import { DashboardVisualizationPanel } from "./dashboard-visualization-panel";
import type { TimeSpan } from "./timespan-selector";

export interface DashboardSectionProps {
  /** Dashboard ID for layout storage */
  dashboardId: string;
  /** Section index for layout storage key */
  sectionIndex: number;
  /** Section group data (null for ungrouped panels) */
  group: DashboardGroup | null;
  /** Panels in this section */
  panels: PanelDescriptor[];
  /** Whether this section is collapsed */
  isCollapsed: boolean;
  /** Callback when collapse state changes */
  onToggleCollapse: () => void;
  /** Callback when a subcomponent ref is updated */
  onSubComponentUpdated: (
    subComponent: DashboardVisualizationComponent | null,
    globalPanelIndex: number
  ) => void;
  /** Starting index for global panel numbering */
  globalPanelStartIndex: number;
  /** Initial time span for queries */
  initialTimeSpan?: TimeSpan;
  /** Initial filter expression */
  initialFilterExpression?: string;
  /** Initial loading state */
  initialLoading?: boolean;
  /** Panel collapse states (keyed by global panel index) */
  panelCollapseStates: Map<number, boolean>;
  /** Callback when panel collapse state changes */
  onPanelCollapsedChange: (globalPanelIndex: number, collapsed: boolean) => void;
  /** Callback when chart selection occurs */
  onChartSelection?: (
    timeSpan: TimeSpan,
    selection: { name: string; series: string; value: number }
  ) => void;
  /** Whether to show edit controls (for custom dashboards) */
  showEditControls?: boolean;
  /** Callback when section is renamed */
  onRename?: (newTitle: string) => void;
  /** Callback when section is deleted */
  onDelete?: () => void;
}

// Helper function to get gridPos from panel
function getGridPos(panel: PanelDescriptor): GridPos {
  if (panel.gridPos) {
    return panel.gridPos;
  }
  console.warn(
    `Panel "${panel.titleOption?.title ?? panel.type}" is missing gridPos. Using default.`
  );
  return { w: 24, h: 6 };
}

// Auto-position panels by flowing them left-to-right, wrapping to the next row
function autoPositionPanels(
  panels: { w: number; h: number }[],
  cols: number
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  // Track the bottom edge of each column to pack panels efficiently
  const colHeights = new Array(cols).fill(0);

  for (const panel of panels) {
    const w = Math.min(panel.w, cols);
    let bestX = 0;
    let bestY = Infinity;

    // Find the leftmost position where this panel fits with the lowest y
    for (let x = 0; x <= cols - w; x++) {
      // The y position is determined by the tallest column in the span
      let maxH = 0;
      for (let col = x; col < x + w; col++) {
        maxH = Math.max(maxH, colHeights[col]);
      }
      if (maxH < bestY) {
        bestY = maxH;
        bestX = x;
      }
    }

    positions.push({ x: bestX, y: bestY });

    // Update column heights for the occupied span
    for (let col = bestX; col < bestX + w; col++) {
      colHeights[col] = bestY + panel.h;
    }
  }

  return positions;
}

// Generate react-grid-layout layouts from panels
function generateLayoutsFromPanels(panels: PanelDescriptor[]): ResponsiveLayouts {
  const lg: LayoutItem[] = [];
  const md: LayoutItem[] = [];
  const sm: LayoutItem[] = [];

  // Pre-calculate auto positions for panels without explicit x/y
  const lgSizes = panels.map((p) => {
    const gp = getGridPos(p);
    return { w: gp.w, h: gp.h };
  });
  const lgPositions = autoPositionPanels(lgSizes, 24);

  const mdSizes = panels.map((p) => {
    const gp = getGridPos(p);
    const constraints = getPanelConstraints(p.type);
    const mdW = Math.min(Math.max(constraints.minW, Math.round((gp.w / 24) * 6)), 6);
    return { w: mdW, h: gp.h };
  });
  const mdPositions = autoPositionPanels(mdSizes, 6);

  panels.forEach((panel, index) => {
    const gridPos = getGridPos(panel);
    const constraints = getPanelConstraints(panel.type);
    const key = `panel-${index}`;

    // Desktop layout (24 cols)
    lg.push({
      i: key,
      x: gridPos.x ?? lgPositions[index].x,
      y: gridPos.y ?? lgPositions[index].y,
      w: gridPos.w,
      h: gridPos.h,
      ...constraints,
    });

    // Tablet layout (6 cols)
    const mdW = Math.min(Math.max(constraints.minW, Math.round((gridPos.w / 24) * 6)), 6);
    md.push({
      i: key,
      x: mdPositions[index].x,
      y: mdPositions[index].y,
      w: mdW,
      h: gridPos.h,
      minW: Math.min(constraints.minW, 6),
      minH: constraints.minH,
      maxW: 6,
      maxH: constraints.maxH,
    });

    // Mobile layout (1 col) - stack vertically
    sm.push({
      i: key,
      x: 0,
      y: index * 4,
      w: 1,
      h: gridPos.h,
      minW: 1,
      minH: constraints.minH,
      maxW: 1,
      maxH: constraints.maxH,
      static: true,
    });
  });

  return { lg, md, sm };
}

/**
 * Dashboard section component containing a header and a grid of panels.
 * Each section has its own ResponsiveGridLayout for independent drag/resize.
 */
export function DashboardSection({
  dashboardId,
  sectionIndex,
  group,
  panels,
  isCollapsed,
  onToggleCollapse,
  onSubComponentUpdated,
  globalPanelStartIndex,
  initialTimeSpan,
  initialFilterExpression,
  initialLoading,
  panelCollapseStates,
  onPanelCollapsedChange,
  onChartSelection,
  showEditControls = false,
  onRename,
  onDelete,
}: DashboardSectionProps) {
  const { width, mounted, containerRef } = useContainerWidth();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVisibleWidthRef = useRef(0);

  // Subscribe to layout reset signals from the provider
  const layoutContext = useDashboardLayoutOptional();
  const layoutVersion = layoutContext?.layoutVersion ?? 0;

  // Generate default layouts
  const defaultLayouts = useMemo(() => generateLayoutsFromPanels(panels), [panels]);

  // Merge saved layouts with defaults: preserve positions for existing panels, use defaults for new ones
  const mergeLayouts = useCallback(
    (saved: ResponsiveLayouts | null, defaults: ResponsiveLayouts): ResponsiveLayouts => {
      if (!saved) return defaults;

      const result: ResponsiveLayouts = {};
      for (const breakpoint of Object.keys(defaults) as (keyof ResponsiveLayouts)[]) {
        const defaultItems = defaults[breakpoint] ?? [];
        const savedItems = saved[breakpoint] ?? [];
        const savedMap = new Map(savedItems.map((item) => [item.i, item]));

        result[breakpoint] = defaultItems.map((defaultItem) => {
          const savedItem = savedMap.get(defaultItem.i);
          if (savedItem) {
            // Preserve saved position, but apply current constraints
            return {
              ...defaultItem,
              x: savedItem.x,
              y: savedItem.y,
              w: savedItem.w,
              h: savedItem.h,
            };
          }
          // New panel — use auto-positioned default
          return defaultItem;
        });
      }
      return result;
    },
    []
  );

  // Load saved layouts, merging with defaults for any new panels
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(() => {
    const saved = loadSectionLayout(dashboardId, sectionIndex);
    return mergeLayouts(saved, defaultLayouts);
  });

  // Update layouts when panels change or layout is reset — merge to preserve existing positions
  useEffect(() => {
    const saved = loadSectionLayout(dashboardId, sectionIndex);
    setLayouts(mergeLayouts(saved, defaultLayouts));
  }, [dashboardId, sectionIndex, defaultLayouts, mergeLayouts, layoutVersion]);

  // Handle layout change with debounced save
  const onLayoutChange = useCallback(
    (_currentLayout: Layout, allLayouts: ResponsiveLayouts) => {
      setLayouts(allLayouts);

      // Debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveSectionLayout(dashboardId, sectionIndex, allLayouts);
      }, 500);
    },
    [dashboardId, sectionIndex]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Breakpoint configuration
  const breakpoints = { lg: 1024, md: 768, sm: 0 };
  const cols = { lg: 24, md: 6, sm: 1 };

  const sectionTitle = group?.title ?? "Ungrouped";

  // Don't render header for ungrouped section if there's only ungrouped panels
  const showHeader = group !== null;

  useEffect(() => {
    if (width > 0) {
      lastVisibleWidthRef.current = width;
    }
  }, [width]);

  const effectiveWidth = width > 0 ? width : lastVisibleWidthRef.current;

  return (
    <div className="w-full">
      {showHeader && (
        <SectionHeader
          title={sectionTitle}
          panelCount={panels.length}
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          showEditControls={showEditControls}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}

      {/* Always render container so useContainerWidth hook can measure width */}
      {panels.length > 0 && (
        <div
          ref={containerRef}
          className="w-full"
          style={isCollapsed ? { height: 0, overflow: "hidden", visibility: "hidden" } : undefined}
        >
          {mounted && effectiveWidth > 0 && (
            <ResponsiveGridLayout
              key={`grid-${sectionIndex}`}
              className="layout"
              width={effectiveWidth}
              layouts={layouts}
              breakpoints={breakpoints}
              cols={cols}
              rowHeight={36}
              margin={[8, 8]}
              containerPadding={[0, 0]}
              onLayoutChange={onLayoutChange}
              dragConfig={{
                enabled: true,
                bounded: false,
                handle: ".dashboard-drag-handle",
                threshold: 3,
              }}
              compactor={verticalCompactor}
            >
              {panels.map((panel, localIndex) => {
                const globalIndex = globalPanelStartIndex + localIndex;
                const isPanelCollapsed =
                  panelCollapseStates.get(globalIndex) ?? panel.collapsed ?? false;

                return (
                  <div key={`panel-${localIndex}`} className="h-full">
                    <div className={cn("w-full h-full", isPanelCollapsed && "h-auto")}>
                      <DashboardVisualizationPanel
                        descriptor={panel}
                        initialTimeSpan={initialTimeSpan}
                        initialFilterExpression={initialFilterExpression}
                        initialLoading={initialLoading}
                        ref={(el) => onSubComponentUpdated(el, globalIndex)}
                        onCollapsedChange={(collapsed) =>
                          onPanelCollapsedChange(globalIndex, collapsed)
                        }
                        onChartSelection={onChartSelection}
                      />
                    </div>
                  </div>
                );
              })}
            </ResponsiveGridLayout>
          )}
        </div>
      )}

      {!isCollapsed && panels.length === 0 && showEditControls && (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground border-b">
          No panels in this section. Add panels to get started.
        </div>
      )}
    </div>
  );
}

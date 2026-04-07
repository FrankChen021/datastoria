"use client";

import { useConnection } from "@/components/connection/connection-context";
import { Input } from "@/components/ui/input";
import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { LayoutItem, ResponsiveLayouts } from "react-grid-layout";
import DashboardFilterComponent, { type SelectedFilter } from "./dashboard-filter";
import { getPanelConstraints } from "./dashboard-layout-constraints";
import { DashboardLayoutProvider, useDashboardLayout } from "./dashboard-layout-provider";
import type {
  Dashboard,
  DashboardGroup,
  FilterSpec,
  PanelDescriptor,
  SQLQuery,
} from "./dashboard-model";
import DashboardPanelContainer, {
  type DashboardPanelContainerRef,
} from "./dashboard-panel-container";
import type { TimeSpan } from "./timespan-selector";

// Helper to check if an item is a DashboardGroup
function isDashboardGroup(item: unknown): item is DashboardGroup {
  return (
    typeof item === "object" &&
    item !== null &&
    "title" in item &&
    "charts" in item &&
    Array.isArray((item as { charts: unknown }).charts)
  );
}

// Generate default layouts from dashboard panels
function generateDefaultLayouts(dashboard: Dashboard): ResponsiveLayouts {
  const allPanels: PanelDescriptor[] = [];
  dashboard.charts.forEach((item) => {
    if (isDashboardGroup(item)) {
      allPanels.push(...item.charts);
    } else {
      allPanels.push(item);
    }
  });

  const lg: LayoutItem[] = [];
  const md: LayoutItem[] = [];
  const sm: LayoutItem[] = [];

  allPanels.forEach((panel, index) => {
    const gridPos = panel.gridPos ?? { w: 24, h: 6 };
    const constraints = getPanelConstraints(panel.type);
    const key = `panel-${index}`;

    lg.push({
      i: key,
      x: gridPos.x ?? (index * 6) % 24,
      y: gridPos.y ?? Math.floor((index * 6) / 24) * 4,
      w: gridPos.w,
      h: gridPos.h,
      ...constraints,
    });

    const mdW = Math.max(constraints.minW, Math.round((gridPos.w / 24) * 6));
    md.push({
      i: key,
      x: (index * 3) % 6,
      y: Math.floor((index * 3) / 6) * 4,
      w: Math.min(mdW, 6),
      h: gridPos.h,
      minW: Math.min(constraints.minW, 6),
      minH: constraints.minH,
      maxW: 6,
      maxH: constraints.maxH,
    });

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

export interface DashboardPageRef {
  setSelectedTimeSpan: (timeSpan: TimeSpan) => void;
  setFilter: (filterName: string, value: string) => void;
}

interface DashboardPageProps {
  panels: Dashboard;
  filterSpecs?: FilterSpec[];
  showInputFilter?: boolean;
  headerActions?: React.ReactNode;
  timezone?: string;
  showTimeSpanSelector?: boolean;
  showRefresh?: boolean;
  showAutoRefresh?: boolean;
  chartSelectionFilterName?: string;
  /**
   * Unique identifier for this dashboard (used for layout persistence).
   * If not provided, layout won't be persisted.
   */
  dashboardId?: string;
  /**
   * Children to render below the dashboard panels.
   * Children can use the useDashboardRefresh hook to register
   * themselves for automatic refresh when the dashboard refreshes.
   */
  children?: React.ReactNode;
  /** Whether to show edit controls for sections (custom dashboards) */
  showSectionEditControls?: boolean;
  /** Callback when section is renamed */
  onSectionRename?: (sectionIndex: number, newTitle: string) => void;
  /** Callback when section is deleted */
  onSectionDelete?: (sectionIndex: number) => void;
  /** Callback when section collapse state changes */
  onSectionCollapseChange?: (sectionIndex: number, collapsed: boolean) => void;
  /** Whether to show the reset layout button (default: true) */
  showResetLayout?: boolean;
}

// Inner component to access layout context
interface DashboardFilterWithResetProps {
  filterRef: React.RefObject<DashboardFilterComponent | null>;
  filterSpecs: FilterSpec[];
  onFilterChange?: (filter: SelectedFilter) => void;
  onTimeSpanChange?: (timeSpan: TimeSpan) => void;
  onLoadSourceData?: (query: SQLQuery) => Promise<string[]>;
  timezone?: string;
  showTimeSpanSelector?: boolean;
  showRefresh?: boolean;
  showAutoRefresh?: boolean;
  headerActions?: React.ReactNode;
  showResetLayout?: boolean;
}

function DashboardFilterWithReset({
  filterRef,
  filterSpecs,
  onFilterChange,
  onTimeSpanChange,
  onLoadSourceData,
  timezone,
  showTimeSpanSelector,
  showRefresh,
  showAutoRefresh,
  headerActions,
  showResetLayout = true,
}: DashboardFilterWithResetProps) {
  const { resetLayout } = useDashboardLayout();

  return (
    <DashboardFilterComponent
      ref={filterRef}
      filterSpecs={filterSpecs}
      onFilterChange={onFilterChange}
      onTimeSpanChange={onTimeSpanChange}
      onLoadSourceData={onLoadSourceData}
      timezone={timezone}
      showTimeSpanSelector={showTimeSpanSelector}
      showRefresh={showRefresh}
      showAutoRefresh={showAutoRefresh}
      onResetLayout={showResetLayout ? resetLayout : undefined}
    >
      {headerActions}
    </DashboardFilterComponent>
  );
}

const DashboardPage = forwardRef<DashboardPageRef, DashboardPageProps>(
  (
    {
      panels,
      filterSpecs,
      showInputFilter = false,
      headerActions,
      timezone = "UTC",
      showTimeSpanSelector = true,
      showRefresh = true,
      showAutoRefresh = false,
      chartSelectionFilterName,
      dashboardId,
      children,
      showSectionEditControls,
      onSectionRename,
      onSectionDelete,
      onSectionCollapseChange,
    },
    ref
  ) => {
    const { connection } = useConnection();

    // Generate default layouts for the layout provider
    const defaultLayouts = useMemo(() => generateDefaultLayouts(panels), [panels]);

    const inputFilterRef = useRef<HTMLInputElement>(null);
    const filterRef = useRef<DashboardFilterComponent>(null);
    const panelsRef = useRef<DashboardPanelContainerRef>(null);

    useImperativeHandle(
      ref,
      () => ({
        setSelectedTimeSpan: (timeSpan: TimeSpan) => {
          filterRef.current?.setSelectedTimeSpan(timeSpan);
        },
        setFilter: (filterName: string, value: string) => {
          filterRef.current?.setFilter(filterName, value);
        },
      }),
      []
    );

    const defaultLoadFilterData = useCallback(
      async (query: SQLQuery) => {
        if (!connection) return [];
        try {
          // Cluster template replacement is now handled by connection.queryOnNode()
          const sql = query.sql;

          const { response } = connection.queryOnNode(sql, {
            default_format: "JSONCompact",
            ...query.params,
          });

          const apiResponse = await response;
          return apiResponse.data
            .json<JSONCompactFormatResponse>()
            .data.map((row: unknown[]) => String(row[0]));
        } catch (caught) {
          console.error(caught);
          return [];
        }
      },
      [connection]
    );

    const refreshPanels = useCallback(
      (timeSpan: TimeSpan, filter: SelectedFilter | undefined, inputFilter?: string) => {
        const parts: string[] = [];
        if (filter?.expr) {
          parts.push(filter.expr);
        }
        if (inputFilter !== undefined) {
          const value = inputFilter || inputFilterRef.current?.value || "";
          if (value) {
            parts.push(value);
          }
        } else {
          const value = inputFilterRef.current?.value || "";
          if (value) {
            parts.push(value);
          }
        }
        const filterExpression = parts.length > 0 ? parts.join(" AND ") : "1=1";
        panelsRef.current?.refresh(timeSpan, filterExpression);
      },
      []
    );

    useLayoutEffect(() => {
      if (filterRef.current) {
        const timeSpan = filterRef.current.getSelectedTimeSpan();
        const filter = filterRef.current.getSelectedFilter();
        refreshPanels(timeSpan, filter);
      }
    }, [refreshPanels]);

    const handleSelectionFilterChange = useCallback(
      (filter: SelectedFilter) => {
        const timeSpan = filterRef.current?.getSelectedTimeSpan();
        if (!timeSpan) {
          return;
        }
        refreshPanels(timeSpan, filter);
      },
      [refreshPanels]
    );

    const handleTimeSpanChange = useCallback(
      (timeSpan: TimeSpan) => {
        const filter = filterRef.current?.getSelectedFilter();
        refreshPanels(timeSpan, filter);
      },
      [refreshPanels]
    );

    const handleInputFilterKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          const inputFilterValue = inputFilterRef.current?.value || "";
          const timeSpan = filterRef.current?.getSelectedTimeSpan();
          const filter = filterRef.current?.getSelectedFilter();
          if (timeSpan) {
            refreshPanels(timeSpan, filter, inputFilterValue);
          }
        }
      },
      [refreshPanels]
    );

    const handleChartSelection = useCallback(
      (timeSpan: TimeSpan, selection: { name: string; series: string; value: number }) => {
        filterRef.current?.setSelectedTimeSpan(timeSpan);
        if (chartSelectionFilterName && selection.series) {
          filterRef.current?.setFilter(chartSelectionFilterName, selection.series);
        }
      },
      [chartSelectionFilterName]
    );

    const hasFilters = filterSpecs && filterSpecs.length > 0;

    const dashboardContent = (
      <div className="flex flex-col h-full w-full overflow-hidden p-2 gap-2">
        {dashboardId ? (
          // With layout provider - use DashboardFilterWithReset for reset button
          <DashboardFilterWithReset
            filterRef={filterRef}
            filterSpecs={hasFilters ? filterSpecs : []}
            onFilterChange={hasFilters ? handleSelectionFilterChange : undefined}
            onTimeSpanChange={handleTimeSpanChange}
            onLoadSourceData={hasFilters ? defaultLoadFilterData : undefined}
            timezone={timezone}
            showTimeSpanSelector={showTimeSpanSelector}
            showRefresh={showRefresh}
            showAutoRefresh={showAutoRefresh}
            headerActions={headerActions}
          />
        ) : (
          // Without layout provider - regular filter without reset
          <DashboardFilterComponent
            ref={filterRef}
            filterSpecs={hasFilters ? filterSpecs : []}
            onFilterChange={hasFilters ? handleSelectionFilterChange : undefined}
            onTimeSpanChange={handleTimeSpanChange}
            onLoadSourceData={hasFilters ? defaultLoadFilterData : undefined}
            timezone={timezone}
            showTimeSpanSelector={showTimeSpanSelector}
            showRefresh={showRefresh}
            showAutoRefresh={showAutoRefresh}
          >
            {headerActions}
          </DashboardFilterComponent>
        )}

        {showInputFilter && (
          <div className="relative">
            <Input
              ref={inputFilterRef}
              className="rounded-l rounded-r pl-2 h-8"
              placeholder="Input filter expression, press ENTER to apply"
              onKeyDown={handleInputFilterKeyDown}
            />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          <DashboardPanelContainer
            ref={panelsRef}
            dashboard={panels}
            dashboardId={dashboardId}
            initialLoading={false}
            onChartSelection={chartSelectionFilterName ? handleChartSelection : undefined}
            showSectionEditControls={showSectionEditControls}
            onSectionRename={onSectionRename}
            onSectionDelete={onSectionDelete}
            onSectionCollapseChange={onSectionCollapseChange}
          >
            {children}
          </DashboardPanelContainer>
        </div>
      </div>
    );

    // Wrap with layout provider if dashboardId is provided
    if (dashboardId) {
      return (
        <DashboardLayoutProvider dashboardId={dashboardId} defaultLayouts={defaultLayouts}>
          {dashboardContent}
        </DashboardLayoutProvider>
      );
    }

    return dashboardContent;
  }
);

export default DashboardPage;

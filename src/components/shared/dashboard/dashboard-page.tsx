"use client";

import { useConnection } from "@/components/connection/connection-context";
import { Input } from "@/components/ui/input";
import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import DashboardFilterComponent, { type SelectedFilter } from "./dashboard-filter";
import type { Dashboard, FilterSpec, SQLQuery } from "./dashboard-model";
import DashboardPanelContainer, {
  type DashboardPanelContainerRef,
} from "./dashboard-panel-container";
import type { TimeSpan } from "./timespan-selector";

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
   * Children to render below the dashboard panels.
   * Children can use the useDashboardRefresh hook to register
   * themselves for automatic refresh when the dashboard refreshes.
   */
  children?: React.ReactNode;
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
      children,
    },
    ref
  ) => {
    const { connection } = useConnection();

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

    useEffect(() => {
      const timer = setTimeout(() => {
        if (filterRef.current) {
          const timeSpan = filterRef.current.getSelectedTimeSpan();
          const filter = filterRef.current.getSelectedFilter();
          refreshPanels(timeSpan, filter);
        }
      }, 0);

      return () => clearTimeout(timer);
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

    return (
      <div className="flex flex-col h-full w-full overflow-hidden p-2 gap-2">
        {hasFilters && (
          <DashboardFilterComponent
            ref={filterRef}
            filterSpecs={filterSpecs}
            onFilterChange={handleSelectionFilterChange}
            onTimeSpanChange={handleTimeSpanChange}
            onLoadSourceData={defaultLoadFilterData}
            timezone={timezone}
            showTimeSpanSelector={showTimeSpanSelector}
            showRefresh={showRefresh}
            showAutoRefresh={showAutoRefresh}
          >
            {headerActions}
          </DashboardFilterComponent>
        )}

        {!hasFilters && (
          <DashboardFilterComponent
            ref={filterRef}
            filterSpecs={[]}
            onTimeSpanChange={handleTimeSpanChange}
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
            initialLoading={false}
            onChartSelection={chartSelectionFilterName ? handleChartSelection : undefined}
          >
            {children}
          </DashboardPanelContainer>
        </div>
      </div>
    );
  }
);

export default DashboardPage;

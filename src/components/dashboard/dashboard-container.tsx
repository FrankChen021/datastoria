"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Dashboard } from "./dashboard-model";
import DashboardPanels, { type DashboardPanelsRef } from "./dashboard-panels";
import type { TimeSpan } from "./timespan-selector";
import TimeSpanSelector, { BUILT_IN_TIME_SPAN_LIST } from "./timespan-selector";

export interface DashboardContainerRef {
  refresh: (timeSpan?: TimeSpan) => void;
}

interface DashboardViewProps {
  dashboard: Dashboard;
  searchParams?: Record<string, unknown> | URLSearchParams;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
}

const DashboardContainer = forwardRef<DashboardContainerRef, DashboardViewProps>(
  ({ dashboard, searchParams = {}, headerActions, children }, ref) => {
    const filterRef = useRef<TimeSpanSelector | null>(null);
    const panelsRef = useRef<DashboardPanelsRef>(null);
    const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | null>(null);

    // Provide a default DisplayTimeSpan instance
    const defaultTimeSpan = useMemo(() => {
      return BUILT_IN_TIME_SPAN_LIST[3];
    }, []);

    const onQueryConditionChange = useCallback(() => {
      // Update the time span state when selector changes
      if (filterRef.current) {
        const selectedTimeSpan = filterRef.current.getSelectedTimeSpan();
        if (selectedTimeSpan) {
          // Use getTimeSpan() which caches the result
          const timeSpan = selectedTimeSpan.getTimeSpan();
          setSelectedTimeSpan(timeSpan);
        }
      }
    }, []);

    // Initialize time span state on mount
    useEffect(() => {
      if (!selectedTimeSpan) {
        if (filterRef.current) {
          const selectedTimeSpan = filterRef.current.getSelectedTimeSpan();
          if (selectedTimeSpan) {
            setSelectedTimeSpan(selectedTimeSpan.getTimeSpan());
          } else {
            setSelectedTimeSpan(defaultTimeSpan.getTimeSpan());
          }
        } else {
          setSelectedTimeSpan(defaultTimeSpan.getTimeSpan());
        }
      }
    }, [defaultTimeSpan, selectedTimeSpan]);

    // Memoize the TimeSpan object to prevent unnecessary prop changes
    const currentTimeSpan = useMemo(() => {
      // Use state if available (updated via onQueryConditionChange)
      if (selectedTimeSpan) {
        return selectedTimeSpan;
      }
      // Fallback: get from filterRef if state not initialized yet
      if (filterRef.current) {
        const selectedTimeSpan = filterRef.current.getSelectedTimeSpan();
        if (selectedTimeSpan) {
          return selectedTimeSpan.getTimeSpan();
        }
      }
      // Final fallback to default
      return defaultTimeSpan.getTimeSpan();
    }, [selectedTimeSpan, defaultTimeSpan]);

    // Expose refresh method via imperative handle
    useImperativeHandle(
      ref,
      () => ({
        refresh: (timeSpan?: TimeSpan) => {
          if (timeSpan) {
            setSelectedTimeSpan(timeSpan);
            // Refresh panels with the new time span
            setTimeout(() => {
              panelsRef.current?.refresh(timeSpan);
            }, 10);
          } else {
            // Refresh panels with current time span
            panelsRef.current?.refresh(currentTimeSpan);
          }
        },
      }),
      [currentTimeSpan]
    );

    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Time span selector and header actions - fixed at top */}
        <div className="flex-shrink-0 flex justify-end items-center gap-2 pt-2 pb-2">
          {headerActions}
          <TimeSpanSelector
            ref={filterRef}
            size="sm"
            defaultTimeSpan={defaultTimeSpan}
            onSelectedSpanChanged={onQueryConditionChange}
          />
        </div>

        {/* Dashboard panels */}
        <DashboardPanels
          ref={panelsRef}
          dashboard={dashboard}
          selectedTimeSpan={currentTimeSpan}
          searchParams={searchParams}
          children={children}
        />
      </div>
    );
  }
);

DashboardContainer.displayName = "DashboardView";

export default DashboardContainer;

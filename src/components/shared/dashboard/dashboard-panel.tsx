import React from "react";
import type { PanelDescriptor, StatDescriptor } from "./dashboard-model";
import type { DashboardPanelComponent } from "./dashboard-panel-layout";
import { DashboardPanelNew } from "./dashboard-panel-new";
import DashboardPanelStat from "./dashboard-panel-stat";
import type { TimeSpan } from "./timespan-selector";

interface DashboardPanelProps {
  descriptor: PanelDescriptor;
  selectedTimeSpan?: TimeSpan;
  initialLoading?: boolean;
  onRef?: (ref: DashboardPanelComponent | null) => void;
  onCollapsedChange?: (isCollapsed: boolean) => void;
  onTimeSpanSelect?: (timeSpan: TimeSpan) => void;
  className?: string;
}

/**
 * Factory component to render different panel types
 * Used for both main dashboard panels and drilldown panels
 *
 * REFACTORING IN PROGRESS:
 * - Table, Pie, Transpose-table, Timeseries: Uses new refactored architecture (DashboardPanelNew)
 * - Others: Still using legacy components
 */
export const DashboardPanel: React.FC<DashboardPanelProps> = ({
  descriptor,
  selectedTimeSpan,
  initialLoading,
  onRef,
  onCollapsedChange,
  onTimeSpanSelect,
  className,
}) => {
  // Defensive check: ensure descriptor exists and has a type property
  if (!descriptor || !descriptor.type) {
    return <pre>Invalid descriptor: {JSON.stringify(descriptor, null, 2)}</pre>;
  }

  // Use new refactored implementation for table, pie, transpose-table, and timeseries
  if (
    descriptor.type === "table" ||
    descriptor.type === "pie" ||
    descriptor.type === "transpose-table" ||
    descriptor.type === "line" ||
    descriptor.type === "bar" ||
    descriptor.type === "area"
  ) {
    return (
      <DashboardPanelNew
        ref={onRef}
        descriptor={descriptor}
        selectedTimeSpan={selectedTimeSpan}
        initialLoading={initialLoading}
        onCollapsedChange={onCollapsedChange}
        onTimeSpanSelect={onTimeSpanSelect}
        className={className}
      />
    );
  }

  // Legacy implementations for other types
  if (descriptor.type === "stat") {
    return (
      <DashboardPanelStat
        ref={onRef}
        descriptor={descriptor as StatDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        initialLoading={initialLoading}
        onCollapsedChange={onCollapsedChange}
      />
    );
  }

  return null;
};

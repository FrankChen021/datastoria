import React from "react";
import type {
    PanelDescriptor,
    StatDescriptor,
    TableDescriptor,
    TimeseriesDescriptor,
    TransposeTableDescriptor,
} from "./dashboard-model";
import type { DashboardPanelComponent } from "./dashboard-panel-layout";
import DashboardPanelStat from "./dashboard-panel-stat";
import DashboardPanelTable from "./dashboard-panel-table";
import DashboardPanelTimeseries from "./dashboard-panel-timeseries";
import DashboardPanelTransposedTable from "./dashboard-panel-tranposd-table";
import type { TimeSpan } from "./timespan-selector";

interface DashboardPanelFactoryProps {
  descriptor: PanelDescriptor;
  selectedTimeSpan?: TimeSpan;
  initialLoading?: boolean;
  onRef?: (ref: DashboardPanelComponent | null) => void;
}

/**
 * Factory component to render different panel types
 * Used for both main dashboard panels and drilldown panels
 */
export const DashboardPanelFactory: React.FC<DashboardPanelFactoryProps> = ({
  descriptor,
  selectedTimeSpan,
  initialLoading,
  onRef,
}) => {
  if (descriptor.type === "stat") {
    return (
      <DashboardPanelStat
        ref={onRef}
        descriptor={descriptor as StatDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        initialLoading={initialLoading}
      />
    );
  }

  if (descriptor.type === "line" || descriptor.type === "bar" || descriptor.type === "area") {
    return (
      <DashboardPanelTimeseries
        ref={onRef}
        descriptor={descriptor as TimeseriesDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        initialLoading={initialLoading}
      />
    );
  }

  if (descriptor.type === "table") {
    return (
      <DashboardPanelTable
        ref={onRef}
        descriptor={descriptor as TableDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        initialLoading={initialLoading}
      />
    );
  }

  if (descriptor.type === "transpose-table") {
    return (
      <DashboardPanelTransposedTable
        ref={onRef}
        descriptor={descriptor as TransposeTableDescriptor}
        selectedTimeSpan={selectedTimeSpan}
        initialLoading={initialLoading}
      />
    );
  }

  return null;
};


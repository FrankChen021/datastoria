import DashboardContainer from "@/components/shared/dashboard/dashboard-container";
import type { Dashboard, DashboardGroup } from "@/components/shared/dashboard/dashboard-model";
import { memo } from "react";
import { clusterMetricsDashboard } from "./dashboards/cluster-metrics";
import { clusterStatusDashboard } from "./dashboards/cluster-status";

export const ClusterTab = memo(() => {
  const dashboard = {
    version: 2,
    charts: [
      {
        title: "Cluster Status",
        collapsed: false,
        charts: clusterStatusDashboard,
      } as DashboardGroup,
      {
        title: "Cluster Metrics",
        collapsed: false,
        charts: clusterMetricsDashboard,
      } as DashboardGroup,
    ],
  } as Dashboard;

  return (
    <div className="flex flex-col px-2" style={{ height: "calc(100vh - 49px)" }}>
      <DashboardContainer dashboard={dashboard} headerActions={null} />
    </div>
  );
});

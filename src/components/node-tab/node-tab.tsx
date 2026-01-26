import { useConnection } from "@/components/connection/connection-context";
import type { Dashboard, DashboardGroup } from "@/components/shared/dashboard/dashboard-model";
import DashboardPage from "@/components/shared/dashboard/dashboard-page";
import { memo } from "react";
import { nodeMergeDashboard } from "./dashboards/node-merge";
import { nodeMetricsDashboard } from "./dashboards/node-metrics";
import { nodeOverviewDashboard } from "./dashboards/node-overview";
import { nodeReplicationDashboard } from "./dashboards/node-replication";
import { nodeZkMetricsDashboard } from "./dashboards/node-zk-metrics";
import { queryDashboard } from "./dashboards/query";

interface NodeTabProps {
  host: string;
}

export const NodeTab = memo((_props: NodeTabProps) => {
  const { connection } = useConnection();

  const dashboard: Dashboard = {
    version: 3,
    filter: {},
    charts: [
      {
        title: "Node Status",
        collapsed: false,
        charts: nodeOverviewDashboard,
      } as DashboardGroup,
      {
        title: "Node Queries",
        collapsed: false,
        charts: queryDashboard,
      } as DashboardGroup,
    ],
  };

  // Filter out charts that are not supported in lower version of ClickHouse
  dashboard.charts.push({
    title: "Node Merges",
    collapsed: false,
    charts: nodeMergeDashboard.filter((chart) => {
      return (
        (connection!.metadata.metric_log_table_has_ProfileEvent_MergeSourceParts ||
          !chart.datasource.sql.includes("ProfileEvent_MergeSourceParts")) &&
        (connection!.metadata.metric_log_table_has_ProfileEvent_MutationTotalParts ||
          !chart.datasource.sql.includes("ProfileEvent_MutationTotalParts"))
      );
    }),
  } as DashboardGroup);

  dashboard.charts.push({
    title: "Node Replication",
    collapsed: false,
    charts: nodeReplicationDashboard,
  } as DashboardGroup);

  dashboard.charts.push({
    title: "Node Metrics",
    collapsed: false,
    charts: nodeMetricsDashboard,
  } as DashboardGroup);

  dashboard.charts.push({
    title: "Node ZooKeeper Metrics",
    collapsed: true,
    charts: nodeZkMetricsDashboard,
  } as DashboardGroup);

  return (
    <div className="flex flex-col px-2" style={{ height: "calc(100vh - 49px)" }}>
      <DashboardPage panels={dashboard} headerActions={null} />
    </div>
  );
});

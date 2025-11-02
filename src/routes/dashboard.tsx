import type { StatDescriptor } from "@/components/dashboard/chart-utils";
import DashboardContainer from "@/components/dashboard/dashboard-container";
import type { Dashboard } from "@/components/dashboard/dashboard-model";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

const dashboard = {
  name: "metrics",
  folder: "metrics",
  title: "Metrics",
  filter: {
    defaultTimeSpan: "1h",
  },
  charts: [
    {
      type: "stat",
      title: "Uptime",
      description: "CPU usage of the server",
      query: {
        sql: "SELECT uptime()",
      },
    },
  ],
} as Dashboard;

function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Metrics</h1>
      <DashboardContainer dashboard={dashboard} />
    </div>
  );
}

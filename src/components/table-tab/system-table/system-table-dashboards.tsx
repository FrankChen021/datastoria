import { useConnection } from "@/components/connection/connection-context";
import DashboardContainer from "@/components/shared/dashboard/dashboard-container";
import { DashboardGroupSection } from "@/components/shared/dashboard/dashboard-group-section";
import type {
  Dashboard,
  DashboardGroup,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/use-dialog";
import { type QueryResponse } from "@/lib/connection/connection";
import { AlertTriangle, EllipsisVertical } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

interface DashboardRow {
  dashboard: string;
  title: string;
  query: string;
}

interface SkippedDashboard {
  dashboard: string;
  title: string;
  query: string;
  reason: string;
}

interface SystemTableDashboardsProps {
  database: string;
  table: string;
}

const SystemTableDashboards = ({ database, table }: SystemTableDashboardsProps) => {
  const { connection } = useConnection();
  const [dashboard, setDashboard] = useState<Dashboard>({
    filter: {},
    charts: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [skippedDashboards, setSkippedDashboards] = useState<SkippedDashboard[]>([]);
  const previousConnectionRef = useRef<string | null>(null);

  const fetchDashboards = useCallback(
    (hasMetricLogTable: boolean, hasAsynchronousMetricLogTable: boolean) => {
      // Fetch dashboard definitions from system.dashboards (without predefined dashboard)
      if (!connection) return;

      connection
        .query(
          "SELECT dashboard, title, query FROM system.dashboards ORDER BY dashboard, title",
          {
            default_format: "JSON",
            output_format_json_quote_64bit_integers: 0,
          },
          {
            "Content-Type": "text/plain",
          }
        )
        .response.then((response: QueryResponse) => {
          try {
            const responseData = response.data.json<any>();
            const rows = responseData.data || [];
            const meta = responseData.meta || [];

            // Build column map
            const columnMap = new Map<string, number>();
            meta.forEach((colMeta: { name: string }, index: number) => {
              columnMap.set(colMeta.name, index);
            });

            // Group rows by dashboard category
            const dashboardMap = new Map<string, DashboardRow[]>();

            // Check if rows are arrays or objects
            const firstRow = rows[0];
            const isArrayFormat = Array.isArray(firstRow);

            rows.forEach((row: unknown) => {
              let dashboardName: string;
              let title: string;
              let query: string;

              if (isArrayFormat) {
                // Array format: row is [value1, value2, ...]
                const rowArray = row as unknown[];
                const dashboardIndex = columnMap.get("dashboard");
                const titleIndex = columnMap.get("title");
                const queryIndex = columnMap.get("query");

                if (
                  dashboardIndex === undefined ||
                  titleIndex === undefined ||
                  queryIndex === undefined
                ) {
                  return;
                }

                dashboardName = String(rowArray[dashboardIndex] ?? "");
                title = String(rowArray[titleIndex] ?? "");
                query = String(rowArray[queryIndex] ?? "");
              } else {
                // Object format: row is {column1: value1, column2: value2, ...}
                const rowObject = row as Record<string, unknown>;
                dashboardName = String(rowObject["dashboard"] ?? "");
                title = String(rowObject["title"] ?? "");
                query = String(rowObject["query"] ?? "");
              }

              // Validate extracted values
              if (!dashboardName || dashboardName === "undefined" || !title || !query) {
                return;
              }

              if (!dashboardMap.has(dashboardName)) {
                dashboardMap.set(dashboardName, []);
              }
              dashboardMap.get(dashboardName)!.push({ dashboard: dashboardName, title, query });
            });

            // Convert each row to a timeseries chart, grouped by dashboard name
            const dashboardGroups: DashboardGroup[] = [];
            const skipped: SkippedDashboard[] = [];

            dashboardMap.forEach((dashboardRows, dashboardName) => {
              const groupCharts: TimeseriesDescriptor[] = [];

              dashboardRows.forEach((row, index) => {
                // Validate row data
                if (!row.title || !row.query) {
                  return;
                }

                // Check if query references metric_log or asynchronous_metric_log
                const queryLower = row.query.toLowerCase();
                const referencesMetricLog =
                  queryLower.includes("metric_log") &&
                  !queryLower.includes("asynchronous_metric_log");
                const referencesAsynchronousMetricLog =
                  queryLower.includes("asynchronous_metric_log");

                // Skip if query references metric_log but table doesn't exist
                if (referencesMetricLog && !hasMetricLogTable) {
                  skipped.push({
                    dashboard: row.dashboard,
                    title: row.title,
                    query: row.query,
                    reason: "metric_log table not available",
                  });
                  return;
                }

                // Skip if query references asynchronous_metric_log but table doesn't exist
                if (referencesAsynchronousMetricLog && !hasAsynchronousMetricLogTable) {
                  skipped.push({
                    dashboard: row.dashboard,
                    title: row.title,
                    query: row.query,
                    reason: "asynchronous_metric_log table not available",
                  });
                  return;
                }

                const chartTitle = row.title || `Chart ${index}`;

                groupCharts.push({
                  type: "line" as const,
                  titleOption: {
                    title: chartTitle,
                  },
                  width: 1, // Default width
                  collapsed: false,
                  yAxis: [{}], // Default y-axis
                  query: {
                    sql: row.query,
                  },
                });
              });

              // Create a group for this dashboard name if it has charts
              if (groupCharts.length > 0) {
                dashboardGroups.push({
                  title: dashboardName,
                  charts: groupCharts,
                  collapsed: true,
                });
              }
            });

            // Track skipped dashboards in state for separate rendering
            setSkippedDashboards(skipped);

            const mergedDashboard: Dashboard = {
              name: "dashboard",
              filter: {},
              charts: dashboardGroups,
            };

            setDashboard(mergedDashboard);
            setError(null);
          } catch (err) {
            console.error("Error processing dashboard data:", err);
            setError(null);
          }
        })
        .catch((error) => {
          console.error("Error fetching dashboard data:", error);
          setError(null);
        });
    },
    [connection]
  );

  useEffect(() => {
    if (!connection) {
      return;
    }

    // Skip if connection hasn't changed
    const connectionId = connection.name;
    if (previousConnectionRef.current === connectionId) {
      return;
    }
    previousConnectionRef.current = connectionId;

    // First, check if metric_log and asynchronous_metric_log tables exist
    connection
      .query(
        `SELECT name FROM system.tables WHERE database = 'system' AND (name LIKE 'metric_log%' OR name LIKE 'asynchronous_metric_log%')`,
        {
          default_format: "JSON",
          output_format_json_quote_64bit_integers: 0,
        },
        {
          "Content-Type": "text/plain",
        }
      )
      .response.then((response: QueryResponse) => {
        try {
          const responseData = response.data.json<any>();
          const rows = responseData.data || [];
          const meta = responseData.meta || [];

          // Build column map
          const columnMap = new Map<string, number>();
          meta.forEach((colMeta: { name: string }, index: number) => {
            columnMap.set(colMeta.name, index);
          });

          // Check row format
          const firstRow = rows[0];
          const isArrayFormat = Array.isArray(firstRow);

          let hasMetricLogTable = false;
          let hasAsynchronousMetricLogTable = false;

          rows.forEach((row: unknown) => {
            let tableName: string;

            if (isArrayFormat) {
              const rowArray = row as unknown[];
              const nameIndex = columnMap.get("name");
              if (nameIndex !== undefined) {
                tableName = String(rowArray[nameIndex] ?? "");
              } else {
                return;
              }
            } else {
              const rowObject = row as Record<string, unknown>;
              tableName = String(rowObject["name"] ?? "");
            }

            if (tableName.startsWith("metric_log")) {
              hasMetricLogTable = true;
            }
            if (tableName.startsWith("asynchronous_metric_log")) {
              hasAsynchronousMetricLogTable = true;
            }
          });

          // Now fetch dashboard definitions
          fetchDashboards(hasMetricLogTable, hasAsynchronousMetricLogTable);
        } catch (err) {
          console.error("Error checking metric_log tables:", err);
          // Continue with fetching dashboards anyway
          fetchDashboards(false, false);
        }
      })
      .catch((error) => {
        console.error("Error checking metric_log tables:", error);
        // Continue with fetching dashboards anyway
        fetchDashboards(false, false);
      });
  }, [connection, fetchDashboards, database, table]);

  const headerActions = null;

  if (error) {
    return (
      <div className="px-2 pt-2">
        <div className="flex items-center justify-center h-screen">
          <div className="text-destructive">
            <p className="font-semibold">Error loading dashboard:</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-2" style={{ height: "calc(100vh - 49px)" }}>
      <DashboardContainer dashboard={dashboard} headerActions={headerActions}>
        {/* Render the skipped dashboards if any at the bottom of the container */}
        {skippedDashboards.length > 0 && (
          <DashboardGroupSection
            title={
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-semibold">Skipped Dashboards</span>
              </div>
            }
            defaultOpen={false}
          >
            <div className="card-container flex flex-wrap gap-1">
              {skippedDashboards.map((s, i) => (
                <div
                  key={`skipped-${i}`}
                  style={{ width: `calc(${(1 / 4) * 100}% - ${(3 * 0.25) / 4}rem)` }}
                >
                  <Card className="relative">
                    <CardHeader className="p-0">
                      <div className="flex items-center p-2 bg-muted/50 transition-colors gap-2">
                        <div className="flex-1 text-left">
                          <CardTitle className="m-0 text-left text-base">{s.title}</CardTitle>
                        </div>
                        <div className="pr-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 p-0 flex items-center justify-center hover:ring-2 hover:ring-foreground/20"
                            title="Show query"
                            aria-label="Show query"
                            onClick={() => {
                              Dialog.showDialog({
                                title: s.title || "Query",
                                description: s.dashboard ? `Dashboard: ${s.dashboard}` : undefined,
                                className: "max-w-[800px] max-h-[80vh]",
                                mainContent: (
                                  <div className="mt-2 overflow-x-auto">
                                    <ThemedSyntaxHighlighter
                                      language="sql"
                                      customStyle={{ margin: 0, borderRadius: "0.375rem" }}
                                    >
                                      {s.query || ""}
                                    </ThemedSyntaxHighlighter>
                                  </div>
                                ),
                                dialogButtons: [
                                  { text: "OK", onClick: async () => true, default: true },
                                ],
                              });
                            }}
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm ">
                      <div className="pt-6">Reason: {s.reason}</div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </DashboardGroupSection>
        )}
      </DashboardContainer>
    </div>
  );
};

export default memo(SystemTableDashboards);

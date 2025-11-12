import type { StatDescriptor, TableDescriptor, TimeseriesDescriptor } from "@/components/dashboard/chart-utils";
import DashboardContainer from "@/components/dashboard/dashboard-container";
import { DashboardGroupSection } from "@/components/dashboard/dashboard-group-section";
import type { Dashboard, DashboardGroup } from "@/components/dashboard/dashboard-model";
import { OpenDatabaseTabButton } from "@/components/table-tab/open-database-tab-button";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/use-dialog";
import { Api, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { AlertTriangle, EllipsisVertical } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

const predefinedDashboard = {
  name: "metrics",
  folder: "metrics",
  title: "Metrics",
  filter: {},
  charts: [
    {
      title: "Server Status",
      isCollapsed: false,
      charts: [
        {
          type: "stat",
          titleOption: {
            title: "Server Version",
          },
          width: 1,
          description: "The version of the server",
          query: {
            sql: "SELECT version()",
          },
        },
        {
          type: "stat",
          titleOption: {
            title: "Server UP Time",
          },
          width: 1,
          description: "How long the server has been running",
          query: {
            sql: "SELECT uptime() * 1000",
          },
          valueOption: {
            format: "timeDuration",
          },
        },

        {
          type: "stat",
          titleOption: {
            title: "Warnings",
          },
          width: 1,
          description: "How long the server has been running",
          query: {
            sql: "SELECT count() FROM system.warnings",
          },
          drilldown: {
            warnings: {
              type: "table",
              titleOption: {
                title: "Warnings",
                description: "The number of warnings on the server",
              },
              query: {
                sql: "SELECT * FROM system.warnings",
              },
            } as TableDescriptor,
          },
        },

        {
          type: "stat",
          titleOption: {
            title: "Last Error",
          },
          width: 1,
          description: "How long the server has been running",
          query: {
            sql: "SELECT toUnixTimestamp(max(last_error_time)) * 1000 FROM system.errors",
          },
          valueOption: {
            format: "timeDiff"
          },
          drilldown: {
            warnings: {
              type: "table",
              titleOption: {
                title: "Warnings",
                description: "The number of warnings on the server",
              },
              query: {
                sql: "SELECT * FROM system.errors ORDER BY last_error_time DESC",
              },
              sortOption: {
                initialSort: {
                  column: "last_error_time",
                  direction: "desc",
                },
              },
            } as TableDescriptor,
          },
        },

        {
          type: "stat",
          titleOption: {
            title: "Databases",
          },
          width: 1,
          description: "The number of databases on the server",
          query: {
            sql: "SELECT count() FROM system.databases",
          },
          drilldown: {
            databases: {
              type: "table",
              titleOption: {
                title: "Databases",
                description: "The number of databases on the server",
              },
              width: 1,
              fieldOptions: {
                name: {
                  title: "Name",
                  format: (name) => {
                    const databaseName = name as string;
                    return <OpenDatabaseTabButton variant="shadcn-link" database={databaseName} />;
                  },
                },
                size: {
                  title: "Size",
                  format: "binary_size",
                },
                rows: {
                  title: "Rows",
                  format: "comma_number",
                },
                percentage: {
                  title: "Size Percentage of Total",
                  format: "percentage_bar",
                  formatArgs: [100, 16],
                  width: 100,
                },
              },
              query: {
                sql: `SELECT 
    A.name, B.size, B.rows, B.percentage
FROM system.databases AS A
LEFT JOIN (
    SELECT
        database,
        sum(bytes_on_disk) AS size,
        sum(rows) as rows,
        round(100 * size / (SELECT sum(bytes_on_disk) FROM system.parts WHERE active=1), 2) as percentage
    FROM system.parts
    WHERE active = 1
    GROUP BY
        database
    )
AS B
ON A.name = B.database
ORDER BY B.size DESC`,
              },
            } as TableDescriptor,
          },
        } as unknown as StatDescriptor,
        {
          type: "stat",
          titleOption: {
            title: "Tables",
          },
          width: 1,
          description: "The number of databases on the server",
          query: {
            sql: "SELECT count() FROM system.tables",
          },
          valueOption: {},
        },
        {
          type: "stat",
          titleOption: {
            title: "Total Size of tables",
          },
          width: 1,
          description: "Total size of all active parts",
          query: {
            sql: `SELECT sum(bytes_on_disk) FROM system.parts WHERE active = 1`,
          },
          valueOption: {
            format: "binary_size",
          },
          drilldown: {
            "table-size": {
              type: "table",
              titleOption: {
                title: "Table Size",
                description: "The size of all tables",
              },
              width: 1,
              fieldOptions: {
                database: {
                  format: (database) => {
                    return <OpenDatabaseTabButton database={database as string} />;
                  },
                },
                table: {
                  format: (table, _param: unknown, row: unknown) => {
                    const rowData = row as Record<string, unknown>;
                    const database = rowData.database as string;
                    const engine = rowData.engine as string;
                    const tableName = table as string;
                    return (
                      <OpenTableTabButton database={database} table={tableName} engine={engine} showDatabase={false} />
                    );
                  },
                },
                size: {
                  title: "Size",
                  format: "binary_size",
                },
                pct_of_total: {
                  title: "Percentage",
                  format: "percentage_bar",
                  formatArgs: [100, 16],
                  width: 100,
                },
              },
              sortOption: {
                initialSort: {
                  column: "size",
                  direction: "desc",
                },
              },
              query: {
                sql: `
SELECT A.*, B.engine FROM 
(
    WITH (
        SELECT sum(bytes_on_disk)
        FROM system.parts
        WHERE active = 1
    ) AS total_size
    SELECT
        database,
        table,
        round(100 * sum(bytes_on_disk) / total_size, 2) AS pct_of_total,
        sum(bytes_on_disk) AS size
    FROM system.parts
    WHERE active = 1
    GROUP BY
        database,
        table
    ORDER BY
        size DESC
) AS A
JOIN
(
    SELECT * FROM system.tables
) AS B
ON A.table = B.name`,
              },
            } as TableDescriptor,
          },
        } as unknown as StatDescriptor,
        {
          type: "stat",
          titleOption: {
            title: "Used Storage",
          },
          width: 1,
          description: "The number of databases on the server",
          query: {
            sql: `SELECT round((1 - sum(free_space) / sum(total_space)) * 100, 2) AS used_percent
              FROM system.disks`,
          },
          valueOption: {
            format: "percentage",
          },
          drilldown: {
            "used-storage": {
              type: "table",
              titleOption: {
                title: "Used Storage",
                description: "The used storage of all disks",
              },
              width: 1,
              fieldOptions: {
                name: {
                  title: "Name",
                },
                path: {
                  title: "Path",
                },
                used_percent: {
                  title: "Used Percent",
                  format: "percentage_bar",
                  formatArgs: [100, 16],
                  width: 100,
                },
              },
              query: {
                sql: `SELECT name, path, round((1 - free_space / total_space) * 100, 2) AS used_percent FROM system.disks`,
              },
            } as TableDescriptor,
          },
        } as unknown as StatDescriptor,
        {
          type: "stat",
          titleOption: {
            title: "Ongoing Merges",
          },
          width: 1,
          description: "The number of ongoing merges",
          query: {
            sql: `SELECT count() FROM system.merges`,
          },
          drilldown: {
            "ongoing-merges": {
              type: "table",
              titleOption: {
                title: "Ongoing Merges",
                description: "The ongoing merges",
              },
              width: 1,
              fieldOptions: {
                table: {
                  title: "Table",
                },
                result_part_name: {
                  title: "Result Part Name",
                },
                num_parts: {
                  title: "Number of Parts",
                  format: "comma_number",
                },
                elapsed: {
                  title: "Elapsed",
                  format: "timeDuration",
                },
                progress: {
                  title: "Progress",
                  format: "percentage_bar",
                  formatArgs: [100, 16],
                  width: 50,
                },
                is_mutation: {
                  title: "Is Mutation",
                },
                total_size_bytes_compressed: {
                  title: "Total Size",
                  format: "binary_size",
                },
                bytes_read_uncompressed: {
                  title: "Bytes Read",
                  format: "binary_size",
                },
                rows_read: {
                  title: "Rows Read",
                  format: "comma_number",
                },
                bytes_written_uncompressed: {
                  title: "Bytes Written",
                  format: "binary_size",
                },
                rows_written: {
                  title: "Rows Written",
                  format: "comma_number",
                },
                columns_written: {
                  title: "Columns Written",
                  format: "comma_number",
                },
                memory_usage: {
                  title: "Memory Usage",
                  format: "binary_size",
                },
              },
              sortOption: {
                initialSort: {
                  column: "elapsed",
                  direction: "desc",
                },
              },
              query: {
                sql: `
SELECT 
    database || '.' || table AS table,
    result_part_name,  
    elapsed * 1000 AS elapsed, 
    progress * 100 AS progress, 
    is_mutation,  
    length(source_part_names) as num_parts,
    total_size_bytes_compressed,
    bytes_read_uncompressed,
    rows_read,
    bytes_written_uncompressed,
    rows_written,
    columns_written,
    memory_usage
FROM system.merges 
ORDER BY elapsed DESC
`,
              },
            } as TableDescriptor,
          },
        } as unknown as StatDescriptor,
        {
          type: "stat",
          titleOption: {
            title: "Ongoing Mutations",
          },
          width: 1,
          description: "The number of ongoing mutations",
          query: {
            sql: `SELECT count() FROM system.mutations WHERE is_done = 0`,
          },
          drilldown: {
            "ongoing-mutations": {
              type: "table",
              titleOption: {
                title: "Ongoing Mutations",
                description: "The number of ongoing mutations",
              },
              width: 1,
              fieldOptions: {
                database: {
                  title: "Database",
                },
                table: {
                  title: "Table",
                },
                create_time: {
                  title: "Create Time",
                  format: "dateTime",
                },
                mutation_id: {
                  title: "Mutation ID",
                },
                command: {
                  title: "Command",
                },
                parts_to_do: {
                  title: "Parts to Do",
                  format: "comma_number",
                },
                latest_fail_time: {
                  title: "Latest Fail Time",
                  format: "dateTime",
                },
                latest_fail_reason: {
                  title: "Latest Fail Reason",
                },
              },
              sortOption: {
                initialSort: {
                  column: "create_time",
                  direction: "desc",
                },
              },
              query: {
                sql: `SELECT database, table, create_time, mutation_id, command, parts_to_do, latest_fail_time, latest_fail_reason FROM system.mutations WHERE is_done = 0 ORDER BY create_time DESC`,
              },
            } as TableDescriptor,
          },
        } as unknown as StatDescriptor,
        {
          type: "stat",
          titleOption: {
            title: "Running queries",
          },
          width: 1,
          description: "The number of running queries",
          query: {
            sql: `SELECT count() FROM system.processes`,
          },
          drilldown: {
            "running-queries": {
              type: "table",
              titleOption: {
                title: "Running Queries",
                description: "The running queries",
              },
              width: 1,
              fieldOptions: {
                query_kind: {
                  align: "center",
                },
                query: {
                  format: "sql",
                },
                elapsed: {
                  align: "center",
                  format: "seconds",
                },
                read_rows: {
                  align: "center",
                  format: "comma_number",
                },
                read_bytes: {
                  align: "center",
                  format: "binary_size",
                },
                written_rows: {
                  align: "center",
                  format: "comma_number",
                },
                written_bytes: {
                  align: "center",
                  format: "binary_size",
                },
                memory_usage: {
                  align: "center",
                  format: "binary_size",
                },
                peak_memory_usage: {
                  align: "center",
                  format: "binary_size",
                },
                ProfileEvents: {
                  align: "center",
                  format: "map",
                },
              },
              query: {
                sql: `SELECT * FROM system.processes`,
              },
            } as TableDescriptor,
          },
        } as unknown as StatDescriptor,
      ],
    } as DashboardGroup,
  ],
} as Dashboard;

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

interface ServerTabProps {
  host: string;
}

const ServerTabComponent = ({ host }: ServerTabProps) => {
  const { selectedConnection } = useConnection();
  const [dashboard, setDashboard] = useState<Dashboard>(predefinedDashboard);
  const [error, setError] = useState<string | null>(null);
  const [skippedDashboards, setSkippedDashboards] = useState<SkippedDashboard[]>([]);
  const previousConnectionRef = useRef<string | null>(null);

  const fetchDashboards = useCallback(
    (api: Api, hasMetricLogTable: boolean, hasAsynchronousMetricLogTable: boolean) => {
      // Fetch dashboard definitions from system.dashboards and merge with predefined dashboard
      api.executeSQL(
        {
          sql: "SELECT dashboard, title, query FROM system.dashboards ORDER BY dashboard, title",
          headers: {
            "Content-Type": "text/plain",
          },
          params: {
            default_format: "JSON",
            output_format_json_quote_64bit_integers: 0,
          },
        },
        (response: ApiResponse) => {
          try {
            const responseData = response.data;
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

                if (dashboardIndex === undefined || titleIndex === undefined || queryIndex === undefined) {
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
                  queryLower.includes("metric_log") && !queryLower.includes("asynchronous_metric_log");
                const referencesAsynchronousMetricLog = queryLower.includes("asynchronous_metric_log");

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

                const chartId = `timeseries_chart_${dashboardName}_${index}`;
                const chartTitle = row.title || `Chart ${index}`;

                groupCharts.push({
                  type: "line" as const,
                  id: chartId,
                  titleOption: {
                    title: chartTitle,
                  },
                  width: 1, // Default width
                  isCollapsed: false,
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

            // We no longer track skipped dashboards in state; they are rendered as a final group

            // Merge predefined dashboard charts with groups from system.dashboards
            const mergedCharts = [...predefinedDashboard.charts, ...dashboardGroups] as Dashboard["charts"];

            // Track skipped dashboards in state for separate rendering
            setSkippedDashboards(skipped);

            const mergedDashboard: Dashboard = {
              name: predefinedDashboard.name,
              folder: predefinedDashboard.folder,
              title: predefinedDashboard.title,
              filter: predefinedDashboard.filter,
              charts: mergedCharts,
            };

            setDashboard(mergedDashboard);
            setError(null);
          } catch (err) {
            console.error("Error processing dashboard data:", err);
            // Don't set error, just use predefined dashboard
            setError(null);
          }
        },
        (error) => {
          console.error("Error fetching dashboard data:", error);
          // Don't set error, just use predefined dashboard
          setError(null);
        }
      );
    },
    []
  );

  useEffect(() => {
    if (!selectedConnection) {
      return;
    }

    // Skip if connection hasn't changed
    const connectionId = selectedConnection.name;
    if (previousConnectionRef.current === connectionId) {
      return;
    }
    previousConnectionRef.current = connectionId;

    const api = Api.create(selectedConnection);

    // First, check if metric_log and asynchronous_metric_log tables exist
    api.executeSQL(
      {
        sql: `SELECT name FROM system.tables WHERE database = 'system' AND (name LIKE 'metric_log%' OR name LIKE 'asynchronous_metric_log%')`,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
          output_format_json_quote_64bit_integers: 0,
        },
      },
      (response: ApiResponse) => {
        try {
          const responseData = response.data;
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
          fetchDashboards(api, hasMetricLogTable, hasAsynchronousMetricLogTable);
        } catch (err) {
          console.error("Error checking metric_log tables:", err);
          // Continue with fetching dashboards anyway
          fetchDashboards(api, false, false);
        }
      },
      (error) => {
        console.error("Error checking metric_log tables:", error);
        // Continue with fetching dashboards anyway
        fetchDashboards(api, false, false);
      }
    );
  }, [selectedConnection, fetchDashboards, host]);

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
                <div key={`skipped-${i}`} style={{ width: `calc(${(1 / 4) * 100}% - ${(3 * 0.25) / 4}rem)` }}>
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
                                dialogButtons: [{ text: "OK", onClick: async () => true, default: true }],
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

export const ServerTab = memo(ServerTabComponent);


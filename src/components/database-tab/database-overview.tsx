import type {
  Dashboard,
  DashboardGroup,
  TableDescriptor,
  TransposeTableDescriptor,
} from "@/components/dashboard/dashboard-model";
import DashboardPanels, { type DashboardPanelsRef } from "@/components/dashboard/dashboard-panels";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { useConnection } from "@/lib/connection/ConnectionContext";
import type { FormatName } from "@/lib/formatter";
import { forwardRef, useMemo } from "react";

export interface DatabaseOverviewProps {
  database: string;
  selectedTimeSpan: TimeSpan;
}

interface TableInfo {
  database: string;
  name: string;
  engine: string;
  total_rows: number;
  total_bytes: number;
}

export const DatabaseOverview = forwardRef<DashboardPanelsRef, DatabaseOverviewProps>(
  ({ database, selectedTimeSpan }, ref) => {
    const { selectedConnection } = useConnection();
    const isClusterMode = selectedConnection!.cluster.length > 0;

    // Create dashboard with both the database info and tables descriptors
    const dashboard = useMemo<Dashboard>(() => {
      const def: Dashboard = {
        version: 2,
        filter: {
          showTimeSpanSelector: false,
          showRefresh: false,
          showAutoRefresh: false,
        },
        charts: [
          //
          // Database metadata
          //
          {
            type: "transpose-table",
            titleOption: {
              title: "Database Metadata",
              align: "left",
            },
            gridPos: {
              w: 24,
              h: 8,
            },
            query: {
              sql: `
select 
  *
from system.databases
where database = '${database}'
`,
            },
          } as TransposeTableDescriptor,

          //
          // Host overview section
          //
          {
            title: "Host",
            charts: [
              {
                type: "stat",
                titleOption: {
                  title: "Size of Database",
                  align: "center",
                },
                collapsed: false,
                width: 6,
                query: {
                  sql: `
SELECT
  sum(total_bytes)
FROM
  system.tables 
WHERE
  database = '${database}'
`,
                },
                valueOption: {
                  format: "binary_size",
                },
              },

              // Number of tables in the database
              {
                type: "stat",
                titleOption: {
                  title: "Number of Tables",
                  align: "center",
                },
                collapsed: false,
                width: 6,
                query: {
                  sql: `
SELECT
  count()
FROM
  system.tables
WHERE
  database = '${database}'
`,
                },
              },

              // Size percentage of all disk
              {
                type: "stat",
                titleOption: {
                  title: "Size Percentage of All Disks",
                  align: "center",
                },
                collapsed: false,
                width: 6,
                query: {
                  sql: `
SELECT
    sum(total_bytes) / (SELECT sum(total_space-keep_free_space) from system.disks) as size_percentage
FROM
  system.tables
WHERE
  database = '${database}'
    `,
                },
                valueOption: {
                  format: "percentage_0_1",
                },
              },

              // Size percentage of all databases
              {
                type: "stat",
                titleOption: {
                  title: "Size Percentage of All Databases",
                  align: "center",
                },
                collapsed: false,
                width: 6,
                query: {
                  sql: `
SELECT
  database_size / total_size as size_percentage
FROM (
  SELECT
      sum(total_bytes) as total_size,
      sumIf(total_bytes, database = '${database}') as database_size
  FROM
    system.tables
)
    `,
                },
                valueOption: {
                  format: "percentage_0_1",
                },
              },

              // Table size
              {
                type: "table",
                titleOption: {
                  title: "Size by Tables",
                  align: "left",
                },
                collapsed: true,
                gridPos: {
                  w: 24,
                  h: 12,
                },
                headOption: {
                  isSticky: true,
                },
                showIndexColumn: true,
                query: {
                  sql: `
SELECT
T.name, 
part.part_count, 
part.rows, 
part.on_disk_size, 
part.uncompressed_size, 
part.size_percent,
T.engine, 
T.metadata_modification_time,
part.last_modification_time
FROM 
system.tables AS T
LEFT JOIN
(
SELECT 
    table,
    max(modification_time) as last_modification_time,
    count(1) as part_count,
    sum(rows) as rows,
    sum(bytes_on_disk) AS on_disk_size,
    sum(data_uncompressed_bytes) AS uncompressed_size,
    on_disk_size * 100 / (SELECT sum(bytes_on_disk) FROM system.parts WHERE database = '${database}') AS size_percent
FROM
    system.parts
WHERE database = '${database}'
AND active
GROUP BY table
) AS part
ON T.table = part.table
WHERE T.database = '${database}' AND endsWith(T.engine , 'MergeTree')
ORDER BY on_disk_size DESC
    `,
                },
                fieldOptions: {
                  name: {
                    title: "Table Name",
                    sortable: true,
                    align: "left" as const,
                    renderAction: (row: unknown) => {
                      const tableRow = row as TableInfo;
                      return (
                        <OpenTableTabButton
                          database={database}
                          table={tableRow.name}
                          engine={tableRow.engine}
                          showDatabase={false}
                        />
                      );
                    },
                  },
                  engine: {
                    title: "Engine",
                    sortable: true,
                    align: "left" as const,
                  },
                  metadata_modification_time: {
                    title: "Metadata Modified At",
                    sortable: true,
                    align: "left" as const,
                    format: "yyyyMMddHHmmss" as FormatName,
                  },
                  last_modification_time: {
                    title: "Data Modified At",
                    sortable: true,
                    align: "left" as const,
                    format: "yyyyMMddHHmmss" as FormatName,
                  },
                  size_percent: {
                    title: "Size Distribution in This Database",
                    sortable: true,
                    align: "left" as const,
                    format: "percentage_bar" as FormatName,
                  },
                  part_count: {
                    title: "Part Count",
                    sortable: true,
                    align: "center" as const,
                    format: "comma_number" as FormatName,
                  },
                  on_disk_size: {
                    title: "Size On Disk",
                    sortable: true,
                    align: "center" as const,
                    format: "binary_size" as FormatName,
                  },
                  uncompressed_size: {
                    title: "Uncompressed Size",
                    sortable: true,
                    align: "center" as const,
                    format: "binary_size" as FormatName,
                  },
                },
                sortOption: {
                  initialSort: {
                    column: "on_disk_size",
                    direction: "desc",
                  },
                },
              } as TableDescriptor,
            ],
          } as DashboardGroup,
        ],
      };

      if (isClusterMode) {
        def.charts.push(
          //
          // Cluster overview section
          //
          {
            title: "Cluster",
            charts: [
              //
              // database size
              //
              {
                type: "stat",
                titleOption: {
                  title: "Size of Database",
                  align: "center",
                },
                collapsed: false,
                width: 6,
                query: {
                  sql: `
SELECT
  sum(total_bytes)
FROM
  clusterAllReplicas('{cluster}', system.tables) 
WHERE
  database = '${database}'
    `,
                },
                valueOption: {
                  format: "binary_size",
                },
              },

              //
              // database by host
              //
              {
                type: "table",
                titleOption: {
                  title: "Database Size by Host",
                  align: "center",
                },
                collapsed: false,
                gridPos: {
                  w: 24,
                  h: 12,
                },
                showIndexColumn: true,
                headOption: {
                  isSticky: true,
                },
                sortOption: {
                  initialSort: {
                    column: "host",
                    direction: "asc",
                  },
                },
                fieldOptions: {
                  disk_size: {
                    format: "binary_size",
                  },
                  compressed_size: {
                    format: "binary_size",
                  },
                  uncompressed_size: {
                    format: "binary_size",
                  },
                  compressed_ratio: {
                    format: (value: unknown) => {
                      if (value === null || value === undefined) {
                        return "-";
                      }
                      return `${value} : 1`;
                    },
                  },
                },
                query: {
                  sql: `
SELECT 
    FQDN() as host,
    count(1) as part_count,
    sum(rows) as rows,
    sum(bytes_on_disk) as disk_size,
    sum(data_compressed_bytes) AS compressed_size,
    sum(data_uncompressed_bytes) AS uncompressed_size,
    round(uncompressed_size / compressed_size, 0) AS compressed_ratio
FROM clusterAllReplicas('${selectedConnection?.cluster}', system.parts)
WHERE database = '${database}'
AND active
GROUP BY host
ORDER BY host
`,
                },
              } as TableDescriptor,
            ],
          } as DashboardGroup
        );
      }

      return def;
    }, [database]);

    return <DashboardPanels ref={ref} dashboard={dashboard} selectedTimeSpan={selectedTimeSpan} />;
  }
);

DatabaseOverview.displayName = "DatabaseOverview";

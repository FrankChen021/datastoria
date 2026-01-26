import { useConnection } from "@/components/connection/connection-context";
import type {
  Dashboard,
  DashboardGroup,
  StatDescriptor,
  TableDescriptor,
  TransposeTableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPanelContainer, {
  type DashboardPanelContainerRef,
} from "@/components/shared/dashboard/dashboard-panel-container";
import type { TimeSpan } from "@/components/shared/dashboard/timespan-selector";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
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

export const DatabaseOverview = forwardRef<DashboardPanelContainerRef, DatabaseOverviewProps>(
  ({ database, selectedTimeSpan }, ref) => {
    const { connection } = useConnection();
    const isClusterMode = connection && connection.cluster && connection.cluster.length > 0;

    // Create dashboard with both the database info and tables descriptors
    const dashboard = useMemo<Dashboard>(() => {
      const def: Dashboard = {
        version: 3,
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
              h: 9,
            },
            datasource: {
              sql: `
select 
  *
from system.databases
where database = '${database}'
`,
            },
          } as TransposeTableDescriptor,

          //
          // Node overview section
          //
          {
            title: "Node",
            charts: [
              {
                type: "stat",
                titleOption: {
                  title: "Database Size",
                  align: "center",
                },
                collapsed: false,
                gridPos: {
                  w: 4,
                  h: 4,
                },
                datasource: {
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
                gridPos: {
                  w: 4,
                  h: 4,
                },
                datasource: {
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
                gridPos: {
                  w: 4,
                  h: 4,
                },
                datasource: {
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
                gridPos: {
                  w: 4,
                  h: 4,
                },
                datasource: {
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

              {
                type: "stat",
                titleOption: {
                  title: "Ongoing Merges",
                },
                gridPos: {
                  w: 4,
                  h: 4,
                },
                description: "The number of ongoing merges",
                datasource: {
                  sql: `SELECT count() FROM system.merges WHERE database = '${database}'`,
                },
                drilldown: {
                  main: {
                    type: "table",
                    titleOption: {
                      title: "Ongoing Merges",
                      description: "The ongoing merges",
                    },
                    gridPos: { w: 24, h: 12 },
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
                    datasource: {
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
WHERE database = '${database}'
ORDER BY elapsed DESC`,
                    },
                  } as TableDescriptor,
                },
              } as StatDescriptor,
              {
                type: "stat",
                titleOption: {
                  title: "Ongoing Mutations",
                },
                gridPos: {
                  w: 4,
                  h: 4,
                },
                description: "The number of ongoing mutations",
                datasource: {
                  sql: `SELECT count() FROM system.mutations WHERE is_done = 0 AND database = '${database}'`,
                },
                drilldown: {
                  main: {
                    type: "table",
                    titleOption: {
                      title: "Ongoing Mutations",
                      description: "The number of ongoing mutations",
                    },
                    gridPos: { w: 24, h: 12 },
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
                    datasource: {
                      sql: `
SELECT database, table, create_time, mutation_id, command, parts_to_do, latest_fail_time, latest_fail_reason 
FROM system.mutations 
WHERE is_done = 0 AND database = '${database}' 
ORDER BY create_time DESC`,
                    },
                  } as TableDescriptor,
                },
              } as StatDescriptor,

              //
              // Table size
              //
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
                miscOption: { enableIndexColumn: true },
                datasource: {
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
                gridPos: { w: 6, h: 4 },
                datasource: {
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
              // database by node
              //
              {
                type: "table",
                titleOption: {
                  title: "Database Size by Node",
                  align: "center",
                },
                collapsed: false,
                gridPos: {
                  w: 24,
                  h: 12,
                },
                miscOption: { enableIndexColumn: true },
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
                datasource: {
                  sql: `
SELECT 
    FQDN() as host,
    count(1) as part_count,
    sum(rows) as rows,
    sum(bytes_on_disk) as disk_size,
    sum(data_compressed_bytes) AS compressed_size,
    sum(data_uncompressed_bytes) AS uncompressed_size,
    round(uncompressed_size / compressed_size, 0) AS compressed_ratio
FROM clusterAllReplicas('${connection?.cluster}', system.parts)
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

    return (
      <DashboardPanelContainer ref={ref} dashboard={dashboard} initialTimeSpan={selectedTimeSpan} />
    );
  }
);

DatabaseOverview.displayName = "DatabaseOverview";

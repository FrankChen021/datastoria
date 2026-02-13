import { useConnection } from "@/components/connection/connection-context";
import type {
  Dashboard,
  DashboardGroup,
  StatDescriptor,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPanelContainer, {
  type DashboardPanelContainerRef,
} from "@/components/shared/dashboard/dashboard-panel-container";
import {
  BUILT_IN_TIME_SPAN_LIST,
  type TimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import { SqlUtils } from "@/lib/sql-utils";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface TableOverviewViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const TableOverviewViewComponent = forwardRef<RefreshableTabViewRef, TableOverviewViewProps>(
  ({ database, table, autoLoad: _autoLoad }, ref) => {
    const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | undefined>(undefined);
    const dashboardPanelsRef = useRef<DashboardPanelContainerRef>(null);
    const defaultTimeSpan = useMemo(() => BUILT_IN_TIME_SPAN_LIST[3].getTimeSpan(), []);
    const { connection } = useConnection();

    // Calculate current time span (use selected if available, otherwise default)
    const currentTimeSpan = selectedTimeSpan ?? defaultTimeSpan;

    useImperativeHandle(
      ref,
      () => ({
        refresh: (timeSpan?: TimeSpan) => {
          if (timeSpan) {
            // Update state - prop change will trigger automatic refresh in DashboardPanelContainer
            setSelectedTimeSpan(timeSpan);
          } else {
            // No timeSpan provided - explicitly refresh with current time span
            // This handles the case when clicking refresh without changing the time range
            requestAnimationFrame(() => {
              dashboardPanelsRef.current?.refresh(currentTimeSpan);
            });
          }
        },
        supportsTimeSpanSelector: true,
      }),
      [currentTimeSpan]
    );

    // Create dashboard with all table descriptors
    const dashboard = useMemo<Dashboard>(() => {
      const isClusterMode = connection?.cluster && connection.cluster.length > 0;
      const escapedDatabase = SqlUtils.escapeSqlString(database);
      const escapedTable = SqlUtils.escapeSqlString(table);
      return {
        name: `table-overview-${database}-${table}`,
        folder: "table-overview",
        title: "Table Overview",
        version: 3,
        filter: {
          showTimeSpanSelector: false,
          showRefresh: false,
          showAutoRefresh: false,
        },
        charts: [
          {
            type: "stat",
            titleOption: {
              title: "Total Size",
              align: "center",
            },
            collapsed: false,
            gridPos: { w: 5, h: 4 },
            datasource: {
              sql: `
SELECT sum(total_bytes) as total_bytes
FROM
    system.tables
WHERE 
    database = '${escapedDatabase}' 
    AND table = '${escapedTable}'
`,
            },
            valueOption: {
              format: "binary_size",
            },
          },
          {
            type: "stat",
            titleOption: {
              title: "Total Rows",
              align: "center",
            },
            collapsed: false,
            gridPos: { w: 5, h: 4 },
            valueOption: {
              format: "comma_number",
            },
            datasource: {
              sql: `
SELECT sum(total_rows) as total_bytes
FROM
    system.tables
WHERE 
    database = '${escapedDatabase}' 
    AND table = '${escapedTable}'
`,
            },
          } as StatDescriptor,
          {
            type: "stat",
            titleOption: {
              title: "Part Count",
              align: "center",
            },
            collapsed: false,
            gridPos: { w: 5, h: 4 },
            valueOption: {
              format: "comma_number",
            },
            datasource: {
              sql: `
SELECT count(1) as part_count
FROM
    system.parts
WHERE 
    database = '${escapedDatabase}' 
    AND table = '${escapedTable}'
    AND active = 1`,
            },
            fieldOptions: {
              value: {
                title: "Value",
                format: "binary_size",
              },
            },
          } as StatDescriptor,
          {
            type: "stat",
            titleOption: {
              title: "Size Percentage of All Disks",
              align: "center",
            },
            collapsed: false,
            gridPos: { w: 5, h: 4 },
            datasource: {
              sql: `
SELECT sum(total_bytes) / (SELECT sum(total_space - keep_free_space) from system.disks) as bytes_on_disk
FROM
    system.tables
WHERE 
    database = '${escapedDatabase}' 
    AND table = '${escapedTable}'
`,
            },
            valueOption: {
              format: "percentage_0_1",
            },
          },
          {
            type: "stat",
            titleOption: {
              title: "Data Last Modified At",
              align: "center",
            },
            collapsed: false,
            gridPos: { w: 4, h: 4 },
            datasource: {
              sql: `
SELECT modification_time
FROM system.parts
WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
ORDER BY system.parts.modification_time DESC
LIMIT 1
`,
            },
          } as StatDescriptor,

          //
          // Cluster - only available in cluster mode
          //
          ...(isClusterMode
            ? [
                {
                  title: "Cluster",
                  charts: [
                    {
                      type: "stat",
                      titleOption: {
                        title: "Cluster Size",
                      },
                      gridPos: { w: 5, h: 4 },
                      datasource: {
                        sql: `
SELECT sum(total_bytes) as total_bytes
FROM cluster('{cluster}', system.tables)
WHERE database = '${escapedDatabase}' AND name = '${escapedTable}'
`,
                      },
                      valueOption: {
                        format: "binary_size",
                      },
                    } as StatDescriptor,
                    {
                      type: "stat",
                      titleOption: {
                        title: "Cluster Size(All Replicas)",
                      },
                      gridPos: { w: 5, h: 4 },
                      datasource: {
                        sql: `
SELECT sum(total_bytes) as total_bytes
FROM clusterAllReplicas('{cluster}', system.tables)
WHERE database = '${escapedDatabase}' AND name = '${escapedTable}'
`,
                      },
                      valueOption: {
                        format: "binary_size",
                      },
                    } as StatDescriptor,
                    {
                      type: "stat",
                      titleOption: {
                        title: "Total Rows",
                      },
                      gridPos: { w: 5, h: 4 },
                      datasource: {
                        sql: `
SELECT sum(total_rows) as total_bytes
FROM cluster('{cluster}', system.tables)
WHERE database = '${escapedDatabase}' AND name = '${escapedTable}'
`,
                      },
                      valueOption: {
                        format: "comma_number",
                      },
                    } as StatDescriptor,
                    {
                      type: "table",
                      titleOption: {
                        title: "Table Size On Cluster",
                        align: "center",
                      },
                      gridPos: { w: 24, h: 12 },
                      datasource: {
                        sql: `
SELECT
  FQDN() as host, 
  count() as part_count, 
  sum(bytes_on_disk) as bytes_on_disk, 
  sum(rows) as rows
FROM clusterAllReplicas('{cluster}', system.parts)
WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
AND active
GROUP BY host
ORDER BY host
`,
                      },
                      miscOption: {
                        enableIndexColumn: true,
                      },
                      fieldOptions: {
                        bytes_on_disk: {
                          format: "binary_size",
                        },
                        rows: {
                          format: "comma_number",
                        },
                      },
                      sortOption: {
                        initialSort: {
                          column: "host",
                          direction: "asc",
                        },
                      },
                    } as TableDescriptor,
                  ],
                } as DashboardGroup,
              ]
            : []),

          //
          // Sizes
          //
          {
            title: "Sizes",
            collapsed: true,
            charts: [
              {
                type: "table",
                titleOption: {
                  title: "Overall Size",
                  align: "center",
                },
                gridPos: {
                  w: 24,
                  h: 4,
                },
                datasource: {
                  sql: `
SELECT 
    count(1) as part_count,
    sum(rows) as rows,
    sum(bytes_on_disk) AS disk_size,
    sum(data_uncompressed_bytes) AS uncompressed_size,
    round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS compress_ratio,
    round(disk_size / rows, 2) AS avg_row_size
FROM
    system.parts
WHERE 
    database = '${escapedDatabase}' 
    AND table = '${escapedTable}'
    AND active = 1
ORDER BY 
    disk_size DESC`,
                },
                sortOption: {
                  initialSort: {
                    column: "disk_size",
                    direction: "desc",
                  },
                  serverSideSorting: true,
                },
                fieldOptions: {
                  part_count: {
                    title: "Part Count",
                    sortable: true,
                    align: "center",
                    format: "comma_number",
                    position: 3,
                  },
                  rows: {
                    title: "Rows",
                    sortable: true,
                    align: "center",
                    format: "comma_number",
                    position: 4,
                  },
                  avg_row_size: {
                    title: "Avg Row Size",
                    sortable: true,
                    align: "center",
                    format: "binary_size",
                    position: 5,
                  },
                  disk_size: {
                    title: "On Disk Size",
                    sortable: true,
                    align: "center",
                    format: "binary_size",
                    position: 6,
                  },
                  uncompressed_size: {
                    title: "Uncompressed Size",
                    sortable: true,
                    align: "center",
                    format: "binary_size",
                    position: 7,
                  },
                  compress_ratio: {
                    title: "Compress Ratio",
                    sortable: true,
                    align: "center",
                    position: 8,
                    format: (value: unknown) => {
                      if (value === null || value === undefined) {
                        return "-";
                      }
                      return `${value} : 1`;
                    },
                  },
                },
              } as TableDescriptor,
              {
                type: "table",
                titleOption: {
                  title: "Column Size",
                  align: "center",
                },
                gridPos: {
                  w: 24,
                  h: 18,
                },
                datasource: {
                  sql: `
SELECT 
    column,
    type,
    sum(column_data_compressed_bytes) AS compressed_size,
    sum(column_data_uncompressed_bytes) AS uncompressed_size,
    round(sum(column_data_uncompressed_bytes) / sum(column_data_compressed_bytes), 0) AS compress_ratio,
    sum(rows) AS rows_count,
    round(sum(column_data_uncompressed_bytes) / sum(rows), 0) AS avg_uncompressed_size,
    compressed_size * 100 / (select sum(bytes_on_disk) from system.parts where database = '${escapedDatabase}' and table = '${escapedTable}' and active = 1) AS size_percentage_of_table
FROM 
    system.parts_columns
WHERE 
    database = '${escapedDatabase}' 
    AND table = '${escapedTable}'
    AND active = 1
GROUP BY 
    column, type
ORDER BY 
    compressed_size DESC`,
                },
                sortOption: {
                  initialSort: {
                    column: "compressed_size",
                    direction: "desc",
                  },
                },
                fieldOptions: {
                  column: {
                    title: "Column",
                    sortable: true,
                    align: "left",
                  },
                  rows_count: {
                    title: "Rows",
                    sortable: true,
                    align: "center",
                    format: "comma_number",
                  },
                  uncompressed_size: {
                    title: "Uncompressed Size",
                    sortable: true,
                    align: "center",
                    format: "binary_size",
                  },
                  compressed_size: {
                    title: "Compressed Size",
                    sortable: true,
                    align: "center",
                    format: "binary_size",
                  },
                  size_percentage_of_table: {
                    title: "Size Percentage of Table",
                    sortable: true,
                    align: "center",
                    format: "percentage_bar",
                  },
                  compress_ratio: {
                    title: "Compress Ratio",
                    sortable: true,
                    align: "left",
                    format: (value: unknown) => {
                      if (value === null || value === undefined) {
                        return "-";
                      }
                      return `${value} : 1`;
                    },
                  },
                  avg_uncompressed_size: {
                    title: "Avg Uncompressed Size",
                    sortable: true,
                    align: "center",
                    format: "binary_size",
                  },
                },
              } as TableDescriptor,
              {
                type: "table",
                titleOption: {
                  title: "Index Size",
                  align: "center",
                },
                gridPos: { w: 24, h: 10 },
                fieldOptions: {
                  database: {
                    position: -1,
                  },
                  table: {
                    position: -1,
                  },
                  data_compressed_bytes: {
                    sortable: true,
                    align: "left",
                    format: "binary_size",
                  },
                  data_uncompressed_bytes: {
                    sortable: true,
                    align: "left",
                    format: "binary_size",
                  },
                },
                datasource: {
                  sql: `
SELECT *
FROM system.data_skipping_indices
WHERE
    database = '${escapedDatabase}'
    AND table = '${escapedTable}'`,
                },
                sortOption: {
                  initialSort: {
                    column: "data_compressed_bytes",
                    direction: "desc",
                  },
                },
              } as TableDescriptor,
              {
                type: "table",
                titleOption: {
                  title: "Projection Size",
                  align: "center",
                },
                gridPos: { w: 24, h: 10 },
                datasource: {
                  sql: `
SELECT A.database, 
  A.table, 
  A.name, 
  A.type,
  B.part_count, 
  B.rows, 
  B.bytes_on_disk,
  B.parent_bytes_on_disk,
  B.bytes_on_disk * 100 / B.parent_bytes_on_disk as percentage_of_parent,
  B.last_modified_time,
  A.query
FROM (
    SELECT * FROM system.projections WHERE database = '${escapedDatabase}' AND table = '${escapedTable}' 
) AS A
LEFT JOIN
(
    SELECT 
        name, 
        count() as part_count, 
        sum(bytes_on_disk) as bytes_on_disk,
        sum(rows) as rows,
        sum(parent_bytes_on_disk) as  parent_bytes_on_disk,
        max(modification_time)  as last_modified_time
    FROM system.projection_parts
    WHERE
        database = '${escapedDatabase}'
        AND table = '${escapedTable}'
        AND active
    GROUP BY name
) AS B
ON A.name = B.name
ORDER BY 1, 2, 3`,
                },
                sortOption: {
                  initialSort: {
                    column: "",
                    direction: "desc",
                  },
                },
                fieldOptions: {
                  database: {
                    position: -1,
                  },
                  table: {
                    position: -1,
                  },
                  bytes_on_disk: {
                    sortable: true,
                    align: "left",
                    format: "binary_size",
                  },
                  rows: {
                    sortable: true,
                    align: "left",
                    format: "comma_number",
                  },
                  parent_bytes_on_disk: {
                    sortable: true,
                    align: "left",
                    format: "binary_size",
                  },
                  percentage_of_parent: {
                    sortable: true,
                    align: "left",
                    format: "percentage_bar",
                  },
                  query: {
                    format: "sql",
                  },
                },
              } as TableDescriptor,
            ],
          } as DashboardGroup,
        ],
      };
    }, [database, table, connection]);

    return (
      <DashboardPanelContainer
        ref={dashboardPanelsRef}
        dashboard={dashboard}
        initialTimeSpan={currentTimeSpan}
      />
    );
  }
);

TableOverviewViewComponent.displayName = "TableOverviewView";

export const TableOverviewView = memo(TableOverviewViewComponent);

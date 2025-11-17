import type { StatDescriptor, TableDescriptor, TimeseriesDescriptor } from "@/components/dashboard/dashboard-model";
import DashboardContainer from "@/components/dashboard/dashboard-container";
import type { Dashboard, DashboardGroup } from "@/components/dashboard/dashboard-model";
import { OpenDatabaseTabButton } from "@/components/table-tab/open-database-tab-button";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { memo } from "react";

const serverStatusDashboard = [
  {
    type: "stat",
    titleOption: {
      title: "Server Version",
    },
    width: 4,
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
    width: 4,
    description: "How long the server has been running",
    query: {
      sql: "SELECT uptime() * 1000",
    },
    valueOption: {
      format: "days",
    },
  },

  {
    type: "stat",
    titleOption: {
      title: "Warnings",
    },
    width: 4,
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
    width: 4,
    description: "How long the server has been running",
    query: {
      sql: "SELECT toUnixTimestamp(max(last_error_time)) * 1000 FROM system.errors",
    },
    valueOption: {
      format: "timeDiff",
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
    width: 4,
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
        width: 4,
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
  } as StatDescriptor,
  {
    type: "stat",
    titleOption: {
      title: "Tables",
    },
    width: 4,
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
    width: 4,
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
        width: 4,
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
              return <OpenTableTabButton database={database} table={tableName} engine={engine} showDatabase={false} />;
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
  } as StatDescriptor,
  {
    type: "stat",
    titleOption: {
      title: "Used Storage",
    },
    width: 4,
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
        width: 4,
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
  } as StatDescriptor,
  {
    type: "stat",
    titleOption: {
      title: "Ongoing Merges",
    },
    width: 4,
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
        width: 4,
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
  } as StatDescriptor,
  {
    type: "stat",
    titleOption: {
      title: "Ongoing Mutations",
    },
    width: 4,
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
        width: 4,
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
  } as StatDescriptor,
  {
    type: "stat",
    titleOption: {
      title: "Running queries",
    },
    width: 4,
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
        width: 4,
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
  } as StatDescriptor,
];

const clusterStatusDashboard = [
  //
  // Shards
  //
  {
    type: "stat",
    titleOption: {
      title: "Shards",
    },
    width: 4,
    description: "Number of shards in the cluster",
    query: {
      sql: `
SELECT 
countDistinct(shard_num) as shard_count
FROM system.clusters
WHERE cluster = '{cluster}'
`,
    },
  } as StatDescriptor,

  //
  // Server Count
  //
  {
    type: "stat",
    titleOption: {
      title: "Server Count",
    },
    width: 4,
    description: "Number of servers in the cluster",
    query: {
      sql: `
SELECT 
  count() 
FROM system.clusters
WHERE cluster = '{cluster}'
SETTINGS skip_unavailable_shards=1
`,
    },
    drilldown: {
      "server-count": {
        type: "table",
        titleOption: {
          title: "Server Count",
        },
        width: 4,
        showIndexColumn: true,
        query: {
          sql: `SELECT * FROM system.clusters WHERE cluster = '{cluster}'`,
        },
        fieldOptions: {
          host: {
            title: "Host",
          },
        },
      } as TableDescriptor,
    },
  } as StatDescriptor,

  //
  // Total Data Size
  //
  {
    type: "stat",
    titleOption: {
      title: "Total Data Size",
    },
    width: 4,
    description: "Total data size in the cluster",
    query: {
      sql: `
SELECT 
sum(bytes_on_disk) as bytes_on_disk
FROM clusterAllReplicas('{cluster}', system.parts)
WHERE active
SETTINGS skip_unavailable_shards=1
`,
    },
    valueOption: {
      format: "binary_size",
    },

    drilldown: {
      "total-data-size": {
        type: "table",
        titleOption: {
          title: "Disk Space Usage By Server",
        },
        width: 4,
        description: "Number of servers in the cluster",
        query: {
          sql: `
SELECT
  FQDN() as host,
  sum(bytes_on_disk) AS bytes_on_disk,
  count(1) as part_count,
  sum(rows) as rows
FROM clusterAllReplicas('{cluster}', system.parts) 
WHERE active
GROUP BY host
ORDER BY host
SETTINGS skip_unavailable_shards=1
    `,
        },
        fieldOptions: {
          bytes_on_disk: {
            format: "binary_size",
          },
        },
        sortOption: {
          initialSort: {
            column: "host",
            direction: "asc",
          },
        },
      } as TableDescriptor,
    },
  } as StatDescriptor,

  //
  // Disk Quota
  //
  {
    type: "stat",
    titleOption: {
      title: "Disk Quota",
    },
    width: 4,
    description: "Total data size in the cluster",
    query: {
      sql: `
SELECT sum(total_space) FROM clusterAllReplicas('{cluster}', system.disks)
`,
    },
    valueOption: {
      format: "binary_size",
    },
    drilldown: {
      "disk-quota": {
        type: "table",
        titleOption: {
          title: "Disk Quota",
        },
        width: 4,
        query: {
          sql: `SELECT FQDN() as server, round(free_space * 100 / total_space, 2) as free_percentage, * FROM clusterAllReplicas('{cluster}', system.disks) ORDER BY server`,
        },
        fieldOptions: {
          free_percentage: {
            format: "percentage_bar",
            // server, name, path
            position: 3,
          },
          free_space: {
            format: "compact_number",
          },
          total_space: {
            format: "compact_number",
          },
          unreserved_space: {
            format: "compact_number",
          },
          keep_free_space: {
            format: "compact_number",
          },
        },
      },
    },
  } as StatDescriptor,

  //
  // Utilized Disk Space
  //
  {
    type: "stat",
    titleOption: {
      title: "Utilized Disk Space",
    },
    width: 4,
    description: "The percentage of utilized disk space of the cluster",
    query: {
      sql: `
SELECT 1 - (sum(free_space) / sum(total_space)) FROM clusterAllReplicas('{cluster}', system.disks)
`,
    },
    valueOption: {
      format: "percentage_0_1",
    },
  } as StatDescriptor,
];

const clusterMetricsDashboard = [
  //
  // Insert Queries Per Second
  //
  {
    type: "line",
    titleOption: {
      title: "Insert Queries Per Second",
      align: "center",
    },
    width: 12,
    description: "Insert Queries Per Second",
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_InsertQuery) AS metric
  FROM clusterAllReplicas({cluster}, merge('system', '^metric_log'))
  WHERE event_date >= toDate(now() - {seconds:UInt32})
    AND event_time >= now() - {seconds:UInt32}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32} SETTINGS skip_unavailable_shards = 1`,
    },
  } as TimeseriesDescriptor,

  //
  // SELECT Queries Per Second
  //
  {
    type: "line",
    titleOption: {
      title: "Select Queries Per Second",
      align: "center",
    },
    width: 12,
    description: "Select Queries Per Second",
    tooltipOption: {
      sortValue: "desc",
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_SelectQuery) AS metric
  FROM clusterAllReplicas({cluster}, merge('system', '^metric_log'))
  WHERE event_date >= toDate(now() - {seconds:UInt32})
    AND event_time >= now() - {seconds:UInt32}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32} SETTINGS skip_unavailable_shards = 1`,
    },
  } as TimeseriesDescriptor,

  //
  // Failed Queries Per Second
  //
  {
    type: "line",
    titleOption: {
      title: "Failed Queries Per Second",
      align: "center",
    },
    width: 12,
    description: "Failed Queries Per Second",
    tooltipOption: {
      sortValue: "none",
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_FailedQuery) AS metric
  FROM clusterAllReplicas({cluster}, merge('system', '^metric_log'))
  WHERE event_date >= toDate(now() - {seconds:UInt32})
    AND event_time >= now() - {seconds:UInt32}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32} SETTINGS skip_unavailable_shards = 1`,
    },
  } as TimeseriesDescriptor,

  //
  // Insert Bytes Per Second
  //
  {
    type: "line",
    titleOption: {
      title: "Insert Bytes Per Second",
      align: "center",
    },
    width: 12,
    description: "Insert Bytes Per Second",
    tooltipOption: {
      sortValue: "none",
    },
    fieldOptions: {
      metric: {
        format: "binary_size",
      },
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_InsertedBytes) AS metric
  FROM clusterAllReplicas({cluster}, merge('system', '^metric_log'))
  WHERE event_date >= toDate(now() - {seconds:UInt32})
    AND event_time >= now() - {seconds:UInt32}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32} SETTINGS skip_unavailable_shards = 1`,
    },
  } as TimeseriesDescriptor,

  //
  // Insert Rows Per Second
  //
  {
    type: "line",
    titleOption: {
      title: "Insert Rows Per Second",
      align: "center",
    },
    width: 12,
    description: "Insert Rows Per Second",
    tooltipOption: {
      sortValue: "none",
    },
    fieldOptions: {
      metric: {
        format: "short_number",
      },
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_InsertedRows) AS metric
  FROM clusterAllReplicas({cluster}, merge('system', '^metric_log'))
  WHERE event_date >= toDate(now() - {seconds:UInt32})
    AND event_time >= now() - {seconds:UInt32}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32} SETTINGS skip_unavailable_shards = 1`,
    },
  } as TimeseriesDescriptor,
];

interface ServerTabProps {
  host: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ServerTabComponent = (_props: ServerTabProps) => {
  const connection = useConnection();

  const dashboard = {
    version: 2,
    charts: [
      {
        title: "Server Status",
        collapsed: false,
        charts: serverStatusDashboard,
      } as DashboardGroup,
    ],
  } as Dashboard;

  if (
    connection &&
    connection.selectedConnection &&
    connection.selectedConnection.cluster &&
    connection.selectedConnection.cluster.length > 0
  ) {
    dashboard.charts.push({
      title: "Cluster Status",
      collapsed: false,
      charts: clusterStatusDashboard,
    } as DashboardGroup);

    dashboard.charts.push({
      title: "Cluster Metrics",
      collapsed: true,
      charts: clusterMetricsDashboard,
    } as DashboardGroup);
  }

  return (
    <div className="flex flex-col px-2" style={{ height: "calc(100vh - 49px)" }}>
      <DashboardContainer dashboard={dashboard} headerActions={null} />
    </div>
  );
};

export const ServerTab = memo(ServerTabComponent);

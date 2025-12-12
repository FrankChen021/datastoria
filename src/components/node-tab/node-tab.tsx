import DashboardContainer from "@/components/shared/dashboard/dashboard-container";
import type {
  Dashboard,
  DashboardGroup,
  StatDescriptor,
  TableDescriptor,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import { OpenDatabaseTabButton } from "@/components/table-tab/open-database-tab-button";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { useConnection } from "@/lib/connection/connection-context";
import { memo } from "react";

const serverStatusDashboard = [
  //
  // Server Version
  //
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
    drilldown: {
      main: {
        type: "table",
        titleOption: {
          title: "system.build_options",
        },
        query: {
          sql: "SELECT * FROM system.build_options",
        },
      } as TableDescriptor,
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
      main: {
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
      main: {
        type: "table",
        titleOption: {
          title: "Warnings",
          description: "The number of warnings on the server",
        },
        query: {
          sql: `
WITH arrayMap(x -> demangle(addressToSymbol(x)), last_error_trace) AS all 
SELECT *, arrayStringConcat(all, '\n') AS last_error_stack_trace
FROM system.errors ORDER BY last_error_time DESC
SETTINGS allow_introspection_functions = 1
`,
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
      main: {
        type: "table",
        titleOption: {
          title: "Databases",
          description: "The number of databases on the server",
        },
        width: 4,
        fieldOptions: {
          name: {
            format: (name) => {
              const databaseName = name as string;
              return <OpenDatabaseTabButton variant="shadcn-link" database={databaseName} />;
            },
          },
          size: {
            format: "binary_size",
          },
          rows: {
            format: "comma_number",
          },
          percentage: {
            title: "Size Percentage of All Tables",
            format: "percentage_bar",
            formatArgs: [100, 16],
            width: 100,
          },
        },
        query: {
          sql: `
SELECT
    database as name,
    sum(total_bytes) AS size,
    sum(total_rows) as rows,
    round(100 * size / (SELECT sum(total_bytes) FROM system.tables), 2) as percentage
FROM system.tables
GROUP BY
    database
ORDER BY size DESC
`,
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
      title: "Size of all tables",
    },
    width: 4,
    query: {
      sql: `SELECT sum(total_bytes) FROM system.tables`,
    },
    valueOption: {
      format: "binary_size",
    },
    drilldown: {
      main: {
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
WITH (
    SELECT sum(total_bytes) FROM system.tables
) AS total_size
SELECT
    database,
    table,
    engine,
    round(100 * total_bytes / total_size, 2) AS pct_of_total,
    total_bytes AS size
FROM system.tables
ORDER BY size DESC
`,
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
      main: {
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
      main: {
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
      main: {
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
      main: {
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
      main: {
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
      main: {
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
      main: {
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

const overviewMetricsDashboard = [
  //
  // Queries/second
  //
  {
    type: "line",
    titleOption: {
      title: "Queries/second",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_Query) AS query_qps
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // CPU Usage (cores)
  //
  {
    type: "line",
    titleOption: {
      title: "CPU Usage (cores)",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS cpu_cores
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Queries Running
  //
  {
    type: "line",
    titleOption: {
      title: "Queries Running",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(CurrentMetric_Query) AS queries_running
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Merges Running
  //
  {
    type: "line",
    titleOption: {
      title: "Merges Running",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(CurrentMetric_Merge) AS merges_running
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Selected Bytes/second
  //
  {
    type: "line",
    titleOption: {
      title: "Selected Bytes/second",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    fieldOptions: {
      selected_bytes: {
        format: "binary_size",
      },
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_SelectedBytes) AS selected_bytes
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // IO Wait
  //
  {
    type: "line",
    titleOption: {
      title: "IO Wait",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSIOWaitMicroseconds) / 1000000 AS io_wait
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // CPU Wait
  //
  {
    type: "line",
    titleOption: {
      title: "CPU Wait",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSCPUWaitMicroseconds) / 1000000 AS cpu_wait
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // OS CPU Usage (Userspace)
  //
  {
    type: "line",
    titleOption: {
      title: "OS CPU Usage (Userspace)",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(value) AS OSUserTimeNormalized
FROM merge('system', '^asynchronous_metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
  AND metric = 'OSUserTimeNormalized'
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // OS CPU Usage (Kernel)
  //
  {
    type: "line",
    titleOption: {
      title: "OS CPU Usage (Kernel)",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(value) AS OSSystemTimeNormalized
FROM merge('system', '^asynchronous_metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
  AND metric = 'OSSystemTimeNormalized'
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Read From Disk
  //
  {
    type: "line",
    titleOption: {
      title: "Read From Disk",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    fieldOptions: {
      OSReadBytes: {
        format: "binary_size",
      },
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSReadBytes) AS OSReadBytes
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Read From Filesystem
  //
  {
    type: "line",
    titleOption: {
      title: "Read From Filesystem",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSReadChars) AS OSReadChars
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Memory (tracked)
  //
  {
    type: "line",
    titleOption: {
      title: "Memory (tracked)",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    fieldOptions: {
      memory_tracking_bytes: {
        format: "binary_size",
      },
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(CurrentMetric_MemoryTracking) AS memory_tracking_bytes
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // In-Memory Caches (bytes)
  //
  {
    type: "line",
    titleOption: {
      title: "In-Memory Caches (bytes)",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    fieldOptions: {
      cache_bytes: {
        format: "binary_size",
      },
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  arraySum([COLUMNS('CurrentMetric_.*CacheBytes') EXCEPT 'CurrentMetric_FilesystemCache.*' APPLY avg]) AS cache_bytes
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Load Average (15 minutes)
  //
  {
    type: "line",
    titleOption: {
      title: "Load Average (15 minutes)",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(value) AS LoadAverage15
FROM merge('system', '^asynchronous_metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
  AND metric = 'LoadAverage15'
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Selected Rows/second
  //
  {
    type: "line",
    titleOption: {
      title: "Selected Rows/second",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_SelectedRows) AS selected_rows_per_second
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Inserted Rows/second
  //
  {
    type: "line",
    titleOption: {
      title: "Inserted Rows/second",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_InsertedRows) AS inserted_rows_per_second
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Total MergeTree Parts
  //
  {
    type: "line",
    titleOption: {
      title: "Total MergeTree Parts",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(value) AS TotalPartsOfMergeTreeTables
FROM merge('system', '^asynchronous_metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
  AND metric = 'TotalPartsOfMergeTreeTables'
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Max Parts For Partition
  //
  {
    type: "line",
    titleOption: {
      title: "Max Parts For Partition",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  max(value) AS MaxPartCountForPartition
FROM merge('system', '^asynchronous_metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
  AND metric = 'MaxPartCountForPartition'
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  //
  // Concurrent network connections
  //
  {
    type: "line",
    titleOption: {
      title: "Concurrent network connections",
      align: "center",
    },
    width: 6,
    tooltipOption: {
      sortValue: "desc",
    },
    query: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  max(CurrentMetric_TCPConnection) AS TCP_Connections,
  max(CurrentMetric_MySQLConnection) AS MySQL_Connections,
  max(CurrentMetric_HTTPConnection) AS HTTP_Connections,
  max(CurrentMetric_InterserverConnection) AS Interserver_Connections
FROM merge('system', '^metric_log')
WHERE event_date >= toDate(now() - {seconds:UInt32})
  AND event_time >= now() - {seconds:UInt32}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,
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
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
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
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
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
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
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
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
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
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
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

interface NodeTabProps {
  host: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NodeTabComponent = (_props: NodeTabProps) => {
  const { connection } = useConnection();

  const dashboard = {
    version: 2,
    charts: [
      {
        title: "Node Status",
        collapsed: false,
        charts: serverStatusDashboard,
      } as DashboardGroup,
    ],
  } as Dashboard;

  const isClusterMode = connection && connection.cluster && connection.cluster.length > 0;
  if (isClusterMode) {
    dashboard.charts.push({
      title: "Cluster Status",
      collapsed: false,
      charts: clusterStatusDashboard,
    } as DashboardGroup);
  }

  dashboard.charts.push({
    title: "Node Overview Metrics",
    collapsed: false,
    charts: overviewMetricsDashboard,
  } as DashboardGroup);

  if (isClusterMode) {
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

export const NodeTab = memo(NodeTabComponent);

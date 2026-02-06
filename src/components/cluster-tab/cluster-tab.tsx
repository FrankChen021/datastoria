import type {
  DashboardGroup,
  SelectorFilterSpec,
  StatDescriptor,
  TableDescriptor,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPage from "@/components/shared/dashboard/dashboard-page";
import { memo } from "react";

const clusterStatusDashboard: StatDescriptor[] = [
  //
  // Shards
  //
  {
    type: "stat",
    titleOption: {
      title: "Shards",
    },
    gridPos: { w: 4, h: 4 },
    description: "Number of shards in the cluster",
    datasource: {
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
    gridPos: { w: 4, h: 4 },
    description: "Number of servers in the cluster",
    datasource: {
      sql: `
SELECT 
  count() 
FROM system.clusters
WHERE cluster = '{cluster}'
`,
    },
    drilldown: {
      main: {
        type: "table",
        titleOption: {
          title: "Server Count",
        },
        gridPos: { w: 24, h: 12 },
        miscOption: { enableIndexColumn: true },
        datasource: {
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
    gridPos: { w: 4, h: 4 },
    description: "Total data size in the cluster",
    datasource: {
      sql: `
SELECT 
sum(bytes_on_disk) as bytes_on_disk
FROM {clusterAllReplicas:system.parts}
WHERE active
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
        gridPos: { w: 24, h: 12 },
        description: "Number of servers in the cluster",
        datasource: {
          sql: `
SELECT
  FQDN() as host,
  sum(bytes_on_disk) AS bytes_on_disk,
  count(1) as part_count,
  sum(rows) as rows
FROM {clusterAllReplicas:system.parts}
WHERE active
GROUP BY host
ORDER BY host
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
    gridPos: { w: 4, h: 4 },
    description: "Total data size in the cluster",
    datasource: {
      sql: `
SELECT sum(total_space) FROM {clusterAllReplicas:system.disks}
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
        gridPos: { w: 24, h: 12 },
        datasource: {
          sql: `SELECT FQDN() as server, round(free_space * 100 / total_space, 2) as free_percentage, * FROM {clusterAllReplicas:system.disks} ORDER BY server`,
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
    gridPos: { w: 4, h: 4 },
    description: "The percentage of utilized disk space of the cluster",
    datasource: {
      sql: `
SELECT 1 - (sum(free_space) / sum(total_space)) FROM {clusterAllReplicas:system.disks}
`,
    },
    valueOption: {
      format: "percentage_0_1",
    },
  } as StatDescriptor,
];

const selectMetricsDashboard: TimeseriesDescriptor[] = [
  {
    type: "line",
    titleOption: { title: "Select Queries Per Second", align: "center" },
    gridPos: { w: 6, h: 6 },
    tooltipOption: { sortValue: "desc" },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_SelectQuery) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "Failed Queries Per Second", align: "center" },
    gridPos: { w: 6, h: 6 },
    tooltipOption: { sortValue: "none" },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_FailedQuery) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "SelectedRows", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_SelectedRows) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "SelectedBytes", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "binary_size_per_second" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_SelectedBytes) / {rounding:UInt32} as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "SelectedParts", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_SelectedParts) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "SelectedPartsTotal", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_SelectedPartsTotal) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "SelectedRanges", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_SelectedRanges) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "SelectedMarks", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_SelectedMarks) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "SelectedMarksTotal", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_SelectedMarksTotal) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
];

const insertMetricsDashboard: TimeseriesDescriptor[] = [
  {
    type: "line",
    titleOption: { title: "Insert Queries Per Second", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_InsertQuery) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "Insert Rows Per Second", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_InsertedRows) / {rounding:UInt32} as metric 
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "Insert Bytes Per Second", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "binary_size_per_second" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_InsertedBytes) / {rounding:UInt32} as metric 
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,

  {
    type: "line",
    titleOption: {
      title: "InsertQueryTimeMicroseconds",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "microsecond" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_InsertQueryTimeMicroseconds) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "AsyncInsertQuery", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_AsyncInsertQuery)
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "AsyncInsertBytes", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "binary_size_per_second" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_AsyncInsertBytes) / {rounding:UInt32} as metric 
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "AsyncInsertRows Per Second", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_AsyncInsertRows) / {rounding:UInt32} as metric 
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
];

const lockMetricsDashboard: TimeseriesDescriptor[] = [
  {
    type: "line",
    titleOption: { title: "ContextLockWait", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(CurrentMetric_ContextLockWait) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "ContextLockWaitMicroseconds",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "microsecond" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ContextLockWaitMicroseconds) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,

  {
    type: "line",
    titleOption: {
      title: "ProcessSelectListLock",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ProcessSelectListLock) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "RWLockAcquiredReadLocks",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_RWLockAcquiredReadLocks) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "RWLockAcquiredWriteLocks",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_RWLockAcquiredWriteLocks) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "RWLockReadersWaitMilliseconds",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "millisecond" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_RWLockReadersWaitMilliseconds) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "RWLockWritersWaitMilliseconds",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "millisecond" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_RWLockWritersWaitMilliseconds) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
];

const cacheMetricsDashboard: TimeseriesDescriptor[] = [
  {
    type: "line",
    titleOption: {
      title: "UncompressedCacheHits",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server, 
  sum(ProfileEvent_UncompressedCacheHits) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "UncompressedCacheMisses",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_UncompressedCacheMisses) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "UncompressedCacheWeightLost",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "binary_size" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_UncompressedCacheWeightLost) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "MarkCacheHits", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_MarkCacheHits) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "MarkCacheMisses", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_MarkCacheMisses) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "QueryCacheHits", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_QueryCacheHits) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "QueryCacheMisses", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_QueryCacheMisses) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
];

const osMetricsDashboard: TimeseriesDescriptor[] = [
  {
    type: "line",
    titleOption: {
      title: "OSCPUVirtualTimeMicroseconds",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "microsecond" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_OSCPUVirtualTimeMicroseconds) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "OSCPUWaitMicroseconds",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "microsecond" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_OSCPUWaitMicroseconds) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "OSIOWaitMicroseconds",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "microsecond" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_OSIOWaitMicroseconds) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "OSReadChars", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_OSReadChars) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "OSReadBytes", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "binary_size" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_OSReadBytes) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "OSWriteChars", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_OSWriteChars) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "OSWriteBytes", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "binary_size" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_OSWriteBytes) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "CurrentMetric_MemoryTracking", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "binary_size" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  max(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(CurrentMetric_MemoryTracking) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "CurrentMetric_GlobalThread", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  max(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(CurrentMetric_GlobalThread) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: { title: "CurrentMetric_GlobalThreadActive", align: "center" },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  max(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(CurrentMetric_GlobalThreadActive) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
];

const mergeMutationMetricsDashboard: TimeseriesDescriptor[] = [
  {
    type: "line",
    titleOption: {
      title: "BackgroundFetchesPoolTask",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(CurrentMetric_BackgroundFetchesPoolTask) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "BackgroundFetchesPoolSize",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(CurrentMetric_BackgroundFetchesPoolSize) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,

  {
    type: "line",
    titleOption: {
      title: "BackgroundMessageBrokerSchedulePoolTask",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  max(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(CurrentMetric_BackgroundMessageBrokerSchedulePoolTask) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "BackgroundMergesAndMutationsPoolSize",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(CurrentMetric_BackgroundMergesAndMutationsPoolSize) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
  GROUP BY event_time, server)
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "ReplicatedPartFailedFetches",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ReplicatedPartFailedFetches) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "ReplicatedPartFetches",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ReplicatedPartFetches) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "ReplicatedPartFetchesOfMerged",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ReplicatedPartFetchesOfMerged) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "ReplicatedPartMerges",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ReplicatedPartMerges) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
  {
    type: "line",
    titleOption: {
      title: "ReplicatedPartMutations",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: { placement: "bottom", values: ["min", "max", "last"] },
    fieldOptions: { metric: { format: "short_number" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ReplicatedPartMutations) as metric
FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String})
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String}
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
    },
  } as TimeseriesDescriptor,
];

const clusterZkMetricsDashboard: TimeseriesDescriptor[] = [
  // ProfileEvent_ZooKeeperBytesSent
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Bytes Sent",
      align: "center",
    },
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
    fieldOptions: { metric: { format: "binary_size_per_second" } },
    gridPos: { w: 12, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperBytesSent) / {rounding:UInt32} as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperBytesReceived
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Bytes Received",
      align: "center",
    },
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
    gridPos: { w: 12, h: 6 },
    fieldOptions: { metric: { format: "binary_size_per_second" } },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperBytesReceived) / {rounding:UInt32} as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperTransactions
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Transactions",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 12, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperTransactions) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperWaitMicroseconds
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Wait Microseconds",
      align: "center",
    },
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
    fieldOptions: { metric: { format: "microsecond" } },
    gridPos: { w: 12, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperWaitMicroseconds) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperCheck
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Check",
      align: "center",
    },
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperCheck) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperClose
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Close",
      align: "center",
    },
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperClose) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperCreate
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Create",
      align: "center",
    },
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperCreate) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperExists
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Exists",
      align: "center",
    },
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperExists) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperGet
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Get",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperGet) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperHardwareExceptions
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Hardware Exceptions",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperHardwareExceptions) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperInit
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Init",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperInit) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperList
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper List",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperList) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperMulti
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Multi",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperMulti) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperMultiRead
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Multi Read",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperMultiRead) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperMultiWrite
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Multi Write",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperMultiWrite) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperOtherExceptions
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Other Exceptions",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperOtherExceptions) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperReconfig
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Reconfig",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperReconfig) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperRemove
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Remove",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperRemove) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperSet
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Set",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperSet) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperSync
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Sync",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperSync) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperUserExceptions
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper User Exceptions",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperUserExceptions) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,

  // ProfileEvent_ZooKeeperWatchResponse
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Watch Response",
      align: "center",
    },
    legendOption: {
      placement: "none",
    },
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  FQDN() as server,
  sum(ProfileEvent_ZooKeeperWatchResponse) as metric
FROM {clusterAllReplicas:system.metric_log}
WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,
];

export const ClusterTab = memo(() => {
  return (
    <DashboardPage
      filterSpecs={[
        {
          filterType: "select",
          name: "FQDN()",
          displayText: "FQDN()",
          onPreviousFilters: true,
          datasource: {
            type: "sql",
            sql: `select distinct host_name from system.clusters WHERE cluster = '{cluster}' order by host_name`,
          },
        } as SelectorFilterSpec,
      ]}
      panels={{
        version: 3,
        filter: {},
        charts: [
          {
            title: "Cluster Status",
            collapsed: false,
            charts: clusterStatusDashboard,
          } as DashboardGroup,
          {
            title: "Selects",
            collapsed: false,
            charts: selectMetricsDashboard,
          } as DashboardGroup,
          {
            title: "Inserts",
            collapsed: false,
            charts: insertMetricsDashboard,
          } as DashboardGroup,
          {
            title: "Locks",
            collapsed: false,
            charts: lockMetricsDashboard,
          } as DashboardGroup,
          {
            title: "Cache",
            collapsed: false,
            charts: cacheMetricsDashboard,
          } as DashboardGroup,
          {
            title: "OS",
            collapsed: false,
            charts: osMetricsDashboard,
          } as DashboardGroup,
          {
            title: "Merge & Mutation",
            collapsed: false,
            charts: mergeMutationMetricsDashboard,
          } as DashboardGroup,
          {
            title: "ZooKeeper",
            collapsed: false,
            charts: clusterZkMetricsDashboard,
          } as DashboardGroup,
        ],
      }}
    />
  );
});

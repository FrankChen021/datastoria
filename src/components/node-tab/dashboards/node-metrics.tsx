import type { TimeseriesDescriptor } from "@/components/shared/dashboard/dashboard-model";

export const nodeMetricsDashboard: TimeseriesDescriptor[] = [
  //
  // Queries/second
  //
  {
    type: "line",
    titleOption: {
      title: "Queries/second",
      align: "center",
    },
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_Query) AS query_qps
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 AS cpu_cores
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(CurrentMetric_Query) AS queries_running
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(CurrentMetric_Merge) AS merges_running
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    fieldOptions: {
      selected_bytes: {
        format: "binary_size",
      },
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_SelectedBytes) AS selected_bytes
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSIOWaitMicroseconds) / 1000000 AS io_wait
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSCPUWaitMicroseconds) / 1000000 AS cpu_wait
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(value) AS OSUserTimeNormalized
FROM system.asynchronous_metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(value) AS OSSystemTimeNormalized
FROM system.asynchronous_metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    fieldOptions: {
      OSReadBytes: {
        format: "binary_size",
      },
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSReadBytes) AS OSReadBytes
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_OSReadChars) AS OSReadChars
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    fieldOptions: {
      memory_tracking_bytes: {
        format: "binary_size",
      },
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(CurrentMetric_MemoryTracking) AS memory_tracking_bytes
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    fieldOptions: {
      cache_bytes: {
        format: "binary_size",
      },
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  arraySum([COLUMNS('CurrentMetric_.*CacheBytes') EXCEPT 'CurrentMetric_FilesystemCache.*' APPLY avg]) AS cache_bytes
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(value) AS LoadAverage15
FROM system.asynchronous_metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_SelectedRows) AS selected_rows_per_second
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_InsertedRows) AS inserted_rows_per_second
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  avg(ProfileEvent_MergeSourceParts) AS TotalPartsOfMergeTreeTables
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  max(value) AS MaxPartCountForPartition
FROM system.asynchronous_metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
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
    gridPos: { w: 6, h: 6 },
    tooltipOption: {
      sortValue: "desc",
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  max(CurrentMetric_TCPConnection) AS TCP_Connections,
  max(CurrentMetric_MySQLConnection) AS MySQL_Connections,
  max(CurrentMetric_HTTPConnection) AS HTTP_Connections,
  max(CurrentMetric_InterserverConnection) AS Interserver_Connections
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t
ORDER BY t WITH FILL STEP {rounding:UInt32}
`,
    },
  } as TimeseriesDescriptor,
];

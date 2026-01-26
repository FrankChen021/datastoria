import type { TimeseriesDescriptor } from "@/components/shared/dashboard/dashboard-model";

export const nodeZkMetricsDashboard: TimeseriesDescriptor[] = [
  // ProfileEvent_ZooKeeperBytesReceived
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Bytes Received",
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
  sum(ProfileEvent_ZooKeeperBytesReceived)
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

  // ProfileEvent_ZooKeeperBytesSent
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Bytes Sent",
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
  sum(ProfileEvent_ZooKeeperBytesSent)
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

  // ProfileEvent_ZooKeeperCheck
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Check",
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
  sum(ProfileEvent_ZooKeeperCheck)
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

  // ProfileEvent_ZooKeeperClose
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Close",
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
  sum(ProfileEvent_ZooKeeperClose)
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

  // ProfileEvent_ZooKeeperCreate
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Create",
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
  sum(ProfileEvent_ZooKeeperCreate)
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

  // ProfileEvent_ZooKeeperExists
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Exists",
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
  sum(ProfileEvent_ZooKeeperExists)
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
  sum(ProfileEvent_ZooKeeperGet)
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
  sum(ProfileEvent_ZooKeeperHardwareExceptions)
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
  sum(ProfileEvent_ZooKeeperInit)
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
  sum(ProfileEvent_ZooKeeperList)
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
  sum(ProfileEvent_ZooKeeperMulti)
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
  sum(ProfileEvent_ZooKeeperMultiRead)
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
    sum(ProfileEvent_ZooKeeperMultiWrite)
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
  sum(ProfileEvent_ZooKeeperOtherExceptions)
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
  sum(ProfileEvent_ZooKeeperReconfig)
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
  sum(ProfileEvent_ZooKeeperRemove)
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
  sum(ProfileEvent_ZooKeeperSet)
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
  sum(ProfileEvent_ZooKeeperSync)
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
    gridPos: { w: 6, h: 6 },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  sum(ProfileEvent_ZooKeeperTransactions)
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
  sum(ProfileEvent_ZooKeeperUserExceptions)
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

  // ProfileEvent_ZooKeeperWaitMicroseconds
  {
    type: "line",
    titleOption: {
      title: "ZooKeeper Wait Microseconds",
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
  sum(ProfileEvent_ZooKeeperWaitMicroseconds)
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
  sum(ProfileEvent_ZooKeeperWatchResponse)
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

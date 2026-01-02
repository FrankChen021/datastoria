import type { TimeseriesDescriptor } from "@/components/shared/dashboard/dashboard-model";

export const clusterMetricsDashboard: TimeseriesDescriptor[] = [
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


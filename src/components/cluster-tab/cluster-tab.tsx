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

const clusterMetricsDashboard: TimeseriesDescriptor[] = [
  //
  // Insert Queries Per Second
  //
  {
    type: "line",
    titleOption: {
      title: "Insert Queries Per Second",
      align: "center",
    },
    gridPos: { w: 12, h: 6 },
    description: "Insert Queries Per Second",
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
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
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
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
    gridPos: { w: 12, h: 6 },
    description: "Select Queries Per Second",
    tooltipOption: {
      sortValue: "desc",
    },
    legendOption: {
      placement: "bottom",
      values: ["min", "max", "last"],
    },
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
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
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
    gridPos: { w: 12, h: 6 },
    description: "Failed Queries Per Second",
    tooltipOption: {
      sortValue: "none",
    },
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
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
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
    gridPos: { w: 12, h: 6 },
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
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_InsertedBytes) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
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
    gridPos: { w: 12, h: 6 },
    description: "Insert Rows Per Second",
    tooltipOption: {
      sortValue: "none",
    },
    fieldOptions: {
      metric: {
        format: "short_number",
      },
    },
    datasource: {
      sql: `
SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
  server,
  avg(metric) as metric
FROM (
  SELECT event_time, FQDN() as server, sum(ProfileEvent_InsertedRows) AS metric
  FROM {clusterAllReplicas:system.metric_log}
  WHERE {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
  GROUP BY event_time, server)
 GROUP BY t, server
ORDER BY t WITH FILL STEP {rounding:UInt32}`,
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
            title: "Cluster Metrics",
            collapsed: false,
            charts: clusterMetricsDashboard,
          } as DashboardGroup,
        ],
      }}
    />
  );
});

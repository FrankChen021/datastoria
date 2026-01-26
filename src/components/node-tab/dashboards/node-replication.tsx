import type {
  StatDescriptor,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";

export const nodeReplicationDashboard: StatDescriptor[] = [
  {
    type: "stat",
    titleOption: {
      title: "Replication Queue",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "Replication status",
    datasource: {
      sql: "SELECT count() FROM system.replication_queue",
    },
    drilldown: {
      main: {
        type: "table",
        titleOption: {
          title: "Replication Queue",
        },
        sortOption: {
          initialSort: {
            column: "count",
            direction: "desc",
          },
        },
        datasource: {
          sql: "SELECT database, table, count() as count FROM system.replication_queue GROUP BY database, table ORDER BY 3 DESC",
        },
      } as TableDescriptor,
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Replicated Part Fetches",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    datasource: {
      sql: `
SELECT
  sum(ProfileEvent_ReplicatedPartFetches)
FROM system.metric_log
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
`,
    },
    valueOption: {
      format: "short_number",
    },
  } as StatDescriptor,
];

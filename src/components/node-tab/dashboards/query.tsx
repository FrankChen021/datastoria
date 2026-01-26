import type {
  StatDescriptor,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";

export const queryDashboard: StatDescriptor[] = [
  {
    type: "stat",
    titleOption: {
      title: "Running queries",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of running queries",
    datasource: {
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
        datasource: {
          sql: `SELECT * FROM system.processes`,
        },
      } as TableDescriptor,
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Selected Queries",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of SELECT queries",
    datasource: {
      sql: `SELECT sum(ProfileEvent_SelectQuery) FROM system.metric_log 
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}`,
    },
    valueOption: {
      format: "short_number",
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Failed SELECTs",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of Failed SELECT queries",
    datasource: {
      sql: `SELECT sum(ProfileEvent_FailedSelectQuery) FROM system.metric_log 
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}`,
    },
    valueOption: {
      format: "short_number",
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "INSERT Queries",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of INSERT queries",
    datasource: {
      sql: `SELECT sum(ProfileEvent_InsertQuery) FROM system.metric_log 
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}`,
    },
    valueOption: {
      format: "short_number",
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Failed INSERTs",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of Failed INSERT queries",
    datasource: {
      sql: `SELECT sum(ProfileEvent_FailedInsertQuery) FROM system.metric_log 
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}`,
    },
    valueOption: {
      format: "short_number",
    },
  } as StatDescriptor,
  {
    type: "stat",
    titleOption: {
      title: "INSERT Rows",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of INSERT rows",
    datasource: {
      sql: `SELECT sum(ProfileEvent_InsertedRows) FROM system.metric_log 
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}`,
    },
    valueOption: {
      format: "short_number",
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "INSERT Bytes",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The total number of INSERT bytes",
    datasource: {
      sql: `SELECT sum(ProfileEvent_InsertedBytes) FROM system.metric_log 
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}`,
    },
    valueOption: {
      format: "binary_size",
    },
  } as StatDescriptor,
];

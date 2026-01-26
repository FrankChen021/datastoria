import type {
  StatDescriptor,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";

export const nodeMergeDashboard: StatDescriptor[] = [
  {
    type: "stat",
    titleOption: {
      title: "Ongoing Merges",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of ongoing merges",
    datasource: {
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
        datasource: {
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
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of ongoing mutations",
    datasource: {
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
        datasource: {
          sql: `SELECT database, table, create_time, mutation_id, command, parts_to_do, latest_fail_time, latest_fail_reason FROM system.mutations WHERE is_done = 0 ORDER BY create_time DESC`,
        },
      } as TableDescriptor,
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Number of Merges",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The total number of merged launched in background",
    datasource: {
      sql: `SELECT sum(ProfileEvent_Merge) FROM system.metric_log 
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
      title: "Number of Parts Merged",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The total number of parts merged launched in background",
    datasource: {
      sql: `SELECT sum(ProfileEvent_MergeSourceParts) FROM system.metric_log 
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
      title: "Number of Mutation Parts",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The total number of mutation parts launched in background",
    datasource: {
      sql: `SELECT sum(ProfileEvent_MutationTotalParts) FROM system.metric_log 
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}`,
    },
    valueOption: {
      format: "short_number",
    },
  } as StatDescriptor,
];

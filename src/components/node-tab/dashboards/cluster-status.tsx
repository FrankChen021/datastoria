import type {
  StatDescriptor,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";

export const clusterStatusDashboard: StatDescriptor[] = [
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
`,
    },
    drilldown: {
      main: {
        type: "table",
        titleOption: {
          title: "Server Count",
        },
        width: 4,
        miscOption: { enableIndexColumn: true },
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

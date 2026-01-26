import type {
  GaugeDescriptor,
  PanelDescriptor,
  StatDescriptor,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import { OpenDatabaseTabButton } from "@/components/table-tab/open-database-tab-button";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";

export const nodeOverviewDashboard: PanelDescriptor[] = [
  //
  // Server Version
  //
  {
    type: "stat",
    titleOption: {
      title: "Server Version",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The version of the server",
    datasource: {
      sql: "SELECT version()",
    },
    drilldown: {
      main: {
        type: "table",
        titleOption: {
          title: "system.build_options",
        },
        datasource: {
          sql: "SELECT * FROM system.build_options",
        },
      } as TableDescriptor,
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Server UP Time",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "How long the server has been running",
    datasource: {
      sql: "SELECT uptime() * 1000",
    },
    valueOption: {
      format: "days",
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Warnings",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "How long the server has been running",
    datasource: {
      sql: "SELECT count() FROM system.warnings",
    },
    drilldown: {
      main: {
        type: "table",
        titleOption: {
          title: "Warnings",
          description: "The number of warnings on the server",
        },
        datasource: {
          sql: "SELECT * FROM system.warnings",
        },
      } as TableDescriptor,
    },
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Last Error",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "How long the server has been running",
    datasource: {
      sql: "SELECT (toUnixTimestamp(now()) - toUnixTimestamp(max(last_error_time))) * 1000 FROM system.errors",
    },
    valueOption: {
      format: "relativeTime",
    },
    drilldown: {
      main: {
        type: "table",
        titleOption: {
          title: "Warnings",
          description: "The number of warnings on the server",
        },
        datasource: {
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
  } as StatDescriptor,

  {
    type: "stat",
    titleOption: {
      title: "Databases",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of databases on the server",
    datasource: {
      sql: "SELECT count() FROM system.databases",
    },
    drilldown: {
      main: {
        type: "table",
        titleOption: {
          title: "Databases",
          description: "Database Size",
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
            title: "Size Percentage of All Databases",
            format: "percentage_bar",
            formatArgs: [100, 16],
            width: 100,
          },
        },
        datasource: {
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
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of databases on the server",
    datasource: {
      sql: "SELECT count() FROM system.tables",
    },
    valueOption: {},
  } as StatDescriptor,
  {
    type: "stat",
    titleOption: {
      title: "Size of all tables",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    datasource: {
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
              return (
                <OpenTableTabButton
                  database={database}
                  table={tableName}
                  engine={engine}
                  showDatabase={false}
                />
              );
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
        datasource: {
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
    type: "gauge",
    titleOption: {
      title: "Used Storage",
    },
    gridPos: {
      w: 3,
      h: 3,
    },
    description: "The number of databases on the server",
    datasource: {
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
        datasource: {
          sql: `SELECT name, path, round((1 - free_space / total_space) * 100, 2) AS used_percent FROM system.disks`,
        },
      } as TableDescriptor,
    },
  } as GaugeDescriptor,
];

import type { TableDescriptor, TransposeTableDescriptor } from "@/components/dashboard/chart-utils";
import DashboardContainer, { type DashboardContainerRef } from "@/components/dashboard/dashboard-container";
import type { Dashboard } from "@/components/dashboard/dashboard-model";
import { CollapsibleDependencyView } from "@/components/dependency-view/collapsible-dependency-view";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import type { FormatName } from "@/lib/formatter";
import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import type { RefreshableTabViewRef } from "../table-tab/table-tab";

export interface DatabaseTabProps {
  database: string;
  tabId?: string;
}

interface TableInfo {
  database: string;
  name: string;
  engine: string;
  total_rows: number;
  total_bytes: number;
}

const DatabaseTabComponent = forwardRef<RefreshableTabViewRef, DatabaseTabProps>(({ database }, ref) => {
  const dashboardContainerRef = useRef<DashboardContainerRef>(null);

  const handleRefresh = useCallback(() => {
    // Refresh the dashboard container (which includes both the database info and tables)
    dashboardContainerRef.current?.refresh();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      refresh: handleRefresh,
      supportsTimeSpanSelector: false,
    }),
    [handleRefresh]
  );

  // Create dashboard with both the database info and tables descriptors
  const dashboard = useMemo<Dashboard>(() => {
    return {
      name: `database-${database}`,
      folder: "",
      title: "Database",
      filter: {
        showFilterInput: false,
        showTimeSpanSelector: false,
        showRefresh: false,
        showAutoRefresh: false,
      },
      charts: [
        {
          type: "stat",
          titleOption: {
            title: "Size of Database",
            align: "center",
          },
          collapsed: false,
          width: 1,
          query: {
            sql: `
SELECT
  sum(bytes_on_disk)
FROM
  system.parts 
WHERE
  active 
  AND database = '${database}'
`,
          },
          valueOption: {
            format: "binary_size",
          },
        },

        // Number of tables in the database
        {
          type: "stat",
          titleOption: {
            title: "Number of Tables",
            align: "center",
          },
          collapsed: false,
          width: 1,
          query: {
            sql: `
SELECT
  count()
FROM
  system.tables
WHERE
  database = '${database}'
`,
          },
        },

        // Number of tables in the database
        {
          type: "stat",
          titleOption: {
            title: "Size Percentage of All Disks",
            align: "center",
          },
          collapsed: false,
          width: 1,
          query: {
            sql: `
SELECT
    sum(bytes_on_disk) / (SELECT sum(total_space-keep_free_space) from system.disks) as size_percentage
FROM
  system.parts
WHERE
  database = '${database}'
  AND active = 1
`,
          },
          valueOption: {
            format: "percentage_0_1",
          },
        },

        {
          type: "stat",
          titleOption: {
            title: "Size Percentage of All Databases",
            align: "center",
          },
          collapsed: false,
          width: 1,
          query: {
            sql: `
SELECT
  database_size / total_size as size_percentage
FROM (
  SELECT
      sum(bytes_on_disk) as total_size,
      sumIf(bytes_on_disk, database = '${database}') as database_size
  FROM
    system.parts
  WHERE
    active = 1
)
`,
          },
          valueOption: {
            format: "percentage_0_1",
          },
        },

        // Database metadata
        {
          type: "transpose-table",
          id: `database-info-${database}`,
          titleOption: {
            title: "Database Metadata",
            align: "left",
          },
          collapsed: true,
          width: 100,
          query: {
            sql: `
select 
  *
from system.databases
where database = '${database}'
`,
          },
        } as TransposeTableDescriptor,
        {
          type: "table",
          id: `database-tables-${database}`,
          titleOption: {
            title: "Tables",
            align: "left",
          },
          collapsed: true,
          width: 100,
          query: {
            sql: `
SELECT
    T.name, 
    part.part_count, 
    part.rows, 
    part.on_disk_size, 
    part.uncompressed_size, 
    part.size_percent,
    T.engine, 
    T.metadata_modification_time,
    part.last_modification_time
FROM 
    system.tables AS T
LEFT JOIN
(
    SELECT 
        table,
        max(modification_time) as last_modification_time,
        count(1) as part_count,
        sum(rows) as rows,
        sum(bytes_on_disk) AS on_disk_size,
        sum(data_uncompressed_bytes) AS uncompressed_size,
        on_disk_size * 100 / (SELECT sum(bytes_on_disk) FROM system.parts WHERE database = '${database}') AS size_percent
    FROM
        system.parts
    WHERE database = '${database}'
    AND active
    GROUP BY table
) AS part
ON T.table = part.table
WHERE T.database = '${database}'
ORDER BY on_disk_size DESC
`,
          },
          fieldOptions: {
            name: {
              title: "Table Name",
              sortable: true,
              align: "left" as const,
              renderAction: (row: unknown) => {
                const tableRow = row as TableInfo;
                return (
                  <OpenTableTabButton
                    database={database}
                    table={tableRow.name}
                    engine={tableRow.engine}
                    showDatabase={false}
                  />
                );
              },
            },
            engine: {
              title: "Engine",
              sortable: true,
              align: "left" as const,
            },
            metadata_modification_time: {
              title: "Metadata Modified At",
              sortable: true,
              align: "left" as const,
              format: "yyyyMMddHHmmss" as FormatName,
            },
            last_modification_time: {
              title: "Data Modified At",
              sortable: true,
              align: "left" as const,
              format: "yyyyMMddHHmmss" as FormatName,
            },
            size_percent: {
              title: "Size Distribution in This Database",
              sortable: true,
              align: "left" as const,
              format: "percentage_bar" as FormatName,
            },
            part_count: {
              title: "Part Count",
              sortable: true,
              align: "center" as const,
              format: "comma_number" as FormatName,
            },
            on_disk_size: {
              title: "Size On Disk",
              sortable: true,
              align: "center" as const,
              format: "binary_size" as FormatName,
            },
            uncompressed_size: {
              title: "Uncompressed Size",
              sortable: true,
              align: "center" as const,
              format: "binary_size" as FormatName,
            },
          },
          sortOption: {
            initialSort: {
              column: "on_disk_size",
              direction: "desc",
            },
          },
        } as TableDescriptor,
      ],
    };
  }, [database]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden p-2 gap-2">
      <div className="flex-1 min-h-0">
        <DashboardContainer ref={dashboardContainerRef} dashboard={dashboard} hideTimeSpanSelector={true}>
          <CollapsibleDependencyView database={database} defaultOpen={false} className="flex-shrink-0" />
        </DashboardContainer>
      </div>
    </div>
  );
});

DatabaseTabComponent.displayName = "DatabaseTab";

export const DatabaseTab = memo(DatabaseTabComponent);

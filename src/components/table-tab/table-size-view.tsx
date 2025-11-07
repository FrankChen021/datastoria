import type { TableDescriptor } from "@/components/dashboard/chart-utils";
import DashboardContainer, { type DashboardContainerRef } from "@/components/dashboard/dashboard-container";
import type { Dashboard } from "@/components/dashboard/dashboard-model";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface TableSizeViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

export const TableSizeView = forwardRef<RefreshableTabViewRef, TableSizeViewProps>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ database, table, autoLoad: _autoLoad }, ref) => {
    const dashboardContainerRef = useRef<DashboardContainerRef>(null);

    useImperativeHandle(ref, () => ({
      refresh: (timeSpan?: TimeSpan) => {
        dashboardContainerRef.current?.refresh(timeSpan);
      },
    }));

    // Create dashboard with all table descriptors
    const dashboard = useMemo<Dashboard>(() => {
      return {
        name: `table-size-${database}-${table}`,
        folder: "table-size",
        title: "Table Size",
        filter: {},
        charts: [
          {
            type: "table",
            id: `table-size-${database}-${table}`,
            titleOption: {
              title: "Overall Size",
              align: "left",
            },
            isCollapsed: false,
            width: 100,
            query: {
              sql: `
SELECT 
    count(1) as partCount,
    sum(rows) as rows,
    sum(bytes_on_disk) AS diskSize,
    sum(data_uncompressed_bytes) AS uncompressedSize,
    round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS compressRatio,
    round(diskSize / rows, 2) AS avgRowSize
FROM
    system.parts
WHERE 
    database = '${database}' 
    AND table = '${table}'
    AND active = 1
ORDER BY 
    diskSize DESC`,
              headers: {
                "Content-Type": "text/plain",
              },
            },
            sortOption: {
              initialSort: {
                column: "diskSize",
                direction: "desc",
              },
              serverSideSorting: true,
            },
            fieldOptions: {
              partCount: {
                title: "Part Count",
                sortable: true,
                align: "center",
                format: "comma_number",
                position: 3,
              },
              rows: {
                title: "Rows",
                sortable: true,
                align: "center",
                format: "comma_number",
                position: 4,
              },
              avgRowSize: {
                title: "Avg Row Size",
                sortable: true,
                align: "center",
                format: "binary_size",
                position: 5,
              },
              diskSize: {
                title: "On Disk Size",
                sortable: true,
                align: "center",
                format: "binary_size",
                position: 6,
              },
              uncompressedSize: {
                title: "Uncompressed Size",
                sortable: true,
                align: "center",
                format: "binary_size",
                position: 7,
              },
              compressRatio: {
                title: "Compress Ratio",
                sortable: true,
                align: "center",
                position: 8,
                format: (value: unknown) => {
                  if (value === null || value === undefined) {
                    return "-";
                  }
                  return `${value} : 1`;
                },
              },
            },
          } as TableDescriptor,
          {
            type: "table",
            id: `column-size-${database}-${table}`,
            titleOption: {
              title: "Size By Column",
              align: "left",
            },
            isCollapsed: false,
            width: 100,
            query: {
              sql: `
SELECT 
    column,
    sum(column_data_compressed_bytes) AS compressed_size,
    sum(column_data_uncompressed_bytes) AS uncompressed_size,
    round(sum(column_data_uncompressed_bytes) / sum(column_data_compressed_bytes), 0) AS compress_ratio,
    sum(rows) AS rowsCount,
    round(sum(column_data_uncompressed_bytes) / sum(rows), 0) AS avg_uncompressed_size,
    compressed_size * 100 / (select sum(bytes_on_disk) from system.parts where database = '${database}' and table = '${table}' and active = 1) AS size_percentage_of_table
FROM 
    system.parts_columns
WHERE 
    database = '${database}' 
    AND table = '${table}'
    AND active = 1
GROUP BY 
    column
ORDER BY 
    compressed_size DESC`,
              headers: {
                "Content-Type": "text/plain",
              },
            },
            sortOption: {
              initialSort: {
                column: "compressed_size",
                direction: "desc",
              },
            },
            fieldOptions: {
              column: {
                title: "Column",
                sortable: true,
                align: "left",
              },
              rowsCount: {
                title: "Rows",
                sortable: true,
                align: "center",
                format: "comma_number",
              },
              uncompressed_size: {
                title: "Uncompressed Size",
                sortable: true,
                align: "center",
                format: "binary_size",
              },
              compressed_size: {
                title: "Compressed Size",
                sortable: true,
                align: "center",
                format: "binary_size",
              },
              size_percentage_of_table: {
                title: "Size Percentage of Table",
                sortable: true,
                align: "center",
                format: "percentage_bar",
              },
              compress_ratio: {
                title: "Compress Ratio",
                sortable: true,
                align: "left",
                format: (value: unknown) => {
                  if (value === null || value === undefined) {
                    return "-";
                  }
                  return `${value} : 1`;
                },
              },
              avg_uncompressed_size: {
                title: "Avg Uncompressed Size",
                sortable: true,
                align: "center",
                format: "binary_size",
              },
            },
          } as TableDescriptor,
          {
            type: "table",
            id: `index-size-${database}-${table}`,
            titleOption: {
              title: "Size By Index",
              align: "left",
            },
            isCollapsed: false,
            width: 100,
            query: {
              sql: `
SELECT *
FROM system.data_skipping_indices
WHERE
    database = '${database}'
    AND table = '${table}'`,
              headers: {
                "Content-Type": "text/plain",
              },
            },
            sortOption: {
              initialSort: {
                column: "data_compressed_bytes",
                direction: "desc",
              },
            },
            fieldOptions: {
              data_compressed_bytes: {
                sortable: true,
                align: "left",
                format: "binary_size",
              },
              data_uncompressed_bytes: {
                sortable: true,
                align: "left",
                format: "binary_size",
              },
            },
          } as TableDescriptor,
          {
            type: "table",
            id: `projection-size-${database}-${table}`,
            titleOption: {
              title: "Size By Projection",
              align: "left",
            },
            isCollapsed: false,
            width: 100,
            query: {
              sql: `
SELECT A.database, 
  A.table, 
  A.name, 
  A.type,
  B.part_count, 
  B.rows, 
  B.bytes_on_disk,
  B.parent_bytes_on_disk,
  B.bytes_on_disk * 100 / B.parent_bytes_on_disk as percentage_of_parent,
  B.last_modified_time,
  A.query
FROM system.projections AS A
LEFT JOIN
(
    SELECT 
        name, 
        count() as part_count, 
        sum(bytes_on_disk) as bytes_on_disk,
        sum(rows) as rows,
        sum(parent_bytes_on_disk) as  parent_bytes_on_disk,
        max(modification_time)  as last_modified_time
    FROM system.projection_parts
    WHERE
        database = '${database}'
        AND table = '${table}'
        AND active
    GROUP BY name
) AS B
ON A.name = B.name
ORDER BY 1, 2, 3`,
              headers: {
                "Content-Type": "text/plain",
              },
            },
            sortOption: {
              initialSort: {
                column: "",
                direction: "desc",
              },
            },
            fieldOptions: {
              bytes_on_disk: {
                sortable: true,
                align: "left",
                format: "binary_size",
              },
              rows: {
                sortable: true,
                align: "left",
                format: "comma_number",
              },
              parent_bytes_on_disk: {
                sortable: true,
                align: "left",
                format: "binary_size",
              },
              percentage_of_parent: {
                sortable: true,
                align: "left",
                format: "percentage_bar",
              },
            },
          } as TableDescriptor,
        ],
      };
    }, [database, table]);

    return (
      <div className="h-full flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
        <DashboardContainer
          ref={dashboardContainerRef}
          dashboard={dashboard}
          hideTimeSpanSelector={true}
        />
      </div>
    );
  }
);

TableSizeView.displayName = "TableSizeView";

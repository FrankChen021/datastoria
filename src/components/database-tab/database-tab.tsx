import type { TableDescriptor, TransposeTableDescriptor } from "@/components/dashboard/chart-utils";
import { TabManager } from "@/components/tab-manager";
import type { FormatName } from "@/lib/formatter";
import { useMemo } from "react";
import RefreshableTableComponent from "../dashboard/refreshable-table-component";
import RefreshableTransposedTableComponent from "../dashboard/refreshable-transposed-table-component";

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

export function DatabaseTab({ database }: DatabaseTabProps) {
  // Create transposed table descriptor for database info
  const databaseInfoDescriptor = useMemo<TransposeTableDescriptor>(() => {
    return {
      type: "transpose-table",
      id: `database-info-${database}`,
      titleOption: {
        title: "Database Information",
        align: "left",
      },
      isCollapsed: false,
      width: 100,
      query: {
        sql: `
select 
  name, engine, data_path, metadata_path, uuid, 
  (select sum(bytes_on_disk) from system.parts where active and database = '${database}') as size,
  (select sum(bytes_on_disk) from system.parts where active) as total_size,
  (select sum(total_space-keep_free_space) from system.disks) as disk_size,
  size * 100 / total_size as size_distribution,
  size * 100 / disk_size as size_on_disk_distribution
from system.databases
where database = '${database}'
`,
        headers: {
          "Content-Type": "text/plain",
        },
      },
      fieldOptions: {
        size: { format: "binary_size" },
        total_size: { format: "binary_size" },
        disk_size: { format: "short_number" },
        size_distribution: { title: "Size Percentage of All Databases", format: "percentage_bar" },
        size_on_disk_distribution: { title: "Size Percentage of All Disks", format: "percentage_bar" },
      },
    } as TransposeTableDescriptor;
  }, [database]);

  // Create table descriptor for tables list
  const tablesDescriptor = useMemo<TableDescriptor>(() => {
    const handleTableClick = (tableName: string, tableEngine: string) => {
      TabManager.sendOpenTableTabRequest(database, tableName, tableEngine);
    };

    const fieldOptions = {
      name: {
        title: "Table Name",
        sortable: true,
        align: "left" as const,
        renderAction: (row: unknown) => {
          const tableRow = row as TableInfo;
          return (
            <button
              onClick={() => handleTableClick(tableRow.name, tableRow.engine)}
              className="text-left text-primary underline decoration-dotted cursor-pointer"
            >
              {tableRow.name}
            </button>
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
      lastModificationTime: {
        title: "Data Modified At",
        sortable: true,
        align: "left" as const,
        format: "yyyyMMddHHmmss" as FormatName,
      },
      sizePercent: {
        title: "Size Distribution in This Database",
        sortable: true,
        align: "left" as const,
        format: "percentage_bar" as FormatName,
      },
      partCount: {
        title: "Part Count",
        sortable: true,
        align: "center" as const,
        format: "comma_number" as FormatName,
      },
      onDiskSize: {
        title: "Size On Disk",
        sortable: true,
        align: "center" as const,
        format: "binary_size" as FormatName,
      },
      uncompressedSize: {
        title: "Uncompressed Size",
        sortable: true,
        align: "center" as const,
        format: "binary_size" as FormatName,
      },
    };

    const sql = `
SELECT
    T.name, 
    T.engine, 
    T.metadata_modification_time,
    part.lastModificationTime,
    part.partCount, 
    part.rows, 
    part.onDiskSize, 
    part.uncompressedSize, 
    part.sizePercent 
FROM 
    system.tables AS T
LEFT JOIN
(
    SELECT 
        table,
        max(modification_time) as lastModificationTime,
        count(1) as partCount,
        sum(rows) as rows,
        sum(bytes_on_disk) AS onDiskSize,
        sum(data_uncompressed_bytes) AS uncompressedSize,
        onDiskSize * 100 / (SELECT sum(bytes_on_disk) FROM system.parts WHERE database = '${database}') AS sizePercent
    FROM
        system.parts
    WHERE database = '${database}'
    AND active
    GROUP BY table
) AS part
ON T.table = part.table
WHERE T.database = '${database}'
ORDER BY onDiskSize DESC
`;

    return {
      type: "table",
      id: `database-tables-${database}`,
      titleOption: {
        title: "Tables",
        align: "left",
      },
      isCollapsed: false,
      width: 100,
      query: {
        sql: sql,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
          output_format_json_quote_64bit_integers: 0,
        },
      },
      fieldOptions: fieldOptions,
      sortOption: {
        initialSort: {
          column: "onDiskSize",
          direction: "desc",
        },
      },
    };
  }, [database]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden relative">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Database Info */}
        <RefreshableTransposedTableComponent descriptor={databaseInfoDescriptor} />

        <RefreshableTableComponent descriptor={tablesDescriptor} />
      </div>
    </div>
  );
}

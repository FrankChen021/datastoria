import { CollapsibleSection } from "@/components/collapsible-section";
import FloatingProgressBar from "@/components/floating-progress-bar";
import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import "@/lib/number-utils";
import { toastManager } from "@/lib/toast";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

export interface TableSizeViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

export interface TableSizeViewRef {
  refresh: () => void;
}

interface TableSizeInfo {
  host?: string;
  disk_name?: string;
  partCount: number;
  rows: number;
  diskSize: number;
  uncompressedSize: number;
  compressRatio: number;
  avgRowSize?: number;
}

interface ColumnSizeInfo {
  column: string;
  compressedSize: number;
  uncompressedSize: number;
  compressRatio: number;
  rowsCount: number;
  avgUncompressedSize: number;
}

type TableSizeSortColumn =
  | "host"
  | "disk_name"
  | "partCount"
  | "rows"
  | "avgRowSize"
  | "diskSize"
  | "uncompressedSize"
  | "compressRatio";
type ColumnSizeSortColumn =
  | "column"
  | "compressedSize"
  | "uncompressedSize"
  | "compressRatio"
  | "rowsCount"
  | "avgUncompressedSize";
type SortDirection = "asc" | "desc" | null;

export const TableSizeView = forwardRef<TableSizeViewRef, TableSizeViewProps>(
  ({ database, table, autoLoad = false }, ref) => {
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useImperativeHandle(ref, () => ({
      refresh: () => {
        setRefreshTrigger((prev) => prev + 1);
      },
    }));

    return (
      <div className="space-y-2">
        <TableSizeViewImpl database={database} table={table} refreshTrigger={refreshTrigger} autoLoad={autoLoad} />
        <ColumnSizeView database={database} table={table} refreshTrigger={refreshTrigger} autoLoad={autoLoad} />
      </div>
    );
  }
);

TableSizeView.displayName = "TableSizeView";

function TableSizeViewImpl({
  database,
  table,
  refreshTrigger,
  autoLoad = false,
}: TableSizeViewProps & { refreshTrigger?: number; autoLoad?: boolean }) {
  const { selectedConnection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [sizeInfo, setSizeInfo] = useState<TableSizeInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<TableSizeSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [groupByHost, setGroupByHost] = useState(false);
  const [groupByDiskName, setGroupByDiskName] = useState(true);
  const apiCancellerRef = useRef<ApiCanceller | null>(null);
  const isMountedRef = useRef(true);

  const fetchTableSize = () => {
    if (!selectedConnection) {
      setError("No connection selected");
      return;
    }

    setIsLoading(true);
    setError(null);

    const api = Api.create(selectedConnection);

    // Build SELECT clause
    const selectFields: string[] = [];
    if (groupByHost) {
      selectFields.push("FQDN() as host");
    }
    if (groupByDiskName) {
      selectFields.push("disk_name");
    }
    selectFields.push("count(1) as partCount");
    selectFields.push("sum(rows) as rows");
    selectFields.push("sum(bytes_on_disk) AS diskSize");
    selectFields.push("sum(data_uncompressed_bytes) AS uncompressedSize");
    selectFields.push("round(sum(data_compressed_bytes) / sum(data_uncompressed_bytes) * 100, 0) AS compressRatio");
    selectFields.push("round(diskSize / rows, 2) AS avgRowSize");

    // Build GROUP BY clause
    const groupByFields: string[] = [];
    if (groupByHost) {
      groupByFields.push("host");
    }
    if (groupByDiskName) {
      groupByFields.push("disk_name");
    }

    // Build ORDER BY clause
    let orderByClause = "diskSize DESC";
    if (groupByHost && !groupByDiskName) {
      orderByClause = "host, diskSize DESC";
    } else if (groupByHost && groupByDiskName) {
      orderByClause = "host, disk_name";
    } else if (!groupByHost && groupByDiskName) {
      orderByClause = "diskSize DESC";
    } else {
      // Neither checkbox selected - just order by diskSize
      orderByClause = "diskSize DESC";
    }

    // Query table size from system.parts
    const sql = `
SELECT 
    ${selectFields.join(",\n    ")}
FROM
    system.parts
WHERE 
    database = '${database}' 
    AND table = '${table}'
    AND active = 1
${groupByFields.length > 0 ? `GROUP BY \n    ${groupByFields.join(",\n    ")}` : ""}
ORDER BY 
    ${orderByClause}`;

    const canceller = api.executeSQL(
      {
        sql: sql,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
        },
      },
      (response: ApiResponse) => {
        if (!isMountedRef.current) {
          return;
        }

        try {
          const data = response.data.data || [];
          // Ensure numeric fields are converted to numbers
          const processedData: TableSizeInfo[] = data.map((item: Record<string, unknown>) => ({
            host: item.host ? String(item.host) : undefined,
            disk_name: item.disk_name ? String(item.disk_name) : undefined,
            partCount: Number(item.partCount) || 0,
            rows: Number(item.rows) || 0,
            diskSize: Number(item.diskSize) || 0,
            uncompressedSize: Number(item.uncompressedSize) || 0,
            compressRatio: Number(item.compressRatio) || 0,
            avgRowSize: Number(item.avgRowSize) || 0,
          }));
          setSizeInfo(processedData);
          setIsLoading(false);
        } catch (err) {
          console.error("Error processing table size response:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          setIsLoading(false);
          toastManager.show(`Failed to process table size: ${errorMessage}`, "error");
        }
      },
      (error: ApiErrorResponse) => {
        if (!isMountedRef.current) return;

        const errorMessage = error.errorMessage || "Unknown error occurred";
        const lowerErrorMessage = errorMessage.toLowerCase();
        if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
          setIsLoading(false);
          return;
        }

        console.error("API Error:", error);
        setError(errorMessage);
        setIsLoading(false);
        toastManager.show(`Failed to load table size: ${errorMessage}`, "error");
      },
      () => {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    );

    apiCancellerRef.current = canceller;
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (autoLoad || (refreshTrigger !== undefined && refreshTrigger > 0)) {
      fetchTableSize();
    }

    return () => {
      isMountedRef.current = false;
      if (apiCancellerRef.current) {
        apiCancellerRef.current.cancel();
        apiCancellerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnection, database, table, groupByHost, groupByDiskName, refreshTrigger, autoLoad]);

  const handleSort = (column: TableSizeSortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleGroupByDiskNameChange = (checked: boolean) => {
    setGroupByDiskName(checked);
  };

  const handleGroupByHostChange = (checked: boolean) => {
    setGroupByHost(checked);
  };

  const sortedSizeInfo = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return sizeInfo;
    }

    return [...sizeInfo].sort((a, b) => {
      let aValue: number | string | undefined = a[sortColumn];
      let bValue: number | string | undefined = b[sortColumn];

      // Handle null/undefined values
      if (aValue == null) aValue = "";
      if (bValue == null) bValue = "";

      // Compare values
      let comparison = 0;
      if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [sizeInfo, sortColumn, sortDirection]);

  const getSortIcon = (column: TableSizeSortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="inline-block w-4 h-4 ml-1" />;
    }
    if (sortDirection === "desc") {
      return <ArrowDown className="inline-block w-4 h-4 ml-1" />;
    }
    return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
  };

  // Determine which columns to show
  const showHost = groupByHost;
  const showDiskName = groupByDiskName;

  return (
    <CollapsibleSection title="Table Size" className="relative">
      <div>
        <div className="p-2 border-b flex items-center gap-4 flex-wrap text-sm">
          GROUP BY:
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="groupByHost"
              checked={groupByHost}
              onChange={(e) => handleGroupByHostChange(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="groupByHost" className="text-sm cursor-pointer select-none">
              Host
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="groupByDiskName"
              checked={groupByDiskName}
              onChange={(e) => handleGroupByDiskNameChange(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="groupByDiskName" className="text-sm cursor-pointer select-none">
              Disk Name
            </label>
          </div>
        </div>
        <FloatingProgressBar show={isLoading} />
        {error ? (
          <div className="p-4">
            <div className="text-sm text-destructive">
              <p className="font-semibold mb-2">Error loading table size:</p>
              <p>{error}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  {showHost && (
                    <th
                      className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("host")}
                    >
                      Host{getSortIcon("host")}
                    </th>
                  )}
                  {showDiskName && (
                    <th
                      className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("disk_name")}
                    >
                      Disk Name{getSortIcon("disk_name")}
                    </th>
                  )}
                  <th
                    className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort("partCount")}
                  >
                    Part Count{getSortIcon("partCount")}
                  </th>
                  <th
                    className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort("rows")}
                  >
                    Rows{getSortIcon("rows")}
                  </th>
                  <th
                    className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort("avgRowSize")}
                  >
                    Avg Row Size{getSortIcon("avgRowSize")}
                  </th>
                  <th
                    className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort("diskSize")}
                  >
                    On Disk Size{getSortIcon("diskSize")}
                  </th>
                  <th
                    className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort("uncompressedSize")}
                  >
                    Uncompressed Size{getSortIcon("uncompressedSize")}
                  </th>
                  <th
                    className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort("compressRatio")}
                  >
                    Compress Ratio (%){getSortIcon("compressRatio")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSizeInfo.length === 0 && !isLoading && (
                  <tr>
                    <td
                      colSpan={(showHost ? 1 : 0) + (showDiskName ? 1 : 0) + 6}
                      className="p-4 text-center text-muted-foreground"
                    >
                      No size information found
                    </td>
                  </tr>
                )}
                {sortedSizeInfo.map((info, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    {showHost && <td className="p-2">{info.host || "-"}</td>}
                    {showDiskName && <td className="p-2">{info.disk_name || "-"}</td>}
                    <td className="p-2">{info.partCount?.toLocaleString() || "-"}</td>
                    <td className="p-2">{info.rows?.toLocaleString() || "-"}</td>
                    <td className="p-2">
                      {info.avgRowSize != null ? Number(info.avgRowSize).formatBinarySize() : "-"}
                    </td>
                    <td className="p-2">{info.diskSize != null ? Number(info.diskSize).formatBinarySize() : "-"}</td>
                    <td className="p-2">
                      {info.uncompressedSize != null ? Number(info.uncompressedSize).formatBinarySize() : "-"}
                    </td>
                    <td className="p-2">{info.compressRatio != null ? info.compressRatio : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

function ColumnSizeView({
  database,
  table,
  refreshTrigger,
  autoLoad = false,
}: TableSizeViewProps & { refreshTrigger?: number; autoLoad?: boolean }) {
  const { selectedConnection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [columnSizeInfo, setColumnSizeInfo] = useState<ColumnSizeInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<ColumnSizeSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const apiCancellerRef = useRef<ApiCanceller | null>(null);
  const isMountedRef = useRef(true);

  const fetchColumnSize = () => {
    if (!selectedConnection) {
      setError("No connection selected");
      return;
    }

    setIsLoading(true);
    setError(null);

    const api = Api.create(selectedConnection);

    // Query column size from system.parts_columns
    const sql = `
SELECT 
    column,
    sum(column_data_compressed_bytes) AS compressedSize,
    sum(column_data_uncompressed_bytes) AS uncompressedSize,
    round(sum(column_data_compressed_bytes) / sum(column_data_uncompressed_bytes) * 100, 0) AS compressRatio,
    sum(rows) AS rowsCount,
    round(sum(column_data_uncompressed_bytes) / sum(rows), 0) AS avgUncompressedSize
FROM 
    system.parts_columns
WHERE 
    database = '${database}' 
    AND table = '${table}'
    AND active = 1
GROUP BY 
    column
ORDER BY 
    sum(column_data_compressed_bytes) DESC`;

    const canceller = api.executeSQL(
      {
        sql: sql,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
        },
      },
      (response: ApiResponse) => {
        if (!isMountedRef.current) {
          return;
        }

        try {
          const data = response.data.data || [];
          // Ensure numeric fields are converted to numbers
          const processedData: ColumnSizeInfo[] = data.map((item: Record<string, unknown>) => ({
            column: String(item.column || ""),
            compressedSize: Number(item.compressedSize) || 0,
            uncompressedSize: Number(item.uncompressedSize) || 0,
            compressRatio: Number(item.compressRatio) || 0,
            rowsCount: Number(item.rowsCount) || 0,
            avgUncompressedSize: Number(item.avgUncompressedSize) || 0,
          }));
          setColumnSizeInfo(processedData);
          setIsLoading(false);
        } catch (err) {
          console.error("Error processing column size response:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          setIsLoading(false);
          toastManager.show(`Failed to process column size: ${errorMessage}`, "error");
        }
      },
      (error: ApiErrorResponse) => {
        if (!isMountedRef.current) return;

        const errorMessage = error.errorMessage || "Unknown error occurred";
        const lowerErrorMessage = errorMessage.toLowerCase();
        if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
          setIsLoading(false);
          return;
        }

        console.error("API Error:", error);
        setError(errorMessage);
        setIsLoading(false);
        toastManager.show(`Failed to load column size: ${errorMessage}`, "error");
      },
      () => {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    );

    apiCancellerRef.current = canceller;
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (autoLoad || (refreshTrigger !== undefined && refreshTrigger > 0)) {
      fetchColumnSize();
    }

    return () => {
      isMountedRef.current = false;
      if (apiCancellerRef.current) {
        apiCancellerRef.current.cancel();
        apiCancellerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnection, database, table, refreshTrigger, autoLoad]);

  const handleSort = (column: ColumnSizeSortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedColumnSizeInfo = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return columnSizeInfo;
    }

    return [...columnSizeInfo].sort((a, b) => {
      let aValue: number | string = a[sortColumn];
      let bValue: number | string = b[sortColumn];

      // Handle null/undefined values
      if (aValue == null) aValue = "";
      if (bValue == null) bValue = "";

      // Compare values
      let comparison = 0;
      if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [columnSizeInfo, sortColumn, sortDirection]);

  const getSortIcon = (column: ColumnSizeSortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="inline-block w-4 h-4 ml-1" />;
    }
    if (sortDirection === "desc") {
      return <ArrowDown className="inline-block w-4 h-4 ml-1" />;
    }
    return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
  };

  return (
    <CollapsibleSection title="Column Size" className="relative">
      <FloatingProgressBar show={isLoading} />
      {error ? (
        <div className="p-4">
          <div className="text-sm text-destructive">
            <p className="font-semibold mb-2">Error loading column size:</p>
            <p>{error}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th
                  className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("column")}
                >
                  Column{getSortIcon("column")}
                </th>
                <th
                  className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("rowsCount")}
                >
                  Rows{getSortIcon("rowsCount")}
                </th>
                <th
                  className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("compressedSize")}
                >
                  Compressed Size{getSortIcon("compressedSize")}
                </th>
                <th
                  className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("uncompressedSize")}
                >
                  Uncompressed Size{getSortIcon("uncompressedSize")}
                </th>
                <th
                  className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("compressRatio")}
                >
                  Compress Ratio (%){getSortIcon("compressRatio")}
                </th>
                <th
                  className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("avgUncompressedSize")}
                >
                  Avg Uncompressed Size{getSortIcon("avgUncompressedSize")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedColumnSizeInfo.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    No column size information found
                  </td>
                </tr>
              )}
              {sortedColumnSizeInfo.map((info, index) => (
                <tr key={index} className="border-b hover:bg-muted/50">
                  <td className="p-2">{info.column || "-"}</td>
                  <td className="p-2">{info.rowsCount?.toLocaleString() || "-"}</td>
                  <td className="p-2">
                    {info.compressedSize != null ? Number(info.compressedSize).formatBinarySize() : "-"}
                  </td>
                  <td className="p-2">
                    {info.uncompressedSize != null ? Number(info.uncompressedSize).formatBinarySize() : "-"}
                  </td>
                  <td className="p-2">{info.compressRatio != null ? info.compressRatio : "-"}</td>

                  <td className="p-2">
                    {info.avgUncompressedSize != null ? Number(info.avgUncompressedSize).formatBinarySize() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleSection>
  );
}

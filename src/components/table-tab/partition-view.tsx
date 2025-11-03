import { CollapsibleSection } from "@/components/collapsible-section";
import FloatingProgressBar from "@/components/floating-progress-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import "@/lib/number-utils";
import { toastManager } from "@/lib/toast";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Trash2 } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

export interface PartitionViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

export interface PartitionSizeViewRef {
  refresh: () => void;
}

interface PartitionSizeInfo {
  partition: string;
  partCount: number;
  rows: number;
  diskSize: number;
  uncompressedSize: number;
  compressRatio: number;
}

type SortColumn = "partition" | "partCount" | "rows" | "diskSize" | "uncompressedSize" | "compressRatio";
type SortDirection = "asc" | "desc" | null;

export const PartitionSizeView = forwardRef<PartitionSizeViewRef, PartitionViewProps>(
  ({ database, table, autoLoad = false }, ref) => {
    const { selectedConnection } = useConnection();
    const [isLoading, setIsLoading] = useState(false);
    const [partitionSizeInfo, setPartitionSizeInfo] = useState<PartitionSizeInfo[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [dropPartitionDialogOpen, setDropPartitionDialogOpen] = useState(false);
    const [partitionToDrop, setPartitionToDrop] = useState<string | null>(null);
    const [isDroppingPartition, setIsDroppingPartition] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const apiCancellerRef = useRef<ApiCanceller | null>(null);
    const dropPartitionCancellerRef = useRef<ApiCanceller | null>(null);
    const isMountedRef = useRef(true);

    useImperativeHandle(ref, () => ({
      refresh: () => {
        setRefreshTrigger((prev) => prev + 1);
      },
    }));

    const fetchPartitionSize = () => {
      if (!selectedConnection) {
        setError("No connection selected");
        return;
      }

      setIsLoading(true);
      setError(null);

      const api = Api.create(selectedConnection);

      // Query partition size from system.parts
      const sql = `
SELECT 
    partition,
    count(1) as partCount,
    sum(rows) as rows,
    sum(bytes_on_disk) AS diskSize,
    sum(data_uncompressed_bytes) AS uncompressedSize,
    round(sum(data_compressed_bytes) / sum(data_uncompressed_bytes) * 100, 0) AS compressRatio
FROM
    system.parts
WHERE 
    database = '${database}' 
    AND table = '${table}'
    AND active = 1
GROUP BY 
    partition
ORDER BY 
    diskSize DESC`;

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
          const processedData: PartitionSizeInfo[] = data.map((item: Record<string, unknown>) => ({
            partition: String(item.partition || ""),
            partCount: Number(item.partCount) || 0,
            rows: Number(item.rows) || 0,
            diskSize: Number(item.diskSize) || 0,
            uncompressedSize: Number(item.uncompressedSize) || 0,
            compressRatio: Number(item.compressRatio) || 0,
          }));
          setPartitionSizeInfo(processedData);
          setIsLoading(false);
        } catch (err) {
          console.error("Error processing partition size response:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          setIsLoading(false);
          toastManager.show(`Failed to process partition size: ${errorMessage}`, "error");
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
        toastManager.show(`Failed to load partition size: ${errorMessage}`, "error");
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
      if (autoLoad || refreshTrigger > 0) {
        fetchPartitionSize();
      }

      return () => {
        isMountedRef.current = false;
        if (apiCancellerRef.current) {
          apiCancellerRef.current.cancel();
          apiCancellerRef.current = null;
        }
        if (dropPartitionCancellerRef.current) {
          dropPartitionCancellerRef.current.cancel();
          dropPartitionCancellerRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedConnection, database, table, refreshTrigger, autoLoad]);

  const handleSort = (column: SortColumn) => {
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

  const sortedPartitionSizeInfo = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return partitionSizeInfo;
    }

    return [...partitionSizeInfo].sort((a, b) => {
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
  }, [partitionSizeInfo, sortColumn, sortDirection]);

  const getSortIcon = (column: SortColumn) => {
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

  const handleDropPartitionClick = (partition: string) => {
    setPartitionToDrop(partition);
    setDropPartitionDialogOpen(true);
  };

  const handleDropPartitionConfirm = () => {
    if (!selectedConnection || !partitionToDrop) {
      return;
    }

    setIsDroppingPartition(true);

    const api = Api.create(selectedConnection);
    // Escape single quotes by doubling them (SQL standard)
    const escapedPartition = partitionToDrop.replace(/'/g, "''");
    const sql = `ALTER TABLE \`${database}\`.\`${table}\` DROP PARTITION '${escapedPartition}'`;

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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (_response: ApiResponse) => {
        if (!isMountedRef.current) {
          return;
        }

        setIsDroppingPartition(false);
        setDropPartitionDialogOpen(false);
        setPartitionToDrop(null);
        toastManager.show(`Partition ${partitionToDrop} dropped successfully`, "success");

        // Refresh the partition list by removing the dropped partition
        setPartitionSizeInfo((prev) => prev.filter((p) => p.partition !== partitionToDrop));
      },
      (error: ApiErrorResponse) => {
        if (!isMountedRef.current) return;

        const errorMessage = error.errorMessage || "Unknown error occurred";
        const lowerErrorMessage = errorMessage.toLowerCase();
        if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
          setIsDroppingPartition(false);
          return;
        }

        console.error("API Error dropping partition:", error);
        setIsDroppingPartition(false);
        toastManager.show(`Failed to drop partition: ${errorMessage}`, "error");
      },
      () => {
        if (isMountedRef.current) {
          setIsDroppingPartition(false);
        }
      }
    );

    dropPartitionCancellerRef.current = canceller;
  };

  const handleDropPartitionCancel = () => {
    if (dropPartitionCancellerRef.current && isDroppingPartition) {
      dropPartitionCancellerRef.current.cancel();
    }
    setDropPartitionDialogOpen(false);
    setPartitionToDrop(null);
    setIsDroppingPartition(false);
  };

    return (
      <CollapsibleSection title="Table Size by Partition" className="relative" defaultOpen={true}>
        <FloatingProgressBar show={isLoading} />
        {error ? (
          <div className="p-4">
            <div className="text-sm text-destructive">
              <p className="font-semibold mb-2">Error loading partition size:</p>
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
                    onClick={() => handleSort("partition")}
                  >
                    Partition{getSortIcon("partition")}
                  </th>
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
                  <th className="text-left p-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedPartitionSizeInfo.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground">
                      No partition size information found
                    </td>
                  </tr>
                )}
                {sortedPartitionSizeInfo.map((info, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="p-2 ">{info.partition || "-"}</td>
                    <td className="p-2">{info.partCount?.toLocaleString() || "-"}</td>
                    <td className="p-2">{info.rows?.toLocaleString() || "-"}</td>
                    <td className="p-2 ">{info.diskSize != null ? Number(info.diskSize).formatBinarySize() : "-"}</td>
                    <td className="p-2 ">
                      {info.uncompressedSize != null ? Number(info.uncompressedSize).formatBinarySize() : "-"}
                    </td>
                    <td className="p-2">{info.compressRatio != null ? info.compressRatio : "-"}</td>
                    <td className="p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDropPartitionClick(info.partition)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Drop Partition Confirmation Dialog */}
        <Dialog open={dropPartitionDialogOpen} onOpenChange={(open) => !isDroppingPartition && setDropPartitionDialogOpen(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Drop Partition</DialogTitle>
              <DialogDescription>
                Are you sure you want to drop partition <strong>{partitionToDrop}</strong> from table{" "}
                <strong>{database}.{table}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={handleDropPartitionConfirm}
                disabled={isDroppingPartition}
              >
                {isDroppingPartition ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Dropping...
                  </>
                ) : (
                  "Drop Partition"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleDropPartitionCancel}
                disabled={isDroppingPartition}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CollapsibleSection>
    );
  }
);

PartitionSizeView.displayName = "PartitionSizeView";

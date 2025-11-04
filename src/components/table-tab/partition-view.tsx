import type { ColumnDef, TableDescriptor } from "@/components/dashboard/chart-utils";
import type { RefreshableComponent } from "@/components/dashboard/refreshable-component";
import RefreshableTableComponent from "@/components/dashboard/refreshable-table-component";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { Button } from "@/components/ui/button";
import { Api, type ApiErrorResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { toastManager } from "@/lib/toast";
import { Loader2, Trash2 } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Dialog } from "../use-dialog";
import type { RefreshableTabViewRef } from "./table-tab";

interface DropPartitionDialogProps {
  database: string;
  table: string;
  partition: string;
  connection: ReturnType<typeof Api.create>;
  onSuccess?: () => void;
}

function showDropPartitionDialog({ database, table, partition, connection, onSuccess }: DropPartitionDialogProps) {
  const isDroppingRef = { current: false };
  const abortControllerRef: { current: AbortController | null } = { current: null };
  const shouldCloseRef = { current: false };

  const handleDropPartition = async (): Promise<boolean> => {
    if (isDroppingRef.current) {
      return false; // Already dropping, don't close
    }

    isDroppingRef.current = true;

    try {
      // Escape single quotes by doubling them (SQL standard)
      const escapedPartition = partition.replace(/'/g, "''");
      const sql = `ALTER TABLE \`${database}\`.\`${table}\` DROP PARTITION '${escapedPartition}'`;

      // Create AbortController for cancellation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Execute the SQL using async/await
      await connection.executeAsync(
        {
          sql: sql,
          headers: {
            "Content-Type": "text/plain",
          },
          params: {
            default_format: "JSON",
          },
        },
        abortController.signal
      );

      isDroppingRef.current = false;
      toastManager.show(`Partition ${partition} dropped successfully`, "success");
      shouldCloseRef.current = true;

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      const errorMessage =
        error && typeof error === "object" && "errorMessage" in error
          ? (error as ApiErrorResponse).errorMessage
          : error instanceof Error
            ? error.message
            : "Unknown error occurred";

      const lowerErrorMessage = errorMessage.toLowerCase();
      if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
        isDroppingRef.current = false;
        return false;
      }

      console.error("API Error dropping partition:", error);
      isDroppingRef.current = false;
      toastManager.show(`Failed to drop partition: ${errorMessage}`, "error");
    } finally {
      abortControllerRef.current = null;
    }

    // Don't close immediately - wait for the operation
    return false;
  };

  const handleCancel = async (): Promise<boolean> => {
    if (abortControllerRef.current && isDroppingRef.current) {
      abortControllerRef.current.abort();
      isDroppingRef.current = false;
    }
    return true; // Close the dialog
  };

  // Reset state for new dialog
  isDroppingRef.current = false;
  shouldCloseRef.current = false;
  abortControllerRef.current = null;

  Dialog.showDialog({
    title: "Drop Partition",
    description: `Are you sure you want to drop partition ${partition} from table ${database}.${table}? This action cannot be undone.`,
    className: "max-w-2xl",
    dialogButtons: [
      {
        text: "Cancel",
        onClick: handleCancel,
        default: false,
        variant: "outline",
      },
      {
        text: "Drop Partition",
        onClick: handleDropPartition,
        default: true,
        variant: "destructive",
        disabled: false, // Explicitly enable button
        content: () => {
          // Show loading state when dropping
          if (isDroppingRef.current) {
            return (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin inline-block" />
                Dropping...
              </>
            );
          }
          return "Drop Partition";
        },
      },
    ],
    canClose: () => {
      // Allow closing if not dropping, or if we've marked it for closing
      return !isDroppingRef.current || shouldCloseRef.current;
    },
    disableBackdrop: false,
  });
}

export interface PartitionViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

export const PartitionSizeView = forwardRef<RefreshableTabViewRef, PartitionViewProps>(
  ({ database, table, autoLoad = false }, ref) => {
    const { selectedConnection } = useConnection();
    const tableComponentRef = useRef<RefreshableComponent>(null);
    const isMountedRef = useRef(true);

    useImperativeHandle(ref, () => ({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      refresh: (_timeSpan?: TimeSpan) => {
        // Force refresh by passing a unique timestamp to bypass the parameter change check
        // This ensures refresh always happens even if called multiple times with "same" parameters
        // Since partition view doesn't use timeSpan or inputFilter, we use it as a refresh trigger
        const refreshParam = { inputFilter: `refresh_${Date.now()}` };
        tableComponentRef.current?.refresh(refreshParam);
      },
    }));

    useEffect(() => {
      isMountedRef.current = true;
      if (autoLoad) {
        tableComponentRef.current?.refresh({});
      }

      return () => {
        isMountedRef.current = false;
      };
    }, [autoLoad]);

    const handleDropPartitionClick = useCallback(
      (partition: string) => {
        if (!selectedConnection) {
          return;
        }

        const api = Api.create(selectedConnection);
        showDropPartitionDialog({
          database,
          table,
          partition,
          connection: api,
          onSuccess: () => {
            // Refresh the table component to show updated data
            if (isMountedRef.current) {
              const refreshParam = { inputFilter: `refresh_${Date.now()}` };
              tableComponentRef.current?.refresh(refreshParam);
            }
          },
        });
      },
      [selectedConnection, database, table]
    );

    // Create table descriptor
    const tableDescriptor = useMemo<TableDescriptor>(() => {
      const columns: ColumnDef[] = [
        {
          name: "partition",
          title: "Partition",
          align: "center",
          sortable: true,
        },
        {
          name: "partCount",
          title: "Part Count",
          sortable: true,
          align: "center",
          format: "comma_number",
        },
        {
          name: "rows",
          title: "Rows",
          sortable: true,
          align: "center",
          format: "comma_number",
        },
        {
          name: "diskSize",
          title: "On Disk Size",
          sortable: true,
          align: "center",
          format: "binary_size",
        },
        {
          name: "uncompressedSize",
          title: "Uncompressed Size",
          sortable: true,
          align: "center",
          format: "binary_size",
        },
        {
          name: "compressRatio",
          title: "Compress Ratio (%)",
          sortable: true,
          align: "center",
        },
        {
          name: "action",
          title: "Action",
          align: "center",
          sortable: false,
          renderAction: (row: Record<string, unknown>) => {
            const partition = String(row.partition || "");
            return (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDropPartitionClick(partition)}
                className="h-4 w-4 p-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            );
          },
        },
      ];

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

      return {
        type: "table",
        id: `partition-view-${database}-${table}`,
        titleOption: {
          title: " Partitions",
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
          },
        },
        columns: columns,
        initialSort: {
          column: "partition",
          direction: "desc",
        },
      };
    }, [database, table, handleDropPartitionClick]);

    return <RefreshableTableComponent ref={tableComponentRef} descriptor={tableDescriptor} />;
  }
);

PartitionSizeView.displayName = "PartitionSizeView";

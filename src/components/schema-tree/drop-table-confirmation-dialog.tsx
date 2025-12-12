import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Dialog } from "@/components/use-dialog";
import { Api, type ApiCanceller, type ApiErrorResponse } from "@/lib/api";
import type { Connection } from "@/lib/connection/Connection";
import { StringUtils } from "@/lib/string-utils";
import { toastManager } from "@/lib/toast";
import { Loader2 } from "lucide-react";

interface TableNodeData {
  type: "table";
  database: string;
  table: string;
  fullName: string;
  tableEngine: string;
  fullTableEngine: string;
}

interface DropTableConfirmationDialogProps {
  table: TableNodeData;
  connection: Connection;
  onSuccess: () => void;
  onCancel?: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
function DropTableConfirmationDialogContent({
  table,
}: {
  table: TableNodeData;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">The following SQL will be executed:</p>
        <div className="overflow-x-auto border rounded-md">
          <ThemedSyntaxHighlighter
            language="sql"
            customStyle={{ fontSize: "14px", margin: 0 }}
            showLineNumbers={false}
          >
            {StringUtils.prettyFormatQuery(`DROP TABLE \`${table.database}\`.\`${table.table}\``)}
          </ThemedSyntaxHighlighter>
        </div>
      </div>
    </div>
  );
}

export function showDropTableConfirmationDialog({
  table,
  connection,
  onSuccess,
  onCancel,
}: DropTableConfirmationDialogProps) {
  // Use refs to track state that can be accessed by button handlers
  const isDroppingRef = { current: false };
  const dropTableCancellerRef: { current: ApiCanceller | null } = { current: null };
  const shouldCloseRef = { current: false };

  const handleDropTable = async (): Promise<boolean> => {
    if (isDroppingRef.current) {
      return false; // Already dropping, don't close
    }

    isDroppingRef.current = true;

    const api = Api.create(connection);
    const sql = `DROP TABLE \`${table.database}\`.\`${table.table}\``;

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
      () => {
        isDroppingRef.current = false;
        toastManager.show(`Table ${table.database}.${table.table} dropped successfully`, "success");
        onSuccess();
        shouldCloseRef.current = true;
      },
      (error: ApiErrorResponse) => {
        const errorMessage = error.errorMessage || "Unknown error occurred";
        const lowerErrorMessage = errorMessage.toLowerCase();
        if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
          isDroppingRef.current = false;
          return;
        }

        console.error("API Error dropping table:", error);
        isDroppingRef.current = false;
        toastManager.show(`Failed to drop table: ${errorMessage}`, "error");
      },
      () => {
        isDroppingRef.current = false;
      }
    );

    dropTableCancellerRef.current = canceller;
    return false; // Don't close immediately - wait for the operation
  };

  const handleCancel = async (): Promise<boolean> => {
    if (dropTableCancellerRef.current && isDroppingRef.current) {
      dropTableCancellerRef.current.cancel();
      isDroppingRef.current = false;
    }
    if (onCancel) {
      onCancel();
    }
    return true; // Close the dialog
  };

  const mainContent = <DropTableConfirmationDialogContent table={table} />;

  Dialog.showDialog({
    title: "Drop Table",
    description: `Are you sure you want to drop the table ${table.database}.${table.table}? This action cannot be undone.`,
    mainContent: mainContent,
    className: "max-w-2xl",
    dialogButtons: [
      {
        text: "Cancel",
        onClick: handleCancel,
        default: false,
        variant: "outline",
      },
      {
        text: "Drop Table",
        onClick: handleDropTable,
        default: true,
        variant: "destructive",
        disabled: false, // Explicitly enable button (Dialog API would disable it if content is defined)
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
          return "Drop Table";
        },
      },
    ],
    onCancel: () => {
      if (onCancel) {
        onCancel();
      }
    },
    canClose: () => {
      // Allow closing if not dropping, or if we've marked it for closing
      return !isDroppingRef.current || shouldCloseRef.current;
    },
    disableBackdrop: false,
  });
}

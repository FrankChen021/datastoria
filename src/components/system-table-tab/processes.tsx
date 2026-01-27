"use client";

import { useConnection } from "@/components/connection/connection-context";
import type {
  ActionColumn,
  Dashboard,
  FilterSpec,
  SelectorFilterSpec,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPage from "@/components/shared/dashboard/dashboard-page";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import { StringUtils } from "@/lib/string-utils";
import { Loader2, XCircle } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface ProcessesProps {
  database: string;
  table: string;
}

interface KillQueryButtonProps {
  row: Record<string, unknown>;
}

const KillQueryButton = memo(({ row }: KillQueryButtonProps) => {
  const { connection } = useConnection();
  const queryId = row.query_id as string;
  const isKillingRef = useRef(false);

  const handleKillQuery = useCallback(async () => {
    if (!queryId) {
      Dialog.alert({
        title: "Error",
        description: "Query ID is missing",
      });
      return;
    }

    if (!connection) {
      Dialog.alert({
        title: "Error",
        description: "Connection is not available",
      });
      return;
    }

    const query = (row.query as string) || "";

    const hasCluster = connection.cluster && connection.cluster.length > 0;
    const killQuery = hasCluster
      ? `KILL QUERY ON CLUSTER '${connection.cluster}' WHERE query_id = '${queryId.replace(/'/g, "''")}' SETTINGS distributed_ddl_task_timeout = 0`
      : `KILL QUERY WHERE query_id = '${queryId.replace(/'/g, "''")}'`;

    // Create a reactive component for the button content
    const KillButtonContent = () => {
      const [killingState, setKillingState] = useState(isKillingRef.current);

      // Poll for state changes from the ref
      useEffect(() => {
        const interval = setInterval(() => {
          const currentState = isKillingRef.current;
          if (currentState !== killingState) {
            setKillingState(currentState);
          }
        }, 50);
        return () => clearInterval(interval);
      }, [killingState]);

      return killingState ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Killing...
        </>
      ) : (
        "Kill Query"
      );
    };

    Dialog.confirm({
      title: "Kill Query",
      className: "max-w-[800px]",
      description: `Are you sure you want to kill this query?`,
      mainContent: (
        <div className="mt-4 space-y-2 pb-6">
          <div>
            <p className="text-sm font-medium mb-1">Running Query ID:</p>
            <p className="text-sm font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
              {queryId}
            </p>
          </div>
          {query && (
            <div>
              <p className="text-sm font-medium mb-2">Running Query:</p>
              <div className="border rounded-md overflow-auto bg-muted/30 max-h-[300px]">
                <ThemedSyntaxHighlighter
                  language="sql"
                  customStyle={{
                    margin: 0,
                    padding: "0.75rem",
                    fontSize: "12px",
                    backgroundColor: "transparent",
                  }}
                  wrapLongLines
                >
                  {StringUtils.prettyFormatQuery(query)}
                </ThemedSyntaxHighlighter>
              </div>
            </div>
          )}
          <p className="text-sm text-destructive">
            This action cannot be undone. The query will be terminated immediately.
          </p>
        </div>
      ),
      dialogButtons: [
        {
          text: "Cancel",
          onClick: async () => !isKillingRef.current,
          default: false,
          variant: "outline",
        },
        {
          content: <KillButtonContent />,
          onClick: async () => {
            isKillingRef.current = true;
            try {
              await connection.query(killQuery, {
                default_format: "JSON",
              }).response;

              // Wait at least seconds for better UX
              await new Promise((resolve) => setTimeout(resolve, 500));

              Dialog.alert({
                title: "Success",
                description: `Query ${queryId} has been killed successfully.`,
              });
              return true;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Failed to kill query";
              Dialog.alert({
                title: "Error",
                description: `Failed to kill query: ${errorMessage}`,
              });
              return false;
            } finally {
              isKillingRef.current = false;
            }
          },
          default: true,
          variant: "destructive",
        },
      ],
      canClose: () => {
        return !isKillingRef.current;
      },
    });
  }, [queryId, row, connection]);

  if (!queryId) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        handleKillQuery();
      }}
      className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
    >
      <XCircle className="h-3.5 w-3.5" />
    </Button>
  );
});

export const Processes = memo(({ database: _database, table: _table }: ProcessesProps) => {
  const { connection } = useConnection();

  const hasCluster = connection?.cluster && connection?.cluster.length > 0;

  // Build Dashboard configuration with table only
  const dashboard = useMemo<Dashboard>(() => {
    return {
      version: 3,
      filter: {},
      charts: [
        {
          type: "table",
          titleOption: { title: `System Processes`, showTitle: true, align: "left" },
          datasource: {
            sql: `SELECT ${hasCluster ? "FQDN() as host_name, " : ""} * FROM {clusterAllReplicas:system.processes} WHERE {filterExpression:String} ORDER BY elapsed DESC`,
          },
          headOption: { isSticky: true },
          sortOption: {
            serverSideSorting: true,
            initialSort: { column: "elapsed", direction: "desc" },
          },
          pagination: { mode: "server", pageSize: 100 },
          miscOption: {
            enableIndexColumn: true,
            enableShowRowDetail: true,
            enableCompactMode: true,
          },
          gridPos: { w: 24, h: 20 },
          fieldOptions: {
            query: { format: "sql", position: 2 },
            query_kind: { position: 3 },
            elapsed: { format: "millisecond", position: 4 },
            memory_usage: { format: "binary_size" },
            peak_memory_usage: { format: "binary_size" },
            read_rows: { format: "short_number" },
            read_bytes: { format: "binary_size" },
            written_rows: { format: "short_number" },
            written_bytes: { format: "binary_size" },
          },
          actions: [
            {
              title: "Action",
              align: "center",
              position: 1,
              renderAction: (row: Record<string, unknown>) => <KillQueryButton row={row} />,
            } as ActionColumn,
          ],
        } as TableDescriptor,
      ],
    };
  }, [connection]);

  const filterSpecs = useMemo<FilterSpec[]>(() => {
    return connection?.cluster && connection?.cluster.length > 0
      ? [
          {
            filterType: "select",
            name: "FQDN()",
            displayText: "FQDN",
            datasource: {
              type: "sql",
              sql: `select distinct host_name from system.clusters WHERE cluster = '{cluster}' order by FQDN()`,
            },
            defaultPattern: {
              comparator: "=",
              values: [connection!.metadata.remoteHostName],
            },
          } as SelectorFilterSpec,
        ]
      : [];
  }, []);

  return (
    <DashboardPage
      panels={dashboard}
      filterSpecs={filterSpecs}
      showInputFilter={false}
      timezone={connection?.metadata.timezone ?? "UTC"}
      showTimeSpanSelector={false}
      showRefresh={true}
      showAutoRefresh={true}
    />
  );
});

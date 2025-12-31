import { ConnectionWizard } from "@/components/connection/connection-wizard";
import { SchemaTreeLoader, type SchemaLoadResult } from "@/components/schema-tree/schema-tree-loader";
import { SchemaTreeView } from "@/components/schema-tree/schema-tree-view";
import { Button } from "@/components/ui/button";
import { Connection, type ConnectionMetadata, type DatabaseInfo, type TableInfo } from "@/lib/connection/connection";
import { useConnection } from "@/lib/connection/connection-context";
import { hostNameManager } from "@/lib/host-name-manager";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ConnectionSelectorDialog } from "./connection/connection-selector-dialog";
import { MainPageTabList } from "./main-page-tab-list";

/**
 * Extract table names and database names from schema load result
 */
function extractTableNames(result: SchemaLoadResult): {
  tableNames: Map<string, TableInfo>;
  databaseNames: Map<string, DatabaseInfo>;
} {
  const tableNames = new Map<string, TableInfo>();
  const databaseNames = new Map<string, DatabaseInfo>();

  for (const row of result.rows) {
    // Extract database names with comments
    if (row.database) {
      // Only set if not already set (to avoid overwriting with null comment from table/column rows)
      if (!databaseNames.has(row.database)) {
        databaseNames.set(row.database, {
          name: row.database,
          comment: row.dbComment || null,
        });
      }
    }

    // Extract table names
    if (row.database && row.table) {
      const qualifiedName = `${row.database}.${row.table}`;
      // Only set if not already set (to avoid overwriting with null comment from column rows)
      if (!tableNames.has(qualifiedName)) {
        tableNames.set(qualifiedName, {
          database: row.database,
          table: row.table,
          comment: row.tableComment || null,
        });
      }
    }
  }

  return { tableNames, databaseNames };
}

export type AppInitStatus = "initializing" | "connecting" | "ready" | "error";

interface MainPageLoadStatusComponentProps {
  status: AppInitStatus;
  connectionName?: string;
  error?: string | null;
  onRetry: () => void;
}

// Component for Initializing, Connecting or Error states (covers the whole page)
function MainPageLoadStatusComponent({ status, connectionName, error, onRetry }: MainPageLoadStatusComponentProps) {
  return (
    <div
      className={`h-full w-full flex flex-col items-center justify-center bg-muted/5 p-8 text-center animate-in duration-500 ${
        status === "error" ? "slide-in-from-bottom-4 duration-300" : "fade-in"
      }`}
    >
      {status === "initializing" && (
        <>
          <div className="bg-background p-4 ">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h3 className="text-lg font-medium mb-2">Initializing application...</h3>
          {/* Invisible spacer to match button height in error state */}
          <div className="h-10" />
        </>
      )}

      {status === "connecting" && (
        <>
          <div className="bg-background p-4 ">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h3 className="text-lg font-medium items-center mb-2">
            {connectionName ? (
              <>
                Connecting to <span className="underline">{connectionName}</span>
              </>
            ) : (
              "Connecting..."
            )}
          </h3>
          {/* Invisible spacer to match button height in error state */}
          <div className="h-10" />
        </>
      )}

      {status === "error" && (
        <>
          <div className="bg-destructive/10 p-4 rounded-full">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <h3 className="text-lg font-medium mb-2">Connection Failed</h3>
          <p className="text-muted-foreground max-w-md text-sm whitespace-pre-wrap mb-8">
            {error || "Unable to establish a connection to the server."}
          </p>
          <div className="flex gap-3">
            <Button onClick={onRetry} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
            <ConnectionSelectorDialog
              trigger={
                <Button variant="outline" className="gap-2">
                  Switch Connection
                </Button>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

// Initialize cluster info on a temporary connection and return the updates
async function getConnectionMetadata(connection: Connection): Promise<Partial<ConnectionMetadata>> {
  const { response } = connection.query(
    `
    SELECT currentUser(), 
    timezone(), 
    hasColumnInTable('system', 'functions', 'description'),
    hasColumnInTable('system', 'metric_log', 'ProfileEvent_MergeSourceParts'),
    hasColumnInTable('system', 'metric_log', 'ProfileEvent_MutationTotalParts')
`,
    { default_format: "JSONCompact" }
  );
  const apiResponse = await response;
  if (apiResponse.httpStatus === 200) {
    const returnNode = apiResponse.httpHeaders["x-clickhouse-server-display-name"];
    const internalUser = apiResponse.data.data[0][0];
    const timezone = apiResponse.data.data[0][1];

    const isCluster =
      connection.cluster && connection.cluster.length > 0 && connection.metadata.targetNode === undefined;
    return {
      targetNode: isCluster ? returnNode : undefined,
      internalUser: internalUser,
      timezone: timezone,
      function_table_has_description_column: apiResponse.data.data[0][2] ? true : false,
      metric_log_table_has_ProfileEvent_MergeSourceParts: apiResponse.data.data[0][3] ? true : false,
      metric_log_table_has_ProfileEvent_MutationTotalParts: apiResponse.data.data[0][4] ? true : false,
    };
  }

  return {};
}

export function MainPage() {
  const { connection, updateConnection, setIsReady, isReady, isInitialized } = useConnection();

  // State for global initialization status (driven by SchemaTreeView)
  const [initStatus, setInitStatus] = useState<AppInitStatus>("initializing");
  const [initError, setInitError] = useState<string | null>(null);
  const [loadedSchemaData, setLoadedSchemaData] = useState<SchemaLoadResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Main Loading Effect
  useEffect(() => {
    if (!connection) {
      return;
    }

    // Only load if connection is not ready yet
    if (isReady) {
      return;
    }
    setInitStatus("connecting");
    setInitError(null);

    let isMounted = true;
    const schemaLoader = new SchemaTreeLoader();

    const load = async () => {
      try {
        hostNameManager.clear();

        // Pre-load hostnames for shortening if cluster is configured
        if (connection.cluster) {
          try {
            const response = await connection.query(
              `SELECT host_name FROM system.clusters WHERE cluster = '${connection.cluster}'`,
              { default_format: "JSONCompact" }
            ).response;
            if (response.data && Array.isArray(response.data.data)) {
              const hostNames = response.data.data.map((row: any) => row[0]);
              hostNameManager.shortenHostnames(hostNames);
            }
          } catch (e) {
            // Ignore errors during hostname shortening initialization
            console.warn("Failed to load cluster hosts for shortening:", e);
          }
        }

        // 1. Initialize cluster info and get the updates
        const metadataUpdates = await getConnectionMetadata(connection);

        // 2. Create a temporary connection with cluster info for loading schema
        let tempConnection = connection;
        if (Object.keys(metadataUpdates).length > 0) {
          // Create a new connection object with metadata updates
          tempConnection = Object.create(Object.getPrototypeOf(connection));
          Object.assign(tempConnection, connection);
          tempConnection.metadata = { ...connection.metadata, ...metadataUpdates };
        }

        const startTime = Date.now();

        // 3. Load Schema data using the temporary connection
        const result = await schemaLoader.load(tempConnection);

        if (isMounted) {
          // 4. Extract table names and database names from schema result
          const { tableNames, databaseNames } = extractTableNames(result);

          // 5. Update connection context with metadata info including table names and database names
          updateConnection({
            ...metadataUpdates,
            tableNames,
            databaseNames,
          });

          const post = () => {
            setLoadedSchemaData(result);
            setInitStatus("ready");
            setIsReady(true);
          };

          const endTime = Date.now();
          const duration = endTime - startTime;
          if (duration < 800) {
            // Delay a little for better UX
            setTimeout(() => post(), 800 - duration);
          } else {
            post();
          }
        }
      } catch (err) {
        if (isMounted) {
          setTimeout(() => {
            setInitStatus("error");
            setInitError(err instanceof Error ? err.message : String(err));
          }, 300);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
      schemaLoader.abort();
    };
  }, [connection, updateConnection, setIsReady, isReady, retryCount]);

  useEffect(() => {
    if (isInitialized && !connection) {
      setInitStatus("connecting");
    }
  }, [isInitialized, connection]);

  // Show wizard if no connections exist
  if (isInitialized && !connection) {
    return <ConnectionWizard />;
  }

  // Show Full Page Status (Initializing/Connecting/Error)
  if (initStatus === "initializing" || initStatus === "connecting" || initStatus === "error") {
    return (
      <MainPageLoadStatusComponent
        status={initStatus}
        connectionName={connection ? connection.name : undefined}
        error={initError}
        onRetry={() => {
          setRetryCount((prev) => prev + 1);
        }}
      />
    );
  }

  return (
    <div className="h-full w-full flex min-w-0 overflow-hidden">
      <PanelGroup direction="horizontal" className="h-full w-full min-w-0">
        {/* Left Panel: Schema Tree View */}
        <Panel defaultSize={20} minSize={10} className="bg-background">
          <SchemaTreeView initialSchemaData={loadedSchemaData} />
        </Panel>

        <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors" />

        {/* Right Panel Group: Tabs for Query and Table Views */}
        <Panel defaultSize={80} minSize={50} className="bg-background">
          <MainPageTabList selectedConnection={connection} />
        </Panel>
      </PanelGroup>
    </div>
  );
}

import { useConnection } from "@/components/connection/connection-context";
import { ConnectionWizard } from "@/components/connection/connection-wizard";
import {
  SchemaTreeLoader,
  type SchemaLoadResult,
} from "@/components/schema-tree/schema-tree-loader";
import { SchemaTreeView } from "@/components/schema-tree/schema-tree-view";
import { Button } from "@/components/ui/button";
import {
  Connection,
  type ConnectionMetadata,
  type DatabaseInfo,
  type TableInfo,
} from "@/lib/connection/connection";
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
          columns: [],
        });
      }

      // Add column if it exists
      if (row.columnName) {
        const tableInfo = tableNames.get(qualifiedName);
        if (tableInfo && tableInfo.columns) {
          tableInfo.columns.push(row.columnName);
        }
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
function MainPageLoadStatusComponent({
  status,
  connectionName,
  error,
  onRetry,
}: MainPageLoadStatusComponentProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center animate-in duration-500 bg-background border shadow-lg rounded-sm min-w-[600px] min-h-[320px] ${
        status === "error" ? "slide-in-from-bottom-4 duration-300" : "fade-in zoom-in-95"
      }`}
    >
      {status === "initializing" && (
        <>
          <div className="p-4">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <h3 className="text-lg font-medium mb-2">Initializing application...</h3>
          {/* Invisible spacer to match button height in error state */}
          <div className="h-10" />
        </>
      )}

      {status === "connecting" && (
        <>
          <div className="p-4">
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
  const metadataQuery = connection.query(
    `SELECT currentUser(), 
    timezone(), 
    hasColumnInTable('system', 'functions', 'description'),
    hasColumnInTable('system', 'metric_log', 'ProfileEvent_MergeSourceParts'),
    hasColumnInTable('system', 'metric_log', 'ProfileEvent_MutationTotalParts')
`,
    { default_format: "JSONCompact" }
  );

  // Issue a dedicated query in case the query fails
  const functionQuery = await connection.query(
    `select 1 from system.functions where name = 'formatQuery'`,
    {
      default_format: "JSONCompact",
    }
  );

  let metadata: Partial<ConnectionMetadata> = {};

  const metadataResponse = await metadataQuery.response;
  if (metadataResponse.httpStatus === 200) {
    const returnNode = metadataResponse.httpHeaders["x-clickhouse-server-display-name"];
    const data = metadataResponse.data.json<any>();
    const internalUser = data.data[0][0];
    const timezone = data.data[0][1];

    const isCluster =
      connection.cluster &&
      connection.cluster.length > 0 &&
      connection.metadata.targetNode === undefined;
    metadata = {
      targetNode: isCluster ? returnNode : undefined,
      internalUser: internalUser,
      timezone: timezone,
      function_table_has_description_column: data.data[0][2] ? true : false,
      metric_log_table_has_ProfileEvent_MergeSourceParts: data.data[0][3] ? true : false,
      metric_log_table_has_ProfileEvent_MutationTotalParts: data.data[0][4] ? true : false,
    };
  }

  {
    const response = await functionQuery.response;
    if (response.httpStatus === 200) {
      const data = response.data.json<any>();
      if (data.data.length > 0) {
        const has_format_query_function = data.data[0][0];
        metadata.has_format_query_function = has_format_query_function ? true : false;
      }
    }
  }

  return metadata;
}

export function MainPage() {
  const { connection, pendingConfig, commitConnection, isInitialized, isConnectionAvailable } =
    useConnection();

  // State for global initialization status (driven by SchemaTreeView)
  const [initStatus, setInitStatus] = useState<AppInitStatus>("initializing");
  const [initError, setInitError] = useState<string | null>(null);
  const [loadedSchemaData, setLoadedSchemaData] = useState<SchemaLoadResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Main Loading Effect
  useEffect(() => {
    // If we have a pending config but no active public connection (or it doesn't match), we need to load.
    if (!pendingConfig) {
      return;
    }

    // Optimization: If public connection already matches pendingConfig and connection is available, we are done.
    if (connection && connection.name === pendingConfig.name && isConnectionAvailable) {
      return;
    }

    setInitStatus("connecting");
    setInitError(null);

    let isMounted = true;
    const schemaLoader = new SchemaTreeLoader();

    // 1. Create temporary runtime connection for initialization
    const newConnection = Connection.create(pendingConfig);

    const load = async () => {
      try {
        hostNameManager.clear();

        // Pre-load hostnames for shortening if cluster is configured
        if (newConnection.cluster) {
          try {
            const response = await newConnection.query(
              `SELECT host_name FROM system.clusters WHERE cluster = '${newConnection.cluster}'`,
              { default_format: "JSONCompact" }
            ).response;
            const data = response.data.json<any>();
            if (data && Array.isArray(data.data)) {
              const hostNames = data.data.map((row: any) => row[0]);
              hostNameManager.shortenHostnames(hostNames);
            }
          } catch (e) {
            // Ignore errors during hostname shortening initialization
            console.warn("Failed to load cluster hosts for shortening:", e);
          }
        }

        // 1. Initialize cluster info and get the updates
        const newMetadata = await getConnectionMetadata(newConnection);

        // 2. Apply metadata updates to tempConnection
        if (Object.keys(newMetadata).length > 0) {
          newConnection.metadata = { ...newConnection.metadata, ...newMetadata };
        }

        const startTime = Date.now();

        // 3. Load Schema data using the temporary connection
        const result = await schemaLoader.load(newConnection);

        if (isMounted) {
          // 4. Extract table names and database names from schema result
          const { tableNames, databaseNames } = extractTableNames(result);

          // 5. Apply table and database names to tempConnection metadata
          newConnection.metadata = {
            ...newConnection.metadata,
            tableNames,
            databaseNames,
          };

          const post = () => {
            setLoadedSchemaData(result);
            setInitStatus("ready");
            // 6. Commit the fully initialized connection to context
            commitConnection(newConnection);
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
  }, [pendingConfig, connection, commitConnection, retryCount, isConnectionAvailable]);

  useEffect(() => {
    if (isInitialized && !pendingConfig && !connection) {
      setInitStatus("connecting");
    }
  }, [isInitialized, pendingConfig, connection]);

  // Show wizard if no connections exist
  if (isInitialized && !pendingConfig && !connection) {
    return <ConnectionWizard />;
  }

  const isLoadingOrError =
    initStatus === "initializing" || initStatus === "connecting" || initStatus === "error";

  return (
    <div className="relative h-full w-full flex min-w-0 overflow-hidden">
      {isLoadingOrError && (
        <div className="absolute inset-0 z-50 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
          <MainPageLoadStatusComponent
            status={initStatus}
            connectionName={pendingConfig ? pendingConfig.name : connection?.name}
            error={initError}
            onRetry={() => {
              setRetryCount((prev) => prev + 1);
            }}
          />
        </div>
      )}

      <PanelGroup direction="horizontal" className="h-full w-full min-w-0">
        {/* Left Panel: Schema Tree View */}
        <Panel defaultSize={20} minSize={10} className="bg-background">
          <SchemaTreeView initialSchemaData={loadedSchemaData} />
        </Panel>

        <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors" />

        {/* Middle Panel: Tabs for Query and Table Views */}
        <Panel defaultSize={80} minSize={30} className="bg-background">
          <MainPageTabList selectedConnection={connection} />
        </Panel>
      </PanelGroup>
    </div>
  );
}

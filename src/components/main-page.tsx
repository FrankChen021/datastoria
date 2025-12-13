import { ConnectionWizard } from "@/components/connection/connection-wizard";
import { SchemaTreeLoader, type SchemaLoadResult } from "@/components/schema-tree/schema-tree-loader";
import { SchemaTreeView } from "@/components/schema-tree/schema-tree-view";
import { Button } from "@/components/ui/button";
import { Connection, type Session } from "@/lib/connection/connection";
import { useConnection } from "@/lib/connection/connection-context";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ConnectionSelectorDialog } from "./connection/connection-selector-dialog";
import { MainPageTabList } from "./main-page-tab-list";

export type AppInitStatus = "initializing" | "ready" | "error";

interface MainPageLoadStatusComponentProps {
  status: AppInitStatus;
  connectionName: string;
  error?: string | null;
  onRetry: () => void;
}

// Component for Initializing or Error states (covers the whole page)
function MainPageLoadStatusComponent({ status, connectionName, error, onRetry }: MainPageLoadStatusComponentProps) {
  if (status === "initializing") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 p-8 text-center animate-in fade-in duration-500">
        <div className="bg-background p-4 ">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
        <h3 className="text-lg font-medium mb-2">Connecting to Database: {connectionName}</h3>
        <p className="text-muted-foreground text-sm mb-8">Loading schema and verifying connection</p>
        {/* Invisible spacer to match button height in error state */}
        <div className="h-10" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 p-8 text-center animate-in slide-in-from-bottom-4 duration-300">
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
      </div>
    );
  }

  return null;
}

// Initialize cluster info on a temporary connection and return the updates
async function getSessionInfo(connection: Connection): Promise<Partial<Session>> {
  const { response } = connection.query(
    `
    SELECT currentUser(), timezone(), hasColumnInTable('system', 'functions', 'description')
`,
    { default_format: "JSONCompact" }
  );
  const apiResponse = await response;
  if (apiResponse.httpStatus === 200) {
    const returnNode = apiResponse.httpHeaders["x-clickhouse-server-display-name"];
    const internalUser = apiResponse.data.data[0][0];
    const timezone = apiResponse.data.data[0][1];
    const functionTableHasDescriptionColumn = apiResponse.data.data[0][2] as number;

    const isCluster =
      connection.cluster && connection.cluster.length > 0 && connection.session.targetNode === undefined;
    return {
      targetNode: isCluster ? returnNode : undefined,
      internalUser: internalUser,
      timezone: timezone,
      function_table_has_description_column: functionTableHasDescriptionColumn ? true : false,
    };
  }

  return {};
}

export function MainPage() {
  const { connection, updateConnection, setIsReady, isReady } = useConnection();

  // State for global initialization status (driven by SchemaTreeView)
  const [initStatus, setInitStatus] = useState<AppInitStatus>("initializing");
  const [initError, setInitError] = useState<string | null>(null);
  const [loadedSchemaData, setLoadedSchemaData] = useState<SchemaLoadResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Main Loading Effect
  useEffect(() => {
    // Reset if no connection
    if (!connection) {
      setInitStatus("ready");
      setLoadedSchemaData(null);
      return;
    }

    // Only load if connection is not ready yet
    if (isReady) {
      return;
    }

    let isMounted = true;
    const schemaLoader = new SchemaTreeLoader();

    const load = async () => {
      setInitStatus("initializing");
      setInitError(null);

      try {
        // 1. Initialize cluster info and get the updates
        const sessionUpdates = await getSessionInfo(connection);

        // 2. Create a temporary connection with cluster info for loading schema
        let tempConnection = connection;
        if (Object.keys(sessionUpdates).length > 0) {
          // Create a new connection object with session updates
          tempConnection = Object.create(Object.getPrototypeOf(connection));
          Object.assign(tempConnection, connection);
          tempConnection.session = { ...connection.session, ...sessionUpdates };
        }

        // 3. Load Schema data using the temporary connection
        const result = await schemaLoader.load(tempConnection);

        if (isMounted) {
          // 4. Update connection context with session info
          if (Object.keys(sessionUpdates).length > 0) {
            updateConnection(sessionUpdates);
          }

          setLoadedSchemaData(result);
          setInitStatus("ready");
          setIsReady(true);
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

  // Show wizard if no connections exist
  if (!connection) {
    return <ConnectionWizard />;
  }

  // Show Full Page Status (Loading/Error)
  if (initStatus === "initializing" || initStatus === "error") {
    return (
      <MainPageLoadStatusComponent
        status={initStatus}
        connectionName={connection.name}
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

        <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors cursor-col-resize" />

        {/* Right Panel Group: Tabs for Query and Table Views */}
        <Panel defaultSize={80} minSize={50} className="bg-background">
          <MainPageTabList selectedConnection={connection} />
        </Panel>
      </PanelGroup>
    </div>
  );
}

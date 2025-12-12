import { ConnectionWizard } from "@/components/connection/connection-wizard";
import { SchemaTreeLoader, type SchemaLoadResult } from "@/components/schema-tree/schema-tree-loader";
import { SchemaTreeView } from "@/components/schema-tree/schema-tree-view";
import { Button } from "@/components/ui/button";
import { Api } from "@/lib/api";
import type { Connection } from "@/lib/connection/Connection";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MainPageTabList } from "./main-page-tab-list";

export type AppInitStatus = "initializing" | "ready" | "error";

interface MainPageLoadStatusComponentProps {
  status: AppInitStatus;
  error?: string | null;
  onRetry?: () => void;
}

// Component for Initializing or Error states (covers the whole page)
function MainPageLoadStatusComponent({ status, error, onRetry }: MainPageLoadStatusComponentProps) {
  if (status === "initializing") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 p-8 text-center animate-in fade-in duration-500">
        <div className="bg-background p-4 rounded-full shadow-sm border mb-6">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
        <h3 className="text-lg font-medium mb-2">Connecting to Database...</h3>
        <p className="text-muted-foreground text-sm">Loading schema and verifying connection</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 p-8 text-center animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-destructive/10 p-4 rounded-full mb-6">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <h3 className="text-lg font-medium mb-2">Connection Failed</h3>
        <p className="text-muted-foreground max-w-md mb-8 text-sm whitespace-pre-wrap">
          {error || "Unable to establish a connection to the server."}
        </p>
        <div className="flex gap-3 mt-4">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Retry Connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

async function initializeClusterInfo(conn: Connection) {
  if (conn.cluster.length > 0 && conn.runtime?.targetNode === undefined) {
    // for cluster mode, pick a node as target node for further SQL execution
    const api = Api.create(conn!);
    const { response } = api.executeAsync("SELECT currentUser()", { default_format: "JSONCompact" });
    const apiResponse = await response;
    if (apiResponse.httpStatus === 200) {
      const returnServer = apiResponse.httpHeaders["x-clickhouse-server-display-name"];
      conn.runtime!.targetNode = returnServer;

      conn.runtime!.internalUser = apiResponse.data.data[0][0];
    }
  }

  return conn;
}

export function MainPage() {
  const { selectedConnection, hasAnyConnections } = useConnection();

  // State for global initialization status (driven by SchemaTreeView)
  const [initStatus, setInitStatus] = useState<AppInitStatus>("initializing");
  const [initError, setInitError] = useState<string | null>(null);
  const [loadedSchemaData, setLoadedSchemaData] = useState<SchemaLoadResult | null>(null);
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  // Main Loading Effect
  useEffect(() => {
    if (!selectedConnection) {
      setInitStatus("ready");
      setLoadedSchemaData(null);
      return;
    }

    let isMounted = true;
    const schemaLoader = new SchemaTreeLoader();

    const load = async () => {
      setInitStatus("initializing");
      setInitError(null);

      try {
        // 1. Ensure runtime is initialized
        await initializeClusterInfo(selectedConnection);

        // 2. Load Schema data
        const result = await schemaLoader.load(selectedConnection);

        if (isMounted) {
          setLoadedSchemaData(result);
          setInitStatus("ready");
          setSchemaLoaded(true);
        }
      } catch (err) {
        if (isMounted) {
          setInitStatus("error");
          setInitError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    load();

    return () => {
      isMounted = false;
      schemaLoader.cancel();
    };
  }, [selectedConnection]);

  // Reset when connection changes
  useEffect(() => {
    if (!selectedConnection) {
      setInitStatus("ready");
    }
    setSchemaLoaded(false);
  }, [selectedConnection]);

  // Show wizard if no connections exist
  if (!hasAnyConnections) {
    return <ConnectionWizard />;
  }

  // Show Full Page Status (Loading/Error)
  if (initStatus === "initializing" || initStatus === "error") {
    return (
      <MainPageLoadStatusComponent status={initStatus} error={initError} onRetry={() => window.location.reload()} />
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
          <MainPageTabList selectedConnection={selectedConnection} schemaLoaded={schemaLoaded} />
        </Panel>
      </PanelGroup>
    </div>
  );
}

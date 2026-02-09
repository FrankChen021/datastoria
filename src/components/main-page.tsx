import { ChatPanel } from "@/components/chat/view/chat-panel";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import { ConnectionWizard } from "@/components/connection/connection-wizard";
import { useReleaseDetector } from "@/components/release-note/release-detector";
import { openReleaseNotes } from "@/components/release-note/release-notes-view";
import {
  SchemaTreeLoader,
  type SchemaLoadResult,
} from "@/components/schema-tree/schema-tree-loader";
import { SidebarPanel } from "@/components/sidebar-panel/sidebar-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetOverlay, SheetPortal, SheetTrigger } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Connection,
  QueryError,
  type ConnectionConfig,
  type DatabaseInfo,
  type JSONCompactFormatResponse,
  type TableInfo,
} from "@/lib/connection/connection";
import { hostNameManager } from "@/lib/host-name-manager";
import { SqlUtils } from "@/lib/sql-utils";
import { cn } from "@/lib/utils";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { AlertCircle, CheckCircle2, Circle, Database, Loader2, RotateCcw, Zap } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { AppLogo } from "./app-logo";
import { ConnectionSelectorDialog } from "./connection/connection-selector-dialog";
import { MainPageTabList } from "./main-page-tab-list";
import { SchemaTreeView } from "./schema-tree/schema-tree-view";

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
          engine: row.tableEngine || null,
          columns: [],
        });
      }

      // Add column if it exists (with type information if available)
      if (row.columnName) {
        const tableInfo = tableNames.get(qualifiedName);
        if (tableInfo) {
          // Initialize columns as array of objects if not already initialized
          if (!tableInfo.columns) {
            tableInfo.columns = [];
          }
          // If columns is string[], convert to object format
          if (
            Array.isArray(tableInfo.columns) &&
            tableInfo.columns.length > 0 &&
            typeof tableInfo.columns[0] === "string"
          ) {
            const oldColumns = tableInfo.columns as string[];
            tableInfo.columns = oldColumns.map((name) => ({ name, type: "Unknown" }));
          }
          // Add new column with type
          (tableInfo.columns as Array<{ name: string; type: string }>).push({
            name: row.columnName,
            type: row.columnType || "Unknown",
          });
        }
      }
    }
  }

  return { tableNames, databaseNames };
}

// Initialize cluster info on a temporary connection and update metadata directly
async function getConnectionMetadata(connection: Connection): Promise<void> {
  // Use FQDN instead of hostname is that the hostname returns short name on k8s,
  // which fails to resolve in remote function
  const metadataQuery = connection
    .query(
      `SELECT currentUser(), 
      timezone(),
      FQDN()`,
      { default_format: "JSONCompact" }
    )
    .response.then((metadataResponse) => {
      if (metadataResponse.httpStatus === 200) {
        const data = metadataResponse.data.json<JSONCompactFormatResponse>();
        const internalUser = data.data[0][0];
        const timezone = data.data[0][1];
        const hostname = data.data[0][2] as string;
        // Index mapping for JSONCompact row:
        // 0: currentUser()
        // 1: timezone()
        // 2: FQDN()

        const isCluster = connection.cluster && connection.cluster.length > 0;
        connection.metadata = {
          ...connection.metadata,
          displayName: hostname,
          remoteHostName: isCluster ? hostname : undefined,
          internalUser: internalUser as string,
          timezone: timezone as string,
        };
      }
    });

  // Separate queries for column checks - each query is independent and failures are ignored
  const functionTableQuery = connection
    .query(
      `SELECT 
    hasColumnInTable('system', 'functions', 'description'),
    (SELECT 1 FROM system.functions WHERE name = 'formatQuery' LIMIT 1)`,
      { default_format: "JSONCompact" }
    )
    .response.then((response) => {
      if (response.httpStatus === 200) {
        const data = response.data.json<JSONCompactFormatResponse>();
        connection.metadata = {
          ...connection.metadata,
          function_table_has_description_column: Boolean(data.data[0]?.[0]),
          has_format_query_function: Boolean(data.data[0]?.[1]),
        };
      }
    })
    .catch((e) => {
      console.warn("Failed to check system.functions table:", e);
    });

  const metricLogTableQuery = connection
    .query(
      `SELECT 
    hasColumnInTable('system', 'metric_log', 'ProfileEvent_MergeSourceParts'),
    hasColumnInTable('system', 'metric_log', 'ProfileEvent_MutationTotalParts')`,
      { default_format: "JSONCompact" }
    )
    .response.then((response) => {
      if (response.httpStatus === 200) {
        const data = response.data.json<JSONCompactFormatResponse>();
        connection.metadata = {
          ...connection.metadata,
          metric_log_table_has_ProfileEvent_MergeSourceParts: Boolean(data.data[0]?.[0]),
          metric_log_table_has_ProfileEvent_MutationTotalParts: Boolean(data.data[0]?.[1]),
        };
      }
    })
    .catch((e) => {
      console.warn("Failed to check metric_log table columns:", e);
    });

  const queryLogTableQuery = connection
    .query(`SELECT hasColumnInTable('system', 'query_log', 'hostname')`, {
      default_format: "JSONCompact",
    })
    .response.then((response) => {
      if (response.httpStatus === 200) {
        const data = response.data.json<JSONCompactFormatResponse>();
        connection.metadata = {
          ...connection.metadata,
          query_log_table_has_hostname_column: Boolean(data.data[0]?.[0]),
        };
      }
    })
    .catch((e) => {
      console.warn("Failed to check query_log_table_has_hostname_column:", e);
    });

  const partLogTableQuery = connection
    .query(`SELECT hasColumnInTable('system', 'part_log', 'hostname')`, {
      default_format: "JSONCompact",
    })
    .response.then((response) => {
      if (response.httpStatus === 200) {
        const data = response.data.json<JSONCompactFormatResponse>();
        connection.metadata = {
          ...connection.metadata,
          part_log_table_has_node_name_column: Boolean(data.data[0]?.[0]),
        };
      }
    })
    .catch((e) => {
      console.warn("Failed to check part_log_table_has_node_name_column:", e);
    });

  // Pre-load hostnames for shortening if cluster is configured
  const clusterTableQuery = connection.cluster
    ? connection
        .query(
          `SELECT host_name FROM system.clusters WHERE cluster = '${SqlUtils.escapeSqlString(connection.cluster)}'`,
          {
            default_format: "JSONCompact",
          }
        )
        .response.then((clusterHostResponse) => {
          if (clusterHostResponse.httpStatus === 200) {
            const data = clusterHostResponse.data.json<JSONCompactFormatResponse>();
            if (data && Array.isArray(data.data)) {
              const hostNames = data.data.map((row) => row[0] as string);
              hostNameManager.shortenHostnames(hostNames);
            }
          }
        })
        .catch((e) => {
          console.warn("Failed to load cluster hosts for shortening:", e);
        })
    : Promise.resolve();

  const settingsQuery = connection
    .query(
      `SELECT name, value, readonly FROM system.settings WHERE name in ('skip_unavailable_shards')`,
      {
        default_format: "JSONCompact",
      }
    )
    .response.then((settingsResponse) => {
      if (settingsResponse.httpStatus === 200) {
        const data = settingsResponse.data.json<JSONCompactFormatResponse>();
        if (data.data.length > 0) {
          connection.metadata = {
            ...connection.metadata,
            is_readonly_skip_unavailable_shards: data.data[0][2] ? true : false,
          };
        }
      }
    });

  // Fetch ProfileEvents from system.events for SQL validation
  const profileEventsQuery = connection
    .query(`SELECT DISTINCT event FROM system.events ORDER BY event`, {
      default_format: "JSONCompact",
    })
    .response.then((eventsResponse) => {
      if (eventsResponse.httpStatus === 200) {
        const data = eventsResponse.data.json<JSONCompactFormatResponse>();
        connection.metadata = {
          ...connection.metadata,
          profileEvents: new Set(data.data.map((row) => row[0] as string)),
        };
      }
    })
    .catch((e) => {
      console.warn("Failed to load ProfileEvents:", e);
      // Don't fail initialization if ProfileEvents fetch fails
    });

  await Promise.all([
    metadataQuery,
    clusterTableQuery,
    settingsQuery,
    profileEventsQuery,
    functionTableQuery,
    metricLogTableQuery,
    queryLogTableQuery,
    partLogTableQuery,
  ]);
}

type StepStatus = "pending" | "loading" | "success" | "error";

interface LoadingStep {
  id: string;
  text: string;
  status: StepStatus;
}

interface ConnectionInitializerProps {
  config: ConnectionConfig | null;
  onReady: (connection: Connection, schemaData: SchemaLoadResult) => void;
}

function ConnectionInitializer({ config, onReady }: ConnectionInitializerProps) {
  const [steps, setSteps] = useState<LoadingStep[]>([
    { id: "init", text: "Initializing...", status: "loading" },
    { id: "cluster", text: "Load cluster", status: "pending" },
    { id: "schema", text: "Load schema", status: "pending" },
  ]);

  const [error, setError] = useState<string | null>(null);

  const updateStep = (id: string, status: StepStatus, label?: string) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, status, text: label ?? step.text } : step))
    );
  };

  const handleRetry = () => {
    setError(null);
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === "init" && !config) return { ...step, status: "loading" };
        if (step.id === "init" && config) return { ...step, status: "success" };
        return { ...step, status: "pending" };
      })
    );
  };

  // Clear error and reset steps when config changes (e.g., when switching connections)
  useEffect(() => {
    setError(null);
    setSteps([
      { id: "init", text: "Initializing, please wait...", status: "loading" },
      { id: "cluster", text: "Load cluster", status: "pending" },
      { id: "schema", text: "Load schema", status: "pending" },
    ]);
  }, [config]);

  useEffect(() => {
    // Prevent double execution or execution when already failed
    if (error) return;

    // If no config, we just stay in init loading state
    if (!config) {
      updateStep("init", "loading");
      return;
    }

    // Config is present, mark init as success
    updateStep("init", "success", `Initialized with connection: ${config.name}`);

    let isMounted = true;
    const schemaLoader = new SchemaTreeLoader();
    const newConnection = Connection.create(config);

    const run = async () => {
      try {
        // Clear hostname cache (simple operation, no step needed)
        hostNameManager.clear();

        // Step 1: Cluster & Metadata
        updateStep("cluster", "loading", "Loading cluster metadata " + config.url);
        await getConnectionMetadata(newConnection);
        updateStep("cluster", "success");

        // Step 2: Schema
        updateStep("schema", "loading", "Loading schema");
        const startTime = Date.now();
        const result = await schemaLoader.load(newConnection);

        if (!isMounted) return;

        const { tableNames, databaseNames } = extractTableNames(result);
        newConnection.metadata = {
          ...newConnection.metadata,
          tableNames,
          databaseNames,
        };

        // Small delay for UX if it loads too fast
        // Finish
        const endTime = Date.now();
        const duration = endTime - startTime;
        if (duration < 1_000) {
          setTimeout(() => {
            if (isMounted) {
              updateStep("schema", "success");
              onReady(newConnection, result);
            }
          }, 1_000 - duration);
        } else {
          updateStep("schema", "success");
          onReady(newConnection, result);
        }
      } catch (err) {
        if (isMounted) {
          setSteps((prev) => {
            const failedStepIndex = prev.findIndex((s) => s.status === "loading");
            if (failedStepIndex !== -1) {
              const newSteps = [...prev];
              newSteps[failedStepIndex] = {
                ...newSteps[failedStepIndex],
                status: "error",
              };
              return newSteps;
            }
            // Fallback if error happened before any step started loading or after
            return prev.map((s) => (s.id === "cluster" ? { ...s, status: "error" } : s));
          });
          if (err instanceof QueryError) {
            setError(err.data || err.message);
          } else {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      }
    };

    run();

    return () => {
      isMounted = false;
      schemaLoader.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, error]); // Only re-run if config changes or we retry (clearing error)

  // Show executed steps (success) and the current executing step (loading/pending/error)
  const visibleSteps = steps.filter((step) => {
    // Show all completed steps
    if (step.status === "success") return true;
    // Show the first non-success step (current executing step)
    const firstNonSuccessIndex = steps.findIndex((s) => s.status !== "success");
    return firstNonSuccessIndex !== -1 && steps.indexOf(step) === firstNonSuccessIndex;
  });

  return (
    <div className="w-full max-w-2xl flex flex-col overflow-hidden">
      <Card className="w-full relative flex-shrink-0">
        <CardHeader className="text-center space-y-0 pb-8">
          <div className="flex justify-center items-center">
            <AppLogo width={64} height={64} />
            <CardTitle>DataStoria</CardTitle>
          </div>
          <CardDescription className="text-base text-muted-foreground">
            AI-powered ClickHouse management console with visualization and insights
          </CardDescription>
        </CardHeader>
        {/* px-14 makes it alignt to above description */}
        <CardContent className="space-y-3 px-14">
          <div>
            {visibleSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-3 text-sm w-full py-1">
                <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                  {step.status === "loading" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {step.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {step.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                  {step.status === "pending" && (
                    <Circle className="h-3 w-3 text-muted-foreground/30" />
                  )}
                </div>
                <span
                  className={`truncate flex-1 text-left
                    ${step.status === "pending" ? "text-muted-foreground" : "text-foreground"}
                    ${step.status === "error" ? "text-destructive font-medium" : ""}
                    ${step.status === "loading" ? "font-medium" : ""}
                  `}
                >
                  {step.text}
                </span>
              </div>
            ))}
          </div>

          {error && (
            <div className="w-full max-h-[200px] overflow-y-auto px-3 py-2 bg-destructive/10 rounded-md text-sm text-destructive whitespace-pre-wrap break-words border border-destructive/20 text-left">
              {error}
            </div>
          )}

          {error && (
            <div className="flex gap-3 pt-2 items-center justify-center">
              <Button onClick={handleRetry} variant="outline" className="gap-2 w-40">
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
              <ConnectionSelectorDialog
                defaultConnectionName={config?.name}
                trigger={
                  <Button variant="outline" className="gap-2 w-40">
                    Switch Connection
                  </Button>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Panel size constants
const DEFAULT_SCHEMA_PANEL_SIZE = 20;
const _DEFAULT_TAB_PANEL_SIZE = 80; // Kept for reference, tabs/chat now use relative sizes in nested group

function NewReleaseBanner() {
  const { hasNewRelease } = useReleaseDetector();

  if (!hasNewRelease) return null;

  return (
    <div className="bg-blue-600 text-white  rounded-none px-4 py-1 flex items-center justify-between shadow-md z-20 animate-in fade-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3">
        <Zap className="h-4 w-4 animate-pulse" />
        <span className="text-sm font-medium">
          A new version is available with exciting updates!
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs bg-white/10 border-white/20 hover:bg-white/20 text-white border-none ml-2"
          onClick={openReleaseNotes}
        >
          See what's new
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs bg-white text-blue-600 hover:bg-white/90"
          onClick={() => window.location.reload()}
        >
          Update Now
        </Button>
      </div>
    </div>
  );
}

export function MainPage() {
  const { connection, pendingConfig, commitConnection, isInitialized, isConnectionAvailable } =
    useConnection();
  const { status: sessionStatus } = useSession();

  const { displayMode, close: closeChatPanel } = useChatPanel();
  const [loadedSchemaData, setLoadedSchemaData] = useState<SchemaLoadResult | null>(null);
  const isMobile = useIsMobile();
  const [schemaSheetOpen, setSchemaSheetOpen] = useState(false);

  // Refs for panel control
  const schemaPanelRef = useRef<ImperativePanelHandle>(null);
  const tabsPanelRef = useRef<ImperativePanelHandle>(null);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);

  const handleReady = (newConnection: Connection, result: SchemaLoadResult) => {
    setLoadedSchemaData(result);
    commitConnection(newConnection);
  };

  // Resize panels when display mode changes (layout side-effect)
  // Skip on mobile; mobile uses sheet + full-screen chat instead of resizable panels
  useLayoutEffect(() => {
    if (isMobile) return;
    const rafId = requestAnimationFrame(() => {
      switch (displayMode) {
        case "hidden":
          // Schema tree visible, tabs take full content area, no chat
          schemaPanelRef.current?.resize(DEFAULT_SCHEMA_PANEL_SIZE);
          tabsPanelRef.current?.resize(100); // 100% of content area
          break;
        case "panel":
          // Schema tree visible, tabs and chat share content area
          schemaPanelRef.current?.resize(DEFAULT_SCHEMA_PANEL_SIZE);
          tabsPanelRef.current?.resize(60); // 60% of content area
          chatPanelRef.current?.resize(40); // 40% of content area
          break;
        case "tabWidth":
          // Schema tree visible, chat takes full content area, tabs collapsed
          schemaPanelRef.current?.resize(DEFAULT_SCHEMA_PANEL_SIZE);
          tabsPanelRef.current?.resize(0);
          chatPanelRef.current?.resize(100); // 100% of content area
          break;
        case "fullscreen":
          // Chat takes full width, schema collapsed, tabs collapsed
          schemaPanelRef.current?.resize(0);
          tabsPanelRef.current?.resize(0);
          chatPanelRef.current?.resize(100);
          break;
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [displayMode, isMobile]);

  // Determine if we should show the initializer overlay
  // Case 1: App is not initialized yet (booting up)
  // Case 2: Session still loading — avoid flashing empty wizard; show initializer until storage is ready
  // Case 3: App initialized, but switching connections (initializing new connection)
  const showInitializer =
    !isInitialized ||
    (sessionStatus === "loading" && !connection && !pendingConfig) ||
    (!!pendingConfig &&
      (!connection || connection.name !== pendingConfig.name || !isConnectionAvailable));
  if (showInitializer) {
    return (
      <div className="relative h-full w-full flex min-w-0 overflow-hidden">
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh] px-8 pb-8">
          <ConnectionInitializer config={pendingConfig || null} onReady={handleReady} />
        </div>
      </div>
    );
  }

  // Show wizard ONLY if:
  // 1. App is fully initialized
  // 2. Session has resolved (so storage identity is set and we've had a chance to load saved connections)
  // 3. No pending config (not currently connecting)
  // 4. No active connection (fresh state)
  const showWizard = isInitialized && sessionStatus !== "loading" && !pendingConfig && !connection;
  if (showWizard) {
    return <ConnectionWizard />;
  }

  // Mobile: one view at a time — chat full-screen when open, else tabs + schema in a sheet
  if (isMobile) {
    if (displayMode !== "hidden") {
      return (
        <div className="relative h-full w-full flex min-w-0 overflow-hidden">
          <ChatPanel onClose={closeChatPanel} />
        </div>
      );
    }
    return (
      <div className="relative h-full w-full flex flex-col min-w-0 overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 border-b bg-background px-2 py-1.5">
          <SidebarTrigger className="h-8 w-8" />
          <Sheet open={schemaSheetOpen} onOpenChange={setSchemaSheetOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                aria-label="Open schema browser"
              >
                <Database className="h-4 w-4" />
                Schema
              </Button>
            </SheetTrigger>
            <SheetPortal>
              <SheetOverlay />
              <SheetPrimitive.Content
                className={cn(
                  "fixed z-50 gap-4 bg-background shadow-lg transition ease-in-out",
                  "data-[state=open]:animate-in data-[state=closed]:animate-out",
                  "data-[state=closed]:duration-300 data-[state=open]:duration-500",
                  "inset-y-0 left-0 h-full w-3/4 border-r",
                  "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
                  "w-[min(320px,85vw)] p-0 flex flex-col overflow-hidden"
                )}
                aria-describedby={undefined}
              >
                <div className="flex-1 min-h-0 overflow-auto p-2">
                  <SchemaTreeView initialSchemaData={loadedSchemaData} />
                </div>
              </SheetPrimitive.Content>
            </SheetPortal>
          </Sheet>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <MainPageTabList selectedConnection={connection} />
        </div>
      </div>
    );
  }

  const showSchemaTree = displayMode !== "fullscreen";
  const showTabsVisible = displayMode === "hidden" || displayMode === "panel";
  const showChatPanel = displayMode !== "hidden";

  return (
    <div className="relative h-full w-full flex flex-col min-w-0 overflow-hidden">
      <NewReleaseBanner />
      <div className="flex-1 relative flex min-w-0 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full w-full min-w-0">
          {/* Left Panel: Schema Tree View - always mounted, hidden in fullscreen */}
          <Panel
            ref={schemaPanelRef}
            defaultSize={showSchemaTree ? DEFAULT_SCHEMA_PANEL_SIZE : 0}
            minSize={0}
            className={`bg-background ${!showSchemaTree ? "hidden" : ""}`}
          >
            <SidebarPanel initialSchemaData={loadedSchemaData} />
          </Panel>

          {showSchemaTree && (
            <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors" />
          )}

          {/* Right Panel: Contains both Tabs and Chat in a nested layout */}
          <Panel
            defaultSize={100 - DEFAULT_SCHEMA_PANEL_SIZE}
            minSize={20}
            className="bg-background"
          >
            {/* Nested PanelGroup for Tabs and Chat */}
            <PanelGroup direction="horizontal" className="h-full w-full">
              {/* Tabs Panel - always mounted, visibility controlled by CSS */}
              <Panel
                ref={tabsPanelRef}
                defaultSize={showTabsVisible ? (showChatPanel ? 60 : 100) : 0}
                minSize={0}
                className={`bg-background ${!showTabsVisible ? "!w-0 !min-w-0 !max-w-0 overflow-hidden" : ""}`}
              >
                <div className={!showTabsVisible ? "hidden" : "h-full"}>
                  <MainPageTabList selectedConnection={connection} />
                </div>
              </Panel>

              {/* Resize Handle between Tabs and Chat - only when both visible */}
              {showTabsVisible && showChatPanel && (
                <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors" />
              )}

              {/* Chat Panel */}
              {showChatPanel && (
                <Panel
                  ref={chatPanelRef}
                  defaultSize={showTabsVisible ? 40 : 100}
                  minSize={20}
                  className="bg-background"
                >
                  <ChatPanel onClose={closeChatPanel} />
                </Panel>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

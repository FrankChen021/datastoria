import { ChatPanel } from "@/components/chat/view/chat-panel";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import { ConnectionWizard } from "@/components/connection/connection-wizard";
import {
  SchemaTreeLoader,
  type SchemaLoadResult,
} from "@/components/schema-tree/schema-tree-loader";
import { SchemaTreeView } from "@/components/schema-tree/schema-tree-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Connection,
  type ConnectionConfig,
  type DatabaseInfo,
  type JSONCompactFormatResponse,
  type TableInfo,
} from "@/lib/connection/connection";
import { hostNameManager } from "@/lib/host-name-manager";
import { AlertCircle, CheckCircle2, Circle, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { AppLogo } from "./app-logo";
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
    FQDN(),
    hasColumnInTable('system', 'functions', 'description'),
    hasColumnInTable('system', 'metric_log', 'ProfileEvent_MergeSourceParts'),
    hasColumnInTable('system', 'metric_log', 'ProfileEvent_MutationTotalParts'),
    hasColumnInTable('system', 'query_log', 'hostname'),
    hasColumnInTable('system', 'part_log', 'node_name')
`,
      { default_format: "JSONCompact" }
    )
    .response.then((metadataResponse) => {
      if (metadataResponse.httpStatus === 200) {
        const data = metadataResponse.data.json<JSONCompactFormatResponse>();
        const internalUser = data.data[0][0];
        const timezone = data.data[0][1];
        const hostname = data.data[0][2] as string;

        const isCluster = connection.cluster && connection.cluster.length > 0;
        connection.metadata = {
          ...connection.metadata,
          displayName: hostname,
          remoteHostName: isCluster ? hostname : undefined,
          internalUser: internalUser as string,
          timezone: timezone as string,

          // Table columns
          function_table_has_description_column: data.data[0][2] ? true : false,
          metric_log_table_has_ProfileEvent_MergeSourceParts: data.data[0][3] ? true : false,
          metric_log_table_has_ProfileEvent_MutationTotalParts: data.data[0][4] ? true : false,
          query_log_table_has_hostname_column: data.data[0][5] ? true : false,
          part_log_table_has_node_name_column: data.data[0][6] ? true : false,
        };
      }
    });

  // Issue a dedicated query in case the query fails
  const functionQuery = connection
    .query(`select 1 from system.functions where name = 'formatQuery'`, {
      default_format: "JSONCompact",
    })
    .response.then((functionResponse) => {
      if (functionResponse.httpStatus === 200) {
        const data = functionResponse.data.json<JSONCompactFormatResponse>();
        if (data.data.length > 0) {
          const has_format_query_function = data.data[0][0];
          connection.metadata = {
            ...connection.metadata,
            has_format_query_function: has_format_query_function ? true : false,
          };
        }
      }
    });

  // Pre-load hostnames for shortening if cluster is configured
  const clusterHostQuery = connection.cluster
    ? connection
        .query(`SELECT host_name FROM system.clusters WHERE cluster = '${connection.cluster}'`, {
          default_format: "JSONCompact",
        })
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
    functionQuery,
    clusterHostQuery,
    settingsQuery,
    profileEventsQuery,
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
          setError(err instanceof Error ? err.message : String(err));
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
        <CardHeader className="text-center space-y-1 pb-4">
          <div className="flex justify-center items-center">
            <AppLogo width={64} height={64} />
            <CardTitle>Data Storia</CardTitle>
          </div>
          <CardDescription className="text-base">
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
const DEFAULT_TAB_PANEL_SIZE = 80;
const DEFAULT_CHAT_PANEL_SIZE = 40;

export function MainPage() {
  const { connection, pendingConfig, commitConnection, isInitialized, isConnectionAvailable } =
    useConnection();
  const { displayMode, close: closeChatPanel } = useChatPanel();

  const [loadedSchemaData, setLoadedSchemaData] = useState<SchemaLoadResult | null>(null);

  // Refs for panel control
  const schemaPanelRef = useRef<ImperativePanelHandle>(null);
  const tabsPanelRef = useRef<ImperativePanelHandle>(null);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);

  // Determine if we should show the initializer overlay
  // Case 1: App is not initialized yet (booting up)
  // Case 2: App initialized, but switching connections (initializing new connection)
  const showInitializer =
    !isInitialized ||
    (!!pendingConfig &&
      (!connection || connection.name !== pendingConfig.name || !isConnectionAvailable));

  const handleReady = (newConnection: Connection, result: SchemaLoadResult) => {
    setLoadedSchemaData(result);
    commitConnection(newConnection);
  };

  // Show wizard ONLY if:
  // 1. App is fully initialized
  // 2. No pending config (not currently connecting)
  // 3. No active connection (fresh state)
  const showWizard = isInitialized && !pendingConfig && !connection;

  // Resize panels when display mode changes
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      switch (displayMode) {
        case "hidden":
          // Schema tree and tabs take full width
          schemaPanelRef.current?.resize(DEFAULT_SCHEMA_PANEL_SIZE);
          tabsPanelRef.current?.resize(DEFAULT_TAB_PANEL_SIZE);
          break;
        case "panel":
          // All three panels visible
          schemaPanelRef.current?.resize(DEFAULT_SCHEMA_PANEL_SIZE);
          tabsPanelRef.current?.resize(DEFAULT_TAB_PANEL_SIZE - DEFAULT_CHAT_PANEL_SIZE);
          chatPanelRef.current?.resize(DEFAULT_CHAT_PANEL_SIZE);
          break;
        case "tabWidth":
          // Schema tree visible, chat takes tab region
          schemaPanelRef.current?.resize(DEFAULT_SCHEMA_PANEL_SIZE);
          tabsPanelRef.current?.resize(0);
          chatPanelRef.current?.resize(DEFAULT_TAB_PANEL_SIZE);
          break;
        case "fullscreen":
          // Chat takes full width
          schemaPanelRef.current?.resize(0);
          tabsPanelRef.current?.resize(0);
          chatPanelRef.current?.resize(100);
          break;
      }
    });
  }, [displayMode]);

  if (showWizard) {
    return <ConnectionWizard />;
  }

  const showSchemaTree = displayMode !== "fullscreen";
  const showTabsVisible = displayMode === "hidden" || displayMode === "panel";
  const showChatPanel = displayMode !== "hidden";

  return (
    <div className="relative h-full w-full flex min-w-0 overflow-hidden">
      {showInitializer && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh] px-8 pb-8">
          <ConnectionInitializer config={pendingConfig || null} onReady={handleReady} />
        </div>
      )}

      <PanelGroup direction="horizontal" className="h-full w-full min-w-0">
        {/* Left Panel: Schema Tree View - always mounted, hidden in fullscreen */}
        <Panel
          ref={schemaPanelRef}
          defaultSize={showSchemaTree ? DEFAULT_SCHEMA_PANEL_SIZE : 0}
          minSize={0}
          className={`bg-background ${!showSchemaTree ? "hidden" : ""}`}
        >
          <SchemaTreeView initialSchemaData={loadedSchemaData} />
        </Panel>

        {showSchemaTree && (
          <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors" />
        )}

        {/* Middle Panel: Tabs - always mounted to preserve state, hidden when collapsed */}
        <Panel
          ref={tabsPanelRef}
          defaultSize={
            displayMode === "hidden"
              ? DEFAULT_TAB_PANEL_SIZE
              : displayMode === "panel"
                ? DEFAULT_TAB_PANEL_SIZE - DEFAULT_CHAT_PANEL_SIZE
                : 0
          }
          minSize={0}
          className={`bg-background ${!showTabsVisible ? "overflow-hidden" : ""}`}
        >
          <div className={!showTabsVisible ? "hidden" : "h-full"}>
            <MainPageTabList selectedConnection={connection} />
          </div>
        </Panel>

        {/* Resize Handle between Tabs and Chat Panel - only show when both are visible */}
        {showChatPanel && showTabsVisible && (
          <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors" />
        )}

        {/* Right Panel: Chat Panel */}
        {showChatPanel && (
          <Panel
            ref={chatPanelRef}
            defaultSize={
              displayMode === "panel"
                ? DEFAULT_CHAT_PANEL_SIZE
                : displayMode === "tabWidth"
                  ? DEFAULT_TAB_PANEL_SIZE
                  : 100
            }
            minSize={20}
            className="bg-background"
          >
            <ChatPanel onClose={closeChatPanel} />
          </Panel>
        )}
      </PanelGroup>
    </div>
  );
}

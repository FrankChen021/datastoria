import FloatingProgressBar from "@/components/floating-progress-bar";
import { DependencyGraphFlow } from "./dependency-graph-flow";
import { TabManager } from "@/components/tab-manager";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import type { ApiErrorResponse, ApiResponse } from "@/lib/api";
import { Api } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { StringUtils } from "@/lib/string-utils";
import { toastManager } from "@/lib/toast";
import { ExternalLink, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { DependencyBuilder, type DependencyGraphNode } from "./DependencyBuilder";

// The response data object
interface Table {
  id: string;
  database: string;
  name: string;
  engine: string;
  tableQuery: string;

  dependenciesDatabase: string[];
  dependenciesTable: string[];

  serverVersion: string;

  isTargetDatabase: boolean;
}

export interface DependencyTabProps {
  database: string;
  tabId?: string;
}

const DependencyTabComponent = ({ database }: DependencyTabProps) => {
  const { selectedConnection } = useConnection();
  const [queryResponse, setQueryResponse] = useState<{
    data?: unknown;
    errorMessage?: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasExecutedRef = useRef(false);

  const [showTableNode, setShowTableNode] = useState<DependencyGraphNode | undefined>(undefined);

  useEffect(() => {
    if (!selectedConnection) {
      toastManager.show("No connection selected", "error");
      return;
    }

    // Prevent duplicate execution
    if (hasExecutedRef.current) {
      return;
    }
    hasExecutedRef.current = true;

    setIsLoading(true);
    setQueryResponse(null);

    // Execute the dependency query directly (without version)
    const api = Api.create(selectedConnection);
    const dependencySql = `
SELECT
    concat(database, '_', name) AS id,
    database,
    name,
    engine,
    create_table_query AS tableQuery,
    dependencies_database AS dependenciesDatabase,
    dependencies_table AS dependenciesTable,
    database = '${database}' AS isTargetDatabase
FROM system.tables`;

    api.executeSQL(
      {
        sql: dependencySql,
        params: {
          default_format: "JSON",
          output_format_json_quote_64bit_integers: 0,
        },
      },
      (response: ApiResponse) => {
        setQueryResponse({
          data: response.data,
          errorMessage: null,
        });
        setIsLoading(false);
      },
      (error: ApiErrorResponse) => {
        setQueryResponse({
          data: error.data,
          errorMessage: error.errorMessage || "Unknown error occurred",
        });
        setIsLoading(false);
        toastManager.show(`Dependency query failed: ${error.errorMessage}`, "error");
      },
      () => {
        // Query execution finished
      }
    );

    // Reset the ref when database or connection changes
    return () => {
      hasExecutedRef.current = false;
    };
  }, [selectedConnection, database]);

  const { nodes, edges } = useMemo(() => {
    if (!queryResponse) {
      return { nodes: new Map<string, DependencyGraphNode>(), edges: [] };
    }

    const responseData = queryResponse.data as { data?: Table[] } | undefined;
    const tables = responseData?.data;
    if (!tables || tables.length === 0) {
      return { nodes: new Map<string, DependencyGraphNode>(), edges: [] };
    }

    const builder = new DependencyBuilder(tables);
    builder.build();

    if (builder.getNodes().size === 0) {
      return { nodes: new Map<string, DependencyGraphNode>(), edges: [] };
    }

    return { nodes: builder.getNodes(), edges: builder.getEdges() };
  }, [queryResponse]);

  const onNodeClick = useCallback(
    (nodeId: string) => {
      const graphNode = nodes.get(nodeId);
      if (graphNode === undefined) {
        return;
      }

      setShowTableNode(graphNode);
    },
    [nodes]
  );

  const handleOpenTableTab = useCallback(() => {
    if (!showTableNode) return;
    TabManager.sendOpenTableTabRequest(showTableNode.database, showTableNode.name, showTableNode.engine);
  }, [showTableNode]);

  const handleCloseTableNode = useCallback(() => {
    setShowTableNode(undefined);
  }, []);

  if (!queryResponse && !isLoading) {
    return null;
  }

  return (
    <PanelGroup direction="horizontal" className="h-full w-full relative">
      <FloatingProgressBar show={isLoading} />
      {nodes.size > 0 && (
        <>
          {/* Left Panel: Dependency View */}
          <Panel defaultSize={showTableNode ? 60 : 100} minSize={showTableNode ? 30 : 0} className="bg-background">
            <DependencyGraphFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={onNodeClick}
              style={{ width: "100%", height: "100%" }}
            />
          </Panel>

          {/* Splitter */}
          {showTableNode && (
            <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors cursor-col-resize" />
          )}

          {/* Right Panel: Selected Table View */}
          {showTableNode && (
            <Panel defaultSize={40} minSize={5} maxSize={70} className="bg-background border-l shadow-lg flex flex-col">
              {/* Header with close button */}
              <div className="flex items-center justify-between px-2 py-1 border-b flex-shrink-0">
                <Button
                  variant="link"
                  className="font-semibold h-auto p-0 text-left flex items-center"
                  onClick={handleOpenTableTab}
                  title={`Open table ${showTableNode.database}.${showTableNode.name}`}
                >
                  <h4 className="truncate">{showTableNode.database + "." + showTableNode.name}</h4>
                  <ExternalLink className="h-4 w-4 flex-shrink-0" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCloseTableNode} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* DDL content */}
              <div className="flex-1 overflow-auto p-4">
                <ThemedSyntaxHighlighter
                  customStyle={{ fontSize: "14px", margin: 0 }}
                  language="sql"
                  showLineNumbers={true}
                >
                  {StringUtils.prettyFormatQuery(showTableNode.query)}
                </ThemedSyntaxHighlighter>
              </div>
            </Panel>
          )}
        </>
      )}
      {!isLoading && nodes.size === 0 && (
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Tables under this database have no dependencies.</div>
        </div>
      )}
    </PanelGroup>
  );
};

export const DependencyTab = memo(DependencyTabComponent);

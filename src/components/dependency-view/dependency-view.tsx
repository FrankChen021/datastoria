import FloatingProgressBar from "@/components/floating-progress-bar";
import type { GraphEdge } from "@/components/graphviz-component/Graph";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import type { ApiErrorResponse } from "@/lib/api";
import { Api } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { StringUtils } from "@/lib/string-utils";
import { toastManager } from "@/lib/toast";
import { X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { DependencyGraphFlow } from "./dependency-graph-flow";
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

export interface DependencyViewProps {
  database: string;
  tabId?: string;
}

const DependencyViewComponent = ({ database }: DependencyViewProps) => {
  const { selectedConnection } = useConnection();
  const [nodes, setNodes] = useState<Map<string, DependencyGraphNode>>(new Map());
  const [edges, setEdges] = useState<GraphEdge[]>([]);
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
    setNodes(new Map());
    setEdges([]);

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
    dependencies_table AS dependenciesTable
FROM system.tables
WHERE database = '${database}' OR has(dependencies_database, '${database}')
`;

    (async () => {
      try {
        const response = await api.executeAsync({
          sql: dependencySql,
          params: {
            default_format: "JSON",
            output_format_json_quote_64bit_integers: 0,
          },
        });

        // Process the response data inline
        const responseData = response.data as { data?: Table[] } | undefined;
        const tables = responseData?.data;

        if (tables && tables.length > 0) {
          const builder = new DependencyBuilder(tables);
          builder.build(database);

          if (builder.getNodes().size > 0) {
            setNodes(builder.getNodes());
            setEdges(builder.getEdges());
          } else {
            setNodes(new Map());
            setEdges([]);
          }
        } else {
          setNodes(new Map());
          setEdges([]);
        }

        setIsLoading(false);
      } catch (error) {
        const apiError = error as ApiErrorResponse;
        setNodes(new Map());
        setEdges([]);
        setIsLoading(false);
        toastManager.show(`Dependency query failed: ${apiError.errorMessage}`, "error");
      }
    })();

    // Reset the ref when database or connection changes
    return () => {
      hasExecutedRef.current = false;
    };
  }, [selectedConnection, database]);

  const onNodeClick = useCallback(
    (nodeId: string) => {
      const graphNode = nodes.get(nodeId);
      if (graphNode === undefined) {
        return;
      }

      // Don't open the pane if the node is marked as "NOT FOUND"
      // A node is "NOT FOUND" when engine is empty or query is "NOT FOUND"
      const isNotFound = graphNode.engine === "" || graphNode.query === "NOT FOUND";
      if (isNotFound) {
        return;
      }

      setShowTableNode(graphNode);
    },
    [nodes]
  );

  const handleCloseTableNode = useCallback(() => {
    setShowTableNode(undefined);
  }, []);

  return (
    <PanelGroup direction="horizontal" className="h-full w-full">
      {/* The parent does not have 'relative', the relative is defined in the collapsible-dependency-view */}
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
                <OpenTableTabButton
                  database={showTableNode.database}
                  table={showTableNode.name}
                  engine={showTableNode.engine}
                  variant="shadcn-link"
                  showDatabase={true}
                  className="truncate"
                />
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

export const DependencyView = memo(DependencyViewComponent);

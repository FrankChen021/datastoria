import { useConnection } from "@/components/connection/connection-context";
import FloatingProgressBar from "@/components/floating-progress-bar";
import type { GraphEdge } from "@/components/shared/graphviz/Graph";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import { type DependencyTableInfo, type QueryError } from "@/lib/connection/connection";
import { StringUtils } from "@/lib/string-utils";
import { toastManager } from "@/lib/toast";
import { X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { DependencyGraphFlow } from "./dependency-graph-flow";
import { DependencyBuilder, type DependencyGraphNode } from "./DependencyBuilder";

// The response data object from API
interface TableResponse {
  /**
   * The id of the table, namely the database name and the table name
   */
  id: string;
  uuid: string;
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
  table?: string; // Optional: if provided, show dependencies for this specific table
}

const DependencyViewComponent = ({ database, table }: DependencyViewProps) => {
  const { connection, updateConnection } = useConnection();
  const [nodes, setNodes] = useState<Map<string, DependencyGraphNode>>(new Map());
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasExecutedRef = useRef(false);

  const [showTableNode, setShowTableNode] = useState<DependencyGraphNode | undefined>(undefined);

  useEffect(() => {
    if (!connection) {
      toastManager.show("No connection selected", "error");
      return;
    }

    // Prevent duplicate execution
    if (hasExecutedRef.current) {
      return;
    }
    hasExecutedRef.current = true;

    setIsLoading(true);

    // Load dependency data (from cache or query)
    (async () => {
      try {
        let dependencyTables: Map<string, DependencyTableInfo>;

        // Check if we have cached dependency data
        if (connection.metadata.dependencyTables) {
          // Use cached data
          dependencyTables = connection.metadata.dependencyTables;
        } else {
          // Load from database and cache
          const { response } = connection.queryOnNode(
            `
SELECT
    concat(database, '.', name) AS id,
    uuid,
    database,
    name,
    engine,
    ${connection.metadata.has_format_query_function ? "formatQuery(create_table_query)" : "create_table_query"} AS tableQuery,
    dependencies_database AS dependenciesDatabase,
    dependencies_table AS dependenciesTable
FROM system.tables
WHERE NOT startsWith(name, '.inner.') AND NOT startsWith(name, '.inner_id.')
`,
            {
              default_format: "JSON",
              output_format_json_quote_64bit_integers: 0,
            }
          );

          const apiResponse = await response;
          const responseData = apiResponse.data.json<{ data?: TableResponse[] } | undefined>();
          const tables = responseData?.data;

          // Build the cache map
          dependencyTables = new Map<string, DependencyTableInfo>();
          if (tables && tables.length > 0) {
            for (const t of tables) {
              dependencyTables.set(t.id, {
                id: t.id,
                uuid: t.uuid,
                database: t.database,
                name: t.name,
                engine: t.engine,
                tableQuery: t.tableQuery,
                dependenciesDatabase: t.dependenciesDatabase,
                dependenciesTable: t.dependenciesTable,
              });
            }
          }

          // Cache in connection metadata
          updateConnection({ dependencyTables });
        }

        // Filter tables for the target database
        const tables: TableResponse[] = [];
        for (const [, tableInfo] of dependencyTables.entries()) {
          const isInTargetDatabase = tableInfo.database === database;
          const dependsOnTargetDatabase =
            tableInfo.dependenciesDatabase?.includes(database) ?? false;

          if (isInTargetDatabase || dependsOnTargetDatabase) {
            tables.push({
              id: tableInfo.id,
              uuid: tableInfo.uuid,
              database: tableInfo.database,
              name: tableInfo.name,
              engine: tableInfo.engine,
              tableQuery: tableInfo.tableQuery,
              dependenciesDatabase: tableInfo.dependenciesDatabase,
              dependenciesTable: tableInfo.dependenciesTable,
              serverVersion: "",
              isTargetDatabase: isInTargetDatabase,
            });
          }
        }

        if (tables.length > 0) {
          // Convert TableResponse to the format DependencyBuilder expects
          // innerTable: 0 = not inner table, 1 = .inner., 2 = .inner_id.
          const tablesWithInnerFlag = tables.map((t) => ({ ...t, innerTable: 0 }));
          const builder = new DependencyBuilder(tablesWithInnerFlag);
          builder.build(database);

          let finalNodes = builder.getNodes();
          let finalEdges = builder.getEdges();

          // If a specific table is provided, filter to show only its dependencies (upstream and downstream)
          if (table) {
            const targetTableId = `${database}.${table}`;
            const relevantNodeIds = new Set<string>();

            // Add the target table itself
            relevantNodeIds.add(targetTableId);

            // Find all upstream dependencies (what this table depends on)
            const findUpstream = (nodeId: string) => {
              const node = finalNodes.get(nodeId);
              if (node) {
                for (const targetId of node.targets) {
                  if (!relevantNodeIds.has(targetId)) {
                    relevantNodeIds.add(targetId);
                    findUpstream(targetId);
                  }
                }
              }
            };

            // Find all downstream dependencies (what depends on this table)
            const findDownstream = (nodeId: string) => {
              for (const [id, node] of finalNodes.entries()) {
                if (node.targets.includes(nodeId) && !relevantNodeIds.has(id)) {
                  relevantNodeIds.add(id);
                  findDownstream(id);
                }
              }
            };

            findUpstream(targetTableId);
            findDownstream(targetTableId);

            // Filter nodes and edges
            const filteredNodes = new Map<string, DependencyGraphNode>();
            for (const nodeId of relevantNodeIds) {
              const node = finalNodes.get(nodeId);
              if (node) {
                filteredNodes.set(nodeId, node);
              }
            }

            const filteredEdges = finalEdges.filter(
              (edge) => relevantNodeIds.has(edge.source) && relevantNodeIds.has(edge.target)
            );

            finalNodes = filteredNodes;
            finalEdges = filteredEdges;
          }

          if (finalNodes.size > 0) {
            setNodes(finalNodes);
            setEdges(finalEdges);
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
        const apiError = error as QueryError;
        setNodes(new Map());
        setEdges([]);
        setIsLoading(false);
        toastManager.show(`Dependency query failed: ${apiError.message}`, "error");
      }
    })();

    // Reset the ref when database or connection changes
    return () => {
      hasExecutedRef.current = false;
    };
  }, [connection, database, table, updateConnection]);

  const onNodeClick = useCallback(
    (nodeId: string) => {
      const graphNode = nodes.get(nodeId);
      if (graphNode === undefined) {
        return;
      }

      // Don't open the pane if the node is marked as "NOT FOUND"
      // A node is "NOT FOUND" when engine is empty or query is "NOT FOUND"
      const shouldReturn =
        graphNode.category === "" ||
        graphNode.query === "NOT FOUND" ||
        graphNode.category === "Kafka";
      if (shouldReturn) {
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
      {/* The parent does not have 'relative', the relative is defined in the dependency-tab */}
      <FloatingProgressBar show={isLoading} />
      {nodes.size > 0 && (
        <>
          {/* Left Panel: Dependency View */}
          <Panel
            defaultSize={showTableNode ? 60 : 100}
            minSize={showTableNode ? 30 : 0}
            className="bg-background"
          >
            <DependencyGraphFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={onNodeClick}
              style={{ width: "100%", height: "100%" }}
              database={database}
              highlightedTableId={table ? `${database}.${table}` : undefined}
            />
          </Panel>

          {/* Splitter */}
          {showTableNode && (
            <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors cursor-col-resize" />
          )}

          {/* Right Panel: Selected Table View */}
          {showTableNode && (
            <Panel
              defaultSize={40}
              minSize={5}
              maxSize={70}
              className="bg-background shadow-lg flex flex-col"
            >
              {/* Header with close button */}
              <div className="flex items-center justify-between pl-2 border-b flex-shrink-0">
                <OpenTableTabButton
                  database={showTableNode.namespace}
                  table={showTableNode.name}
                  engine={showTableNode.category}
                  variant="shadcn-link"
                  showDatabase={true}
                  className="truncate"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseTableNode}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* DDL content */}
              <div className="flex-1 overflow-auto">
                <ThemedSyntaxHighlighter
                  customStyle={{ fontSize: "14px", margin: 0 }}
                  language="sql"
                  showLineNumbers={true}
                >
                  {connection!.metadata.has_format_query_function
                    ? showTableNode.query
                    : StringUtils.prettyFormatQuery(showTableNode.query)}
                </ThemedSyntaxHighlighter>
              </div>
            </Panel>
          )}
        </>
      )}
      {!isLoading && nodes.size === 0 && (
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-sm text-muted-foreground">
            {table
              ? `Table ${database}.${table} has no dependencies.`
              : `Tables under this database have no dependencies.`}
          </div>
        </div>
      )}
    </PanelGroup>
  );
};

export const DependencyView = memo(DependencyViewComponent);

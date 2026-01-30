import { useConnection } from "@/components/connection/connection-context";
import FloatingProgressBar from "@/components/shared/floating-progress-bar";
import type { GraphEdge } from "@/components/shared/graphviz/Graph";
import { type QueryError } from "@/lib/connection/connection";
import { QueryUtils } from "@/lib/query-utils";
import { toastManager } from "@/lib/toast";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { DependencyBuilder, type DependencyGraphNode } from "./dependency-builder";
import { DependencyGraphFlow } from "./dependency-graph-flow";
import type { DependencyTableInfo } from "./dependency-types";
import { TablePanel } from "./table-panel";

export interface DependencyViewProps {
  database: string;
  table?: string; // Optional: if provided, show dependencies for this specific table
}

const DependencyViewComponent = ({ database, table }: DependencyViewProps) => {
  const { connection, updateConnectionMetadata } = useConnection();
  const [nodes, setNodes] = useState<Map<string, DependencyGraphNode>>(new Map());
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasExecutedRef = useRef(false);
  const cancelledRef = useRef(false);

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
    cancelledRef.current = false;

    // Load dependency data (from cache or query)
    (async () => {
      try {
        let tableMap: Map<string, DependencyTableInfo>;
        let innerTable: Map<string, DependencyTableInfo>;

        // Check if we have cached dependency data
        if (connection.metadata.dependencyData) {
          // Use cached data
          tableMap = connection.metadata.dependencyData.tables;
          innerTable = connection.metadata.dependencyData.innerTables;
        } else {
          // Load from database and cache the result
          // We load all tables including inner tables so that we can build dependencies on inner tables like MV
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
    dependencies_table AS dependenciesTable,
    metadata_modification_time AS metadataModificationTime
FROM system.tables
`,
            {
              default_format: "JSON",
              output_format_json_quote_64bit_integers: 0,
            }
          );

          const responseData = (await response).data.json<
            { data?: DependencyTableInfo[] } | undefined
          >();
          if (cancelledRef.current) return;

          const tables = responseData?.data;

          // Build tableMap and innerTable in a single pass
          tableMap = new Map<string, DependencyTableInfo>();
          innerTable = new Map<string, DependencyTableInfo>();

          if (tables && tables.length > 0) {
            for (const t of tables) {
              // Format query if formatQuery function is not available
              const formattedQuery = connection.metadata.has_format_query_function
                ? t.tableQuery
                : QueryUtils.prettyFormatQuery(t.tableQuery);
              const tableInfo: DependencyTableInfo = {
                id: t.id,
                uuid: t.uuid,
                database: t.database,
                name: t.name,
                engine: t.engine,
                tableQuery: formattedQuery,
                dependenciesDatabase: t.dependenciesDatabase,
                dependenciesTable: t.dependenciesTable,
                metadataModificationTime: t.metadataModificationTime,
              };
              tableMap.set(tableInfo.id, tableInfo);
              // Populate inner table map for MaterializedView inner table lookup
              if (tableInfo.name.startsWith(".inner_id.")) {
                const originalTableId = tableInfo.name.substring(".inner_id.".length);
                innerTable.set(`.inner_id.${originalTableId}`, tableInfo);
              } else if (tableInfo.name.startsWith(".inner.")) {
                innerTable.set(`.inner.${tableInfo.name.substring(".inner.".length)}`, tableInfo);
              }
            }
          }

          // Cache in connection metadata
          if (!cancelledRef.current) {
            updateConnectionMetadata({
              dependencyData: {
                tables: tableMap,
                innerTables: innerTable,
              },
            });
          }
        }

        if (cancelledRef.current) return;

        if (tableMap.size > 0) {
          const builder = new DependencyBuilder(tableMap, innerTable);
          builder.build(database, table);

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

          if (cancelledRef.current) return;

          if (finalNodes.size > 0) {
            setNodes(finalNodes);
            setEdges(finalEdges);
          } else {
            setNodes(new Map());
            setEdges([]);
          }
        } else {
          if (cancelledRef.current) return;
          setNodes(new Map());
          setEdges([]);
        }

        if (!cancelledRef.current) {
          setIsLoading(false);
        }
      } catch (error) {
        if (cancelledRef.current) return;
        const apiError = error as QueryError;
        setNodes(new Map());
        setEdges([]);
        setIsLoading(false);
        toastManager.show(`Dependency query failed: ${apiError.message}`, "error");
      }
    })();

    // Reset the ref and cancel any pending async work when database or connection changes
    return () => {
      hasExecutedRef.current = false;
      cancelledRef.current = true;
    };
  }, [connection, database, table, updateConnectionMetadata]);

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
            <PanelResizeHandle className="w-[0px] bg-border hover:bg-border/80 transition-colors cursor-col-resize" />
          )}

          {/* Right Panel: Selected Table View */}
          {showTableNode && (
            <Panel
              defaultSize={40}
              minSize={5}
              maxSize={70}
              className="bg-background shadow-lg flex flex-col border-l border-t rounded-sm rounded-r-none"
            >
              <TablePanel tableNode={showTableNode} onClose={handleCloseTableNode} />
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

import type { GraphEdge, GraphNode } from "@/components/shared/graphviz/Graph";
import { shortenHostNameForDisplay } from "@/lib/string-utils";
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  type EdgeTypes,
  getStraightPath,
  Handle,
  MarkerType,
  type Node,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MD5 } from "crypto-js";
import dagre from "dagre";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { QueryLogDetailPane } from "./query-log-detail-pane";
import { QueryLogGraphNodePane } from "./query-log-graph-node-pane";

// Graph controls ref type
export interface GraphControlsRef {
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
}

class QueryLogUtils {
  public static getExceptionCode(queryLog: any): number {
    return queryLog.exception_code;
  }

  public static getQueryTypeTag(queryLog: any): string {
    if (queryLog.type === "QueryStart") {
      return "Started";
    }
    if (queryLog.type === "QueryFinish") {
      return "Finished";
    }

    // Exception
    return "Exception";
  }

  public static getClientName(queryLog: any): string {
    if (queryLog.client_name !== "") {
      return queryLog.client_name;
    }
    if (queryLog.client_hostname !== "") {
      return queryLog.client_hostname;
    }
    if (queryLog.http_referer !== "") {
      return queryLog.http_referer;
    }
    if (queryLog.http_user_agent !== "") {
      return queryLog.http_user_agent;
    }
    return "User";
  }
}

export interface NodeDetails {
  id: string;
  label: string;
  incomingEdges: Array<{
    source: string;
    sourceLabel: string;
    queryLog: any;
  }>;
  outgoingEdges: Array<{
    target: string;
    targetLabel: string;
    queryLog: any;
  }>;
}

interface QueryLogGraphFlowProps {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  onEdgeClick?: (edgeId: string) => void;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
  style?: React.CSSProperties;
  onControlsReady?: (controls: { zoomIn: () => void; zoomOut: () => void; fitView: () => void }) => void;
  graphId?: string; // Unique identifier for this graph instance
}

// Custom node component for host/user nodes
function HostNode({ data }: { data: { node: GraphNode } }) {
  const { node } = data;

  return (
    <div className="rounded-lg border-2 shadow-lg min-w-[150px] bg-background border-border relative">
      <Handle
        type="target"
        position={Position.Left}
        style={{
          left: -1,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          right: -1,
        }}
      />
      <div className="px-3 py-2 text-center">
        <div className="font-semibold text-sm text-foreground">{node.label}</div>
      </div>
    </div>
  );
}

// Custom edge component with label rendering
function QueryLogEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd }: EdgeProps) {
  // Calculate direction vectors to extend path to node boundaries
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Extend the path by 2px on each end to connect flush with node boundaries (accounting for 2px border)
  const extension = length > 0 ? 2 : 0;
  const extendedSourceX = length > 0 ? sourceX - (dx / length) * extension : sourceX;
  const extendedSourceY = length > 0 ? sourceY - (dy / length) * extension : sourceY;
  const extendedTargetX = length > 0 ? targetX + (dx / length) * extension : targetX;
  const extendedTargetY = length > 0 ? targetY + (dy / length) * extension : targetY;

  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: extendedSourceX,
    sourceY: extendedSourceY,
    targetX: extendedTargetX,
    targetY: extendedTargetY,
  });

  const label = data?.label;
  const hasLabel = label !== undefined && label !== null && String(label).trim() !== "";
  const edgeColor: string | undefined = typeof data?.color === "string" ? data.color : undefined;

  // Use markerEnd from props, fallback to ArrowClosed
  let edgeMarkerEnd: string = MarkerType.ArrowClosed;
  if (typeof markerEnd === "string") {
    edgeMarkerEnd = markerEnd;
  } else if (markerEnd && typeof markerEnd === "object" && "type" in markerEnd) {
    edgeMarkerEnd = (markerEnd as { type: string }).type;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={edgeMarkerEnd}
        style={{
          strokeWidth: 2,
          ...(edgeColor ? { stroke: edgeColor as string } : {}),
        }}
      />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 3}px)`,
              background: "hsl(var(--background))",
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: 500,
              color: "hsl(var(--foreground))",
              pointerEvents: "all",
              border: "1px solid hsl(var(--border))",
              whiteSpace: "pre-line",
              textAlign: "center",
            }}
            className="nodrag nopan cursor-pointer hover:bg-muted transition-colors"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const QueryLogGraphFlowInner = ({
  nodes,
  edges,
  onEdgeClick,
  onNodeClick,
  className,
  style,
  onControlsReady,
  graphId = "query-log-graph",
}: QueryLogGraphFlowProps) => {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Convert edges to React Flow format
  const initialEdges: Edge[] = useMemo(() => {
    if (!edges || edges.length === 0) {
      return [];
    }

    // Create a set of valid node IDs for validation
    const nodeIds = new Set(Array.from(nodes.keys()));

    // Filter and map edges, ensuring source and target nodes exist
    const mappedEdges = edges
      .filter((edge) => {
        const sourceExists = nodeIds.has(edge.source);
        const targetExists = nodeIds.has(edge.target);
        if (!sourceExists || !targetExists) {
          return false;
        }
        return true;
      })
      .map((edge) => {
        const edgeObj: Edge = {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "queryLogEdge" as const,
          data: { label: edge.label, color: edge.color },
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: {
            strokeWidth: 2,
            stroke: edge.color || undefined,
          },
        };
        return edgeObj;
      });
    return mappedEdges;
  }, [edges, nodes]);

  // Layout function
  const getLayoutedNodes = useCallback((nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 200 });

    const nodeWidth = 150;
    const nodeHeight = 60;

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    return nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      node.targetPosition = Position.Left;
      node.sourcePosition = Position.Right;
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      };
      return node;
    });
  }, []);

  // Convert nodes to React Flow format
  const initialNodes: Node[] = useMemo(() => {
    if (!nodes || nodes.size === 0) {
      return [];
    }

    return Array.from(nodes.values()).map((node) => ({
      id: node.id,
      type: "hostNode",
      position: { x: 0, y: 0 }, // Will be calculated by layout
      data: { node },
      draggable: true,
    }));
  }, [nodes]);

  // Use React Flow's built-in state hooks
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Track the graph structure to prevent re-layout on drag
  const layoutedGraphRef = useRef<string>("");
  // Track when we should fit view (after layout is applied)
  const shouldFitViewRef = useRef<boolean>(false);


  // Fit view when nodes are rendered after layout
  useEffect(() => {
    if (flowNodes.length === 0 || !shouldFitViewRef.current) {
      return;
    }

    // Use double requestAnimationFrame to ensure DOM is fully updated
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300 });
        shouldFitViewRef.current = false;
      });
    });
  }, [flowNodes, fitView]);

  // Update nodes and edges when props change
  useEffect(() => {
    if (initialNodes.length === 0) {
      setFlowNodes([]);
      setFlowEdges([]);
      layoutedGraphRef.current = "";
      return;
    }

    // Create a signature of the graph structure (node IDs and edge connections)
    const graphSignature =
      initialNodes
        .map((n) => n.id)
        .sort()
        .join(",") +
      "|" +
      initialEdges
        .map((e) => `${e.source}->${e.target}`)
        .sort()
        .join(",");

    // Only apply layout if the graph structure actually changed
    if (graphSignature !== layoutedGraphRef.current) {
      // Layout nodes even if there are no edges
      const layoutedNodes =
        initialEdges.length > 0
          ? getLayoutedNodes(initialNodes, initialEdges)
          : initialNodes.map((node, index) => ({
            ...node,
            position: { x: index * 200, y: 100 }, // Simple horizontal layout if no edges
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
          }));
      setFlowNodes(layoutedNodes);
      setFlowEdges(initialEdges);
      layoutedGraphRef.current = graphSignature;
      shouldFitViewRef.current = true;
    }
  }, [initialNodes, initialEdges, getLayoutedNodes, setFlowNodes, setFlowEdges]);

  // Node and edge types configuration
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      hostNode: HostNode,
    }),
    []
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      queryLogEdge: QueryLogEdge,
    }),
    []
  );

  // Handle edge click
  const onEdgeClickHandler = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (onEdgeClick) {
        onEdgeClick(edge.id);
      }
    },
    [onEdgeClick]
  );

  // Handle node click
  const onNodeClickHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick]
  );

  // Expose control methods to parent
  useEffect(() => {
    if (onControlsReady) {
      onControlsReady({
        zoomIn: () => zoomIn(),
        zoomOut: () => zoomOut(),
        fitView: () => fitView({ padding: 0.2 }),
      });
    }
  }, [onControlsReady, zoomIn, zoomOut, fitView]);

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        minWidth: "100px",
        minHeight: "100px",
        ...style,
      }}
    >
      <style>{`
        .react-flow__attribution {
          display: none !important;
        }
        /* Hide handle connection points */
        .react-flow__handle {
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
      <ReactFlow
        id={graphId}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={onEdgeClickHandler}
        onNodeClick={onNodeClickHandler}
        defaultEdgeOptions={{
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
        }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll={true}
        zoomOnScroll={false}
        panOnDrag={true}
      />
    </div>
  );
};

const QueryLogGraphFlow = (props: QueryLogGraphFlowProps) => {
  return (
    <ReactFlowProvider>
      <QueryLogGraphFlowInner {...props} />
    </ReactFlowProvider>
  );
};

// Sub-component: Graph Content
interface QueryLogGraphProps {
  queryLogs: any[];
}

export const QueryLogGraphView = forwardRef<GraphControlsRef, QueryLogGraphProps>(
  (
    {
      queryLogs,
    },
    ref
  ) => {
    const [graphNodes, setGraphNodes] = useState<Map<string, GraphNode>>(new Map());
    const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
    const [queryMap, setQueryMap] = useState<Map<string, any>>();

    // Internal state for selections and detail panes
    const [selectedQueryLog, setSelectedQueryLog] = useState<any>(undefined);
    const [selectedNode, setSelectedNode] = useState<NodeDetails | undefined>(undefined);
    const [sourceNode, setSourceNode] = useState<string | undefined>(undefined);
    const [targetNode, setTargetNode] = useState<string | undefined>(undefined);

    // Store controls from QueryLogGraphFlow (without refresh)
    const graphFlowControlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fitView: () => void } | null>(null);

    // Handle controls ready from QueryLogGraphFlow
    const handleControlsReady = useCallback(
      (controls: { zoomIn: () => void; zoomOut: () => void; fitView: () => void }) => {
        graphFlowControlsRef.current = controls;
      },
      []
    );

    // Convert query logs to graph structure
    const toGraph = useCallback((logs: any[]) => {
      const nodes = new Map<string, GraphNode>();
      const edges: GraphEdge[] = [];
      const queryMap = new Map<string, any>();

      if (logs.length === 0) {
        setGraphNodes(nodes);
        setGraphEdges(edges);
        setQueryMap(queryMap);
        return;
      }

      // Add host and query map - create a copy to avoid mutating original data
      logs.forEach((log) => {
        const host = log.host || log.host_name;
        const hostId = "n" + MD5(host).toString();

        // Create a copy of log with host_id to avoid mutating original
        const logWithHostId = { ...log, host_id: hostId };

        // Check if we already have a node for this host
        if (!nodes.has(hostId)) {
          nodes.set(hostId, {
            id: hostId,
            label: shortenHostNameForDisplay(host),
            targets: [],
          });
        }

        queryMap.set(log.query_id, logWithHostId);
      });

      // Check the initial node
      const initialQueryLog = queryMap.get(logs[0]?.initial_query_id);
      if (initialQueryLog === undefined) {
        queryMap.set(logs[0]?.initial_query_id, {
          host_id: "Unknown",
          type: "Unknown",
        });

        nodes.set(logs[0]?.initial_query_id, {
          id: "unknown",
          label: "Unknown Initiator",
          targets: [],
        });
      } else {
        // Add a client node to the initiator node
        nodes.set("user", {
          id: "user",
          label: QueryLogUtils.getClientName(initialQueryLog),
          targets: [],
        });

        // Add an edge from the user to the initiator node
        edges.push({
          // Use the query id so that during the action process, we can easily access the query log by the id
          id: initialQueryLog.query_id,
          source: "user",
          target: initialQueryLog.host_id,
          label: `[${initialQueryLog.interface === 2 ? "HTTP" : "TCP"}] [${QueryLogUtils.getQueryTypeTag(initialQueryLog)}]\nRT=${initialQueryLog.query_duration_ms}ms, ResultRows=${initialQueryLog.result_rows}rows`,
          color: QueryLogUtils.getExceptionCode(initialQueryLog) > 0 ? "red" : undefined,
        });
      }

      // Use queryMap because it might have be reduced repeat events for the same query
      queryMap.forEach((log) => {
        if (log.initial_query_id === log.query_id) {
          return;
        }

        const initialQueryLog = queryMap.get(log.initial_query_id);
        const subQueryLog = log;

        edges.push({
          // Use the query id so that during the action process, we can easily access the query log by the id
          id: subQueryLog.query_id,
          source: initialQueryLog.host_id,
          target: subQueryLog.host_id,
          label: `[${QueryLogUtils.getQueryTypeTag(subQueryLog)}] ${subQueryLog.query_duration_ms}ms, ${subQueryLog.result_rows}rows`,
          color: QueryLogUtils.getExceptionCode(initialQueryLog) > 0 ? "red" : undefined,
        });
      });

      // Save for further use
      setQueryMap(queryMap);
      setGraphNodes(nodes);
      setGraphEdges(edges);
    }, []);

    // Convert query logs to graph when queryLogs change
    useEffect(() => {
      toGraph(queryLogs);
    }, [queryLogs, toGraph]);

    // Expose controls via imperative handle
    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => {
          graphFlowControlsRef.current?.zoomIn();
        },
        zoomOut: () => {
          graphFlowControlsRef.current?.zoomOut();
        },
        fitView: () => {
          graphFlowControlsRef.current?.fitView();
        },
      }),
      []
    );

    // Create edge map for O(1) lookup - memoized for performance
    const edgeMap = useMemo(() => {
      const map = new Map<string, GraphEdge>();
      graphEdges.forEach((edge) => {
        map.set(edge.id, edge);
      });
      return map;
    }, [graphEdges]);

    const handleEdgeClick = useCallback(
      (edgeId: string) => {
        if (queryMap !== undefined) {
          const queryLog = queryMap.get(edgeId);
          if (!queryLog) {
            return;
          }

          // Find the edge that matches this query log - O(1) lookup
          const edge = edgeMap.get(edgeId);
          if (edge) {
            const sourceNodeData = graphNodes.get(edge.source);
            const targetNodeData = graphNodes.get(edge.target);
            const sourceLabel = sourceNodeData?.label || edge.source;
            const targetLabel = targetNodeData?.label || edge.target;
            setSelectedQueryLog(queryLog);
            setSourceNode(sourceLabel);
            setTargetNode(targetLabel);
            setSelectedNode(undefined);
          } else {
            setSelectedQueryLog(queryLog);
            setSourceNode(undefined);
            setTargetNode(undefined);
            setSelectedNode(undefined);
          }
        }
      },
      [queryMap, graphNodes, edgeMap]
    );

    const handleNodeClick = useCallback(
      (nodeId: string) => {
        const node = graphNodes.get(nodeId);
        if (!node) return;

        // Build incoming and outgoing edges for this node
        const incomingEdges: NodeDetails["incomingEdges"] = [];
        const outgoingEdges: NodeDetails["outgoingEdges"] = [];

        graphEdges.forEach((edge) => {
          const queryLog = queryMap?.get(edge.id);
          if (!queryLog) return;

          if (edge.target === nodeId) {
            const sourceNode = graphNodes.get(edge.source);
            incomingEdges.push({
              source: edge.source,
              sourceLabel: sourceNode?.label || edge.source,
              queryLog,
            });
          }

          if (edge.source === nodeId) {
            const targetNode = graphNodes.get(edge.target);
            outgoingEdges.push({
              target: edge.target,
              targetLabel: targetNode?.label || edge.target,
              queryLog,
            });
          }
        });

        const nodeDetails: NodeDetails = {
          id: nodeId,
          label: node.label,
          incomingEdges,
          outgoingEdges,
        };

        setSelectedNode(nodeDetails);
        setSelectedQueryLog(undefined);
      },
      [graphNodes, graphEdges, queryMap]
    );

    const handleCloseQueryLog = useCallback(() => {
      setSelectedQueryLog(undefined);
      setSourceNode(undefined);
      setTargetNode(undefined);
    }, []);

    const handleCloseNodeDetail = useCallback(() => {
      setSelectedNode(undefined);
    }, []);

    // If there's a selection, render with PanelGroup
    if (selectedQueryLog || selectedNode) {
      return (
        <PanelGroup direction={selectedNode ? "vertical" : "horizontal"} className="flex-1 min-h-0">
          <Panel
            defaultSize={60}
            minSize={30}
            className="bg-background flex flex-col"
          >
            <div className="flex-1 min-h-0 flex flex-col">
              {(graphNodes.size > 0 || graphEdges.length > 0) && (
                <div className="flex-1 w-full h-full min-h-0 relative">
                  <QueryLogGraphFlow
                    nodes={graphNodes}
                    edges={graphEdges}
                    onEdgeClick={handleEdgeClick}
                    onNodeClick={handleNodeClick}
                    className="w-full h-full"
                    onControlsReady={handleControlsReady}
                  />
                  {graphEdges.length > 0 && (
                    <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-md shadow-sm z-10 text-xs text-muted-foreground">
                      💡 Click on any edge to view query details
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <PanelResizeHandle
            className={`${selectedNode ? "h-0.5 w-full cursor-row-resize" : "w-0.5 h-full cursor-col-resize"
              } bg-border hover:bg-border/80 transition-colors`}
          />

          {selectedQueryLog ? (
            <QueryLogDetailPane
              selectedQueryLog={selectedQueryLog}
              onClose={handleCloseQueryLog}
              sourceNode={sourceNode}
              targetNode={targetNode}
            />
          ) : selectedNode ? (
            <QueryLogGraphNodePane selectedNode={selectedNode} onClose={handleCloseNodeDetail} />
          ) : null}
        </PanelGroup>
      );
    }

    return (
      <div className="flex-1 min-h-0 flex flex-col h-full">
        {(graphNodes.size > 0 || graphEdges.length > 0) && (
          <div className="flex-1 w-full h-full min-h-0 relative">
            <QueryLogGraphFlow
              nodes={graphNodes}
              edges={graphEdges}
              onEdgeClick={handleEdgeClick}
              onNodeClick={handleNodeClick}
              className="w-full h-full"
              onControlsReady={handleControlsReady}
            />
            {graphEdges.length > 0 && (
              <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-md shadow-sm z-10 text-xs text-muted-foreground">
                💡 Click on any edge to view query details
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

QueryLogGraphView.displayName = "GraphContent";

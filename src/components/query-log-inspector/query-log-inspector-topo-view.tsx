import type { GraphEdge, GraphNode } from "@/components/shared/graphviz/Graph";
import { TopologyGraphFlow } from "@/components/shared/topology/topology-graph-flow";
import { hostNameManager } from "@/lib/host-name-manager";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MD5 } from "crypto-js";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { QueryLogDetailPane } from "./query-log-inspector-detail-pane";
import { QueryLogInspectorTopoNodePane } from "./query-log-inspector-topo-node-pane";

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
  selectedEdgeId?: string;
  selectedNodeId?: string;
  onEdgeClick?: (edgeId: string) => void;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
  style?: CSSProperties;
  graphId?: string; // Unique identifier for this graph instance
}

// Custom node component for host/user nodes
function HostNode({ data }: { data: { node: GraphNode; isSelected?: boolean } }) {
  const { node, isSelected } = data;

  return (
    <div
      className="rounded-lg border-2 shadow-lg min-w-[150px] bg-background relative transition-colors"
      style={{
        borderColor: isSelected ? "#3b82f6" : undefined,
        boxShadow: isSelected ? "0 0 0 1px #3b82f6" : undefined,
      }}
    >
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
  const isSelected = data?.isSelected === true;
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
              border: isSelected ? "1px solid #3b82f6" : "1px solid hsl(var(--border))",
              boxShadow: isSelected ? "0 0 0 1px #3b82f6 inset" : undefined,
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

const QueryLogGraphFlow = ({
  nodes,
  edges,
  selectedEdgeId,
  selectedNodeId,
  onEdgeClick,
  onNodeClick,
  className,
  style,
  graphId = "query-log-graph",
}: QueryLogGraphFlowProps) => {
  const nodeIds = useMemo(() => new Set(Array.from(nodes.keys())), [nodes]);
  const initialNodes: Node[] = useMemo(() => {
    if (!nodes || nodes.size === 0) {
      return [];
    }
    return Array.from(nodes.values()).map((node) => ({
      id: node.id,
      type: "hostNode",
      position: { x: 0, y: 0 }, // Will be calculated by layout
      data: { node, isSelected: selectedNodeId === node.id },
      draggable: true,
    }));
  }, [nodes, selectedNodeId]);
  const initialEdges: Edge[] = useMemo(() => {
    if (!edges || edges.length === 0) {
      return [];
    }

    return edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => {
        const isSelected = selectedEdgeId === edge.id;
        const selectedColor = edge.color ? "#dc2626" : "#3b82f6";
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "queryLogEdge" as const,
          data: {
            label: edge.label,
            color: isSelected ? selectedColor : edge.color,
            isSelected,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: {
            strokeWidth: isSelected ? 3 : 2,
            stroke: isSelected ? selectedColor : edge.color || undefined,
          },
        };
      });
  }, [edges, nodeIds, selectedEdgeId]);

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

  const onEdgeClickHandler = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (onEdgeClick) {
        onEdgeClick(edge.id);
      }
    },
    [onEdgeClick]
  );

  const onNodeClickHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick]
  );

  return (
    <TopologyGraphFlow
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onEdgeClick={onEdgeClickHandler}
      onNodeClick={onNodeClickHandler}
      className={className}
      style={style}
      graphId={graphId}
      nodeWidth={150}
      nodeHeight={60}
      nodesep={50}
      ranksep={200}
      hideHandles={true}
    />
  );
};

// Sub-component: Graph Content
interface QueryLogInspectorTopoProps {
  queryLogs: any[];
}

export function QueryLogInspectorTopoView({ queryLogs }: QueryLogInspectorTopoProps) {
  const [graphNodes, setGraphNodes] = useState<Map<string, GraphNode>>(new Map());
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  // Raw (non-aggregated) edges are kept for node-click detail lookups so that
  // every individual sub-query appears as a separate incoming/outgoing entry.
  const [rawGraphEdges, setRawGraphEdges] = useState<GraphEdge[]>([]);
  // Maps each aggregated edge ID to the array of constituent query IDs.
  const [edgeQueryIdsMap, setEdgeQueryIdsMap] = useState<Map<string, string[]>>(new Map());
  const [queryMap, setQueryMap] = useState<Map<string, any>>();

  // Internal state for selections and detail panes.
  // selectedQueryLogs holds all query logs for the clicked edge (may be >1 for aggregated edges).
  const [selectedQueryLogs, setSelectedQueryLogs] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeDetails | undefined>(undefined);
  const [sourceNode, setSourceNode] = useState<string | undefined>(undefined);
  const [targetNode, setTargetNode] = useState<string | undefined>(undefined);

  // Convert query logs to graph structure
  const toGraph = useCallback((logs: any[]) => {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const queryMap = new Map<string, any>();

    if (logs.length === 0) {
      setGraphNodes(nodes);
      setGraphEdges(edges);
      setRawGraphEdges(edges);
      setEdgeQueryIdsMap(new Map());
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
          label: hostNameManager.getShortHostname(host),
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

    // Aggregate edges that share the same source→target pair into a single edge
    // to prevent overlapping labels when multiple sub-queries go between the same hosts.
    const edgeGroups = new Map<string, GraphEdge[]>();
    for (const edge of edges) {
      const key = `${edge.source}->${edge.target}`;
      const group = edgeGroups.get(key);
      if (group) {
        group.push(edge);
      } else {
        edgeGroups.set(key, [edge]);
      }
    }
    const aggregatedEdges: GraphEdge[] = [];
    const queryIdsMap = new Map<string, string[]>();
    for (const [, group] of edgeGroups) {
      if (group.length === 1) {
        aggregatedEdges.push(group[0]);
        queryIdsMap.set(group[0].id, [group[0].id]);
      } else {
        const first = group[0];
        const combinedLabel = group.map((e) => e.label).join("\n");
        const hasError = group.some((e) => e.color !== undefined);
        aggregatedEdges.push({
          id: first.id,
          source: first.source,
          target: first.target,
          label: combinedLabel,
          color: hasError ? "red" : undefined,
        });
        queryIdsMap.set(
          first.id,
          group.map((e) => e.id)
        );
      }
    }

    // Save for further use
    setQueryMap(queryMap);
    setGraphNodes(nodes);
    setRawGraphEdges(edges);
    setEdgeQueryIdsMap(queryIdsMap);
    setGraphEdges(aggregatedEdges);
  }, []);

  // Convert query logs to graph when queryLogs change
  useEffect(() => {
    toGraph(queryLogs);
  }, [queryLogs, toGraph]);

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
      if (queryMap === undefined) {
        return;
      }

      // Resolve all query IDs for this (potentially aggregated) edge.
      const queryIds = edgeQueryIdsMap.get(edgeId) ?? [edgeId];
      const logs = queryIds.map((id) => queryMap.get(id)).filter(Boolean);
      if (logs.length === 0) {
        return;
      }

      // Find the edge to get source/target labels.
      const edge = edgeMap.get(edgeId);
      if (edge) {
        const sourceNodeData = graphNodes.get(edge.source);
        const targetNodeData = graphNodes.get(edge.target);
        setSourceNode(sourceNodeData?.label || edge.source);
        setTargetNode(targetNodeData?.label || edge.target);
      } else {
        setSourceNode(undefined);
        setTargetNode(undefined);
      }

      setSelectedQueryLogs(logs);
      setSelectedNode(undefined);
    },
    [queryMap, graphNodes, edgeMap, edgeQueryIdsMap]
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const node = graphNodes.get(nodeId);
      if (!node) return;

      // Build incoming and outgoing edges for this node.
      // Use rawGraphEdges (non-aggregated) so every individual sub-query
      // appears as a separate entry in the detail pane.
      const incomingEdges: NodeDetails["incomingEdges"] = [];
      const outgoingEdges: NodeDetails["outgoingEdges"] = [];

      rawGraphEdges.forEach((edge) => {
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
      setSelectedQueryLogs([]);
    },
    [graphNodes, rawGraphEdges, queryMap]
  );

  const handleCloseQueryLog = useCallback(() => {
    setSelectedQueryLogs([]);
    setSourceNode(undefined);
    setTargetNode(undefined);
  }, []);

  const handleCloseNodeDetail = useCallback(() => {
    setSelectedNode(undefined);
  }, []);

  const hasSelection = selectedQueryLogs.length > 0 || !!selectedNode;
  const direction = selectedNode ? "vertical" : "horizontal";

  // Always render the same component tree so that ReactFlow is never
  // unmounted/remounted when the detail pane opens or closes.
  // Changing the tree structure (PanelGroup vs plain div) would destroy
  // the ReactFlow instance and reset the viewport.
  return (
    <PanelGroup direction={direction} className="flex-1 min-h-0">
      <Panel
        defaultSize={hasSelection ? 60 : 100}
        minSize={30}
        className="bg-background flex flex-col"
      >
        <div className="flex-1 min-h-0 flex flex-col">
          {(graphNodes.size > 0 || graphEdges.length > 0) && (
            <div className="flex-1 w-full h-full min-h-0 relative">
              <QueryLogGraphFlow
                nodes={graphNodes}
                edges={graphEdges}
                selectedEdgeId={
                  selectedQueryLogs.length > 0 ? selectedQueryLogs[0]?.query_id : undefined
                }
                selectedNodeId={selectedNode?.id}
                onEdgeClick={handleEdgeClick}
                onNodeClick={handleNodeClick}
                className="w-full h-full"
              />
              {graphEdges.length > 0 && (
                <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-md shadow-sm z-10 text-xs text-muted-foreground">
                  💡 Click on any node/edge to view query details
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      {hasSelection && (
        <>
          <PanelResizeHandle
            className={`${
              selectedNode ? "h-[1px] w-full cursor-row-resize" : "w-[1px] h-full cursor-col-resize"
            } hover:bg-border/80 transition-colors`}
          />

          {selectedQueryLogs.length > 0 ? (
            <QueryLogDetailPane
              queryLogs={selectedQueryLogs}
              onClose={handleCloseQueryLog}
              sourceNode={sourceNode}
              targetNode={targetNode}
              className="border-l"
            />
          ) : selectedNode ? (
            <QueryLogInspectorTopoNodePane
              selectedNode={selectedNode}
              onClose={handleCloseNodeDetail}
            />
          ) : null}
        </>
      )}
    </PanelGroup>
  );
}

import type { GraphEdge, GraphNode } from "@/components/graphviz-component/Graph";
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
import dagre from "dagre";
import { useCallback, useEffect, useMemo, useRef } from "react";

interface QueryLogGraphFlowProps {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  onEdgeClick?: (edgeId: string) => void;
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

export const QueryLogGraphFlow = (props: QueryLogGraphFlowProps) => {
  return (
    <ReactFlowProvider>
      <QueryLogGraphFlowInner {...props} />
    </ReactFlowProvider>
  );
};

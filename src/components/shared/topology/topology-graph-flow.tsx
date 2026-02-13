import {
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import dagre from "dagre";
import { useCallback, useEffect, useMemo, useRef } from "react";

interface TopologyGraphFlowProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  nodeTypes?: NodeTypes;
  edgeTypes?: EdgeTypes;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  className?: string;
  style?: React.CSSProperties;
  onControlsReady?: (controls: {
    zoomIn: () => void;
    zoomOut: () => void;
    fitView: () => void;
  }) => void;
  graphId?: string;
  nodeWidth?: number;
  nodeHeight?: number;
  rankdir?: "LR" | "TB";
  nodesep?: number;
  ranksep?: number;
  fallbackNodeXStep?: number;
  fallbackNodeY?: number;
  hideHandles?: boolean;
}

const TopologyGraphFlowInner = ({
  initialNodes,
  initialEdges,
  nodeTypes,
  edgeTypes,
  onEdgeClick,
  onNodeClick,
  className,
  style,
  onControlsReady,
  graphId,
  nodeWidth = 160,
  nodeHeight = 60,
  rankdir = "LR",
  nodesep = 50,
  ranksep = 180,
  fallbackNodeXStep = 200,
  fallbackNodeY = 100,
  hideHandles = false,
}: TopologyGraphFlowProps) => {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges);
  const layoutedGraphRef = useRef<string>("");
  const hasFittedViewRef = useRef<boolean>(false);

  const getLayoutedNodes = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      const graph = new dagre.graphlib.Graph();
      graph.setDefaultEdgeLabel(() => ({}));
      graph.setGraph({ rankdir, nodesep, ranksep });

      for (const node of nodes) {
        graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
      }
      for (const edge of edges) {
        graph.setEdge(edge.source, edge.target);
      }
      dagre.layout(graph);

      return nodes.map((node) => {
        const positionedNode = graph.node(node.id);
        if (!positionedNode) {
          return node;
        }
        return {
          ...node,
          targetPosition: Position.Left,
          sourcePosition: Position.Right,
          position: {
            x: positionedNode.x - nodeWidth / 2,
            y: positionedNode.y - nodeHeight / 2,
          },
        };
      });
    },
    [nodeHeight, nodeWidth, nodesep, rankdir, ranksep]
  );

  useEffect(() => {
    if (initialNodes.length === 0) {
      setFlowNodes([]);
      setFlowEdges([]);
      layoutedGraphRef.current = "";
      return;
    }

    const graphSignature =
      initialNodes
        .map((node) => node.id)
        .sort()
        .join(",") +
      "|" +
      initialEdges
        .map((edge) => `${edge.source}->${edge.target}`)
        .sort()
        .join(",");

    if (graphSignature === layoutedGraphRef.current) {
      return;
    }

    const nextNodes =
      initialEdges.length > 0
        ? getLayoutedNodes(initialNodes, initialEdges)
        : initialNodes.map((node, index) => ({
            ...node,
            position: { x: index * fallbackNodeXStep, y: fallbackNodeY },
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
          }));

    setFlowNodes(nextNodes);
    setFlowEdges(initialEdges);
    layoutedGraphRef.current = graphSignature;
    hasFittedViewRef.current = false;
  }, [
    fallbackNodeXStep,
    fallbackNodeY,
    getLayoutedNodes,
    initialEdges,
    initialNodes,
    setFlowEdges,
    setFlowNodes,
  ]);

  useEffect(() => {
    if (flowNodes.length === 0 || hasFittedViewRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            fitView({ padding: 0.2, duration: 300, maxZoom: 1.5, minZoom: 0.1 });
            hasFittedViewRef.current = true;
          } catch {
            // Ignore fit view failures from transient render states.
          }
        }, 100);
      });
    });
  }, [fitView, flowNodes.length]);

  useEffect(() => {
    if (!onControlsReady) {
      return;
    }
    onControlsReady({
      zoomIn: () => zoomIn(),
      zoomOut: () => zoomOut(),
      fitView: () => fitView({ padding: 0.2 }),
    });
  }, [fitView, onControlsReady, zoomIn, zoomOut]);

  const styleText = useMemo(() => {
    if (!hideHandles) {
      return `
        .react-flow__attribution {
          display: none !important;
        }
      `;
    }
    return `
      .react-flow__attribution {
        display: none !important;
      }
      .react-flow__handle {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
  }, [hideHandles]);

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
      <style>{styleText}</style>
      <ReactFlow
        id={graphId}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        fitView
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

export const TopologyGraphFlow = (props: TopologyGraphFlowProps) => {
  return (
    <ReactFlowProvider>
      <TopologyGraphFlowInner {...props} />
    </ReactFlowProvider>
  );
};

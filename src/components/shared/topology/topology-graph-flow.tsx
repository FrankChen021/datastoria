import { Button } from "@/components/ui/button";
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
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
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
  showFloatingControls?: boolean;
  enableAutoFit?: boolean;
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
  showFloatingControls = true,
  enableAutoFit = true,
}: TopologyGraphFlowProps) => {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges);
  const layoutedGraphRef = useRef<string>("");
  const hasFittedViewRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastContainerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Centralize fitView so initial mount and "became visible" resize paths stay consistent.
  const runFitView = useCallback(
    (duration = 300) => {
      try {
        fitView({ padding: 0.2, duration, maxZoom: 1.5, minZoom: 0.1 });
        hasFittedViewRef.current = true;
      } catch {
        // Ignore fit view failures from transient render states.
      }
    },
    [fitView]
  );

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

    const isSameGraph = graphSignature === layoutedGraphRef.current;
    if (!isSameGraph) {
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
      layoutedGraphRef.current = graphSignature;
      hasFittedViewRef.current = false;
    } else {
      // Same graph structure — sync node data (e.g. isSelected) while
      // preserving existing positions so no relayout occurs.
      setFlowNodes((prev) =>
        prev.map((existing) => {
          const updated = initialNodes.find((n) => n.id === existing.id);
          return updated ? { ...existing, data: updated.data } : existing;
        })
      );
    }

    // Always sync edges so style/data updates (e.g. selected edge) are applied
    // without forcing a full relayout.
    setFlowEdges(initialEdges);
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
    if (!enableAutoFit || flowNodes.length === 0 || hasFittedViewRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          runFitView(300);
        }, 100);
      });
    });
  }, [enableAutoFit, flowNodes.length, runFitView]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || flowNodes.length === 0) {
        return;
      }
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      if (width < 10 || height < 10) {
        lastContainerSizeRef.current = { width, height };
        return;
      }

      const prev = lastContainerSizeRef.current;
      const becameVisible = prev.width < 10 || prev.height < 10;
      lastContainerSizeRef.current = { width, height };

      if (!enableAutoFit || !becameVisible) {
        return;
      }

      requestAnimationFrame(() => {
        runFitView(250);
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [enableAutoFit, flowNodes.length, runFitView]);

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
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        minWidth: "100px",
        minHeight: "100px",
        position: "relative",
        ...style,
      }}
    >
      <style>{styleText}</style>
      {showFloatingControls && (
        <div className="absolute top-1 right-2 z-10 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => zoomIn()}
            className="h-7 w-7 bg-background/90 backdrop-blur-sm"
            title="Zoom In"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => zoomOut()}
            className="h-7 w-7 bg-background/90 backdrop-blur-sm"
            title="Zoom Out"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fitView({ padding: 0.2 })}
            className="h-7 w-7 bg-background/90 backdrop-blur-sm"
            title="Fit View"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>
      )}
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

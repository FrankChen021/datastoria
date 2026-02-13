import { Formatter } from "@/lib/formatter";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ForwardedRef,
} from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { SpanLogInspectorTableView } from "./span-log-inspector-table-view";
import {
  buildTraceTopo,
  type TraceTopoEdge,
  type TraceTopoNode,
} from "./span-log-inspector-topo-builder";

export interface GraphControlsRef {
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
}

interface TopoNodeData {
  node: TraceTopoNode;
}

interface SpanLogInspectorTopoViewProps {
  traceLogs: Record<string, unknown>[];
}

function TopoNodeRenderer({ data }: { data: TopoNodeData }) {
  return (
    <div className="rounded-lg border-2 shadow-lg min-w-[160px] bg-background border-border relative px-3 py-2">
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div className="text-sm font-semibold text-foreground text-center">{data.node.label}</div>
      <div className="text-[11px] text-muted-foreground text-center">{data.node.description}</div>
    </div>
  );
}

function TopoEdgeRenderer({ id, sourceX, sourceY, targetX, targetY, data, markerEnd }: EdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const edgeColor = typeof data?.color === "string" ? data.color : "hsl(var(--muted-foreground))";
  const label = typeof data?.label === "string" ? data.label : "";
  const edgeMarkerEnd = typeof markerEnd === "string" ? markerEnd : MarkerType.ArrowClosed;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={edgeMarkerEnd}
        style={{ strokeWidth: 2, stroke: edgeColor }}
      />
      {label !== "" && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 4}px)`,
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 4,
              fontSize: 10,
              color: "hsl(var(--foreground))",
              whiteSpace: "pre-line",
              textAlign: "center",
              padding: "2px 6px",
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { topoNode: TopoNodeRenderer };
const edgeTypes = { topoEdge: TopoEdgeRenderer };

interface TraceTopoFlowProps {
  topoNodes: TraceTopoNode[];
  topoEdges: TraceTopoEdge[];
  onControlsReady: (controls: GraphControlsRef) => void;
  onEdgeSelected: (edge: TraceTopoEdge | undefined) => void;
}

const TraceTopoFlowInner = ({
  topoNodes,
  topoEdges,
  onControlsReady,
  onEdgeSelected,
}: TraceTopoFlowProps) => {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const microsecondFormatter = Formatter.getInstance().getFormatter("microsecond");

  const edgeById = useMemo(() => {
    const map = new Map<string, TraceTopoEdge>();
    for (const edge of topoEdges) {
      map.set(edge.id, edge);
    }
    return map;
  }, [topoEdges]);

  const initialNodes: Node[] = useMemo(() => {
    return topoNodes.map((node) => ({
      id: node.id,
      type: "topoNode",
      position: { x: 0, y: 0 },
      data: { node },
      draggable: true,
    }));
  }, [topoNodes]);

  const initialEdges: Edge[] = useMemo(() => {
    return topoEdges.map((edge) => {
      const avgDuration = edge.count > 0 ? Math.floor(edge.totalDurationUs / edge.count) : 0;
      const edgeColor = edge.errorCount > 0 ? "#ef4444" : "hsl(var(--muted-foreground))";
      const label =
        edge.count <= 1
          ? `${edge.count} call\nRT=${microsecondFormatter(edge.maxDurationUs)}`
          : `${edge.count} calls\navg=${microsecondFormatter(avgDuration)}`;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "topoEdge",
        data: { edge, label, color: edgeColor } as Record<string, unknown>,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2, stroke: edgeColor },
      };
    });
  }, [topoEdges, microsecondFormatter]);

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges);

  const layoutGraph = useCallback((nodes: Node[], edges: Edge[]) => {
    if (nodes.length === 0) {
      return [];
    }
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 160 });
    const nodeWidth = 180;
    const nodeHeight = 72;

    for (const node of nodes) {
      graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    }
    for (const edge of edges) {
      graph.setEdge(edge.source, edge.target);
    }
    dagre.layout(graph);

    return nodes.map((node, index) => {
      const positionedNode = graph.node(node.id);
      if (!positionedNode) {
        return {
          ...node,
          position: { x: index * 220, y: 80 },
          targetPosition: Position.Left,
          sourcePosition: Position.Right,
        };
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
  }, []);

  useEffect(() => {
    setFlowEdges(initialEdges);
    setFlowNodes(layoutGraph(initialNodes, initialEdges));
  }, [initialNodes, initialEdges, layoutGraph, setFlowEdges, setFlowNodes]);

  useEffect(() => {
    onControlsReady({
      zoomIn: () => zoomIn(),
      zoomOut: () => zoomOut(),
      fitView: () => fitView({ padding: 0.2 }),
    });
  }, [fitView, onControlsReady, zoomIn, zoomOut]);

  useEffect(() => {
    if (flowNodes.length === 0) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300, maxZoom: 1.5, minZoom: 0.1 });
      });
    });
  }, [fitView, flowNodes.length]);

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      onEdgeSelected(edgeById.get(edge.id));
    },
    [edgeById, onEdgeSelected]
  );

  return (
    <div className="w-full h-full">
      <style>{`
        .react-flow__attribution {
          display: none !important;
        }
      `}</style>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        nodesDraggable={true}
        nodesConnectable={false}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={false}
        fitView
      />
    </div>
  );
};

const TraceTopoFlow = (props: TraceTopoFlowProps) => {
  return (
    <ReactFlowProvider>
      <TraceTopoFlowInner {...props} />
    </ReactFlowProvider>
  );
};

export const SpanLogInspectorTopoView = forwardRef(function SpanLogInspectorTopoView(
  { traceLogs }: SpanLogInspectorTopoViewProps,
  ref: ForwardedRef<GraphControlsRef>
) {
  const topo = useMemo(() => buildTraceTopo(traceLogs), [traceLogs]);
  const [selectedEdge, setSelectedEdge] = useState<TraceTopoEdge | undefined>(undefined);
  const [controls, setControls] = useState<GraphControlsRef | undefined>(undefined);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        controls?.zoomIn();
      },
      zoomOut: () => {
        controls?.zoomOut();
      },
      fitView: () => {
        controls?.fitView();
      },
    }),
    [controls]
  );

  const microsecondFormatter = Formatter.getInstance().getFormatter("microsecond");
  const avgDuration = selectedEdge
    ? selectedEdge.count > 0
      ? Math.floor(selectedEdge.totalDurationUs / selectedEdge.count)
      : 0
    : 0;

  if (selectedEdge) {
    return (
      <PanelGroup direction="vertical" className="h-full min-h-0">
        <Panel defaultSize={60} minSize={30}>
          <div className="h-full w-full min-h-0">
            <TraceTopoFlow
              topoNodes={topo.nodes}
              topoEdges={topo.edges}
              onControlsReady={setControls}
              onEdgeSelected={setSelectedEdge}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="h-[1px] w-full cursor-row-resize hover:bg-border/80 transition-colors" />
        <Panel defaultSize={40} minSize={20}>
          <div className="h-full min-h-0 flex flex-col border-t">
            <div className="px-3 py-2 border-b bg-muted/20 text-xs text-muted-foreground">
              {`${selectedEdge.source} -> ${selectedEdge.target} | ${selectedEdge.count} calls | ${selectedEdge.errorCount} errors | avg ${microsecondFormatter(avgDuration)}`}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <SpanLogInspectorTableView traceLogs={selectedEdge.sampleRows} />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    );
  }

  return (
    <div className="h-full w-full min-h-0">
      <TraceTopoFlow
        topoNodes={topo.nodes}
        topoEdges={topo.edges}
        onControlsReady={setControls}
        onEdgeSelected={setSelectedEdge}
      />
    </div>
  );
});

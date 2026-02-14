import { TopologyGraphFlow } from "@/components/shared/topology/topology-graph-flow";
import { Button } from "@/components/ui/button";
import { Formatter } from "@/lib/formatter";
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
import { X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { SpanLogInspectorTableView } from "./span-log-inspector-table-view";
import type { SpanLogTreeNode } from "./span-log-inspector-timeline-types";
import {
  buildTraceTopo,
  type TraceTopoEdge,
  type TraceTopoNode,
} from "./span-log-inspector-topo-builder";

interface TopoNodeData {
  node: TraceTopoNode;
}

interface SpanLogInspectorTopoViewProps {
  spanTree: SpanLogTreeNode[];
}

function TopoNodeRenderer({ data }: { data: TopoNodeData }) {
  return (
    <div className="rounded-lg border-2 shadow-lg min-w-[150px] bg-background border-border relative px-3 py-2">
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div className="text-sm font-semibold text-foreground text-center truncate">
        {data.node.label}
      </div>
      <div className="text-[11px] text-muted-foreground text-center truncate">
        {data.node.description}
      </div>
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

  const edgeColor = typeof data?.color === "string" ? data.color : undefined;
  const isSelected = data?.isSelected === true;
  const label = typeof data?.label === "string" ? data.label : "";
  const edgeMarkerEnd = typeof markerEnd === "string" ? markerEnd : MarkerType.ArrowClosed;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={edgeMarkerEnd}
        style={{ strokeWidth: 2, ...(edgeColor ? { stroke: edgeColor } : {}) }}
      />
      {label !== "" && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 4}px)`,
              background: "hsl(var(--background))",
              border: isSelected ? "1px solid #3b82f6" : "1px solid hsl(var(--border))",
              borderRadius: 4,
              fontSize: 10,
              color: "hsl(var(--foreground))",
              whiteSpace: "pre-line",
              textAlign: "center",
              padding: "2px 6px",
              boxShadow: isSelected ? "0 0 0 1px #3b82f6 inset" : undefined,
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

interface TraceTopoFlowProps {
  topoNodes: TraceTopoNode[];
  topoEdges: TraceTopoEdge[];
  selectedEdgeId?: string;
  onEdgeSelected: (edge: TraceTopoEdge | undefined) => void;
}

const TraceTopoFlow = ({
  topoNodes,
  topoEdges,
  selectedEdgeId,
  onEdgeSelected,
}: TraceTopoFlowProps) => {
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
      const isSelected = selectedEdgeId === edge.id;
      const edgeColor = edge.errorCount > 0 ? "#ef4444" : undefined;
      const selectedEdgeColor = edge.errorCount > 0 ? "#dc2626" : "#3b82f6";
      const label =
        edge.count <= 1
          ? `${edge.count} call\nRT=${microsecondFormatter(edge.maxDurationUs)}`
          : `${edge.count} calls\navg=${microsecondFormatter(avgDuration)}`;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "topoEdge",
        data: {
          edge,
          label,
          color: isSelected ? selectedEdgeColor : edgeColor,
          isSelected,
        } as Record<string, unknown>,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          strokeWidth: isSelected ? 3 : 2,
          ...(isSelected ? { stroke: selectedEdgeColor } : edgeColor ? { stroke: edgeColor } : {}),
        },
      };
    });
  }, [topoEdges, microsecondFormatter, selectedEdgeId]);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      topoNode: TopoNodeRenderer,
    }),
    []
  );
  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      topoEdge: TopoEdgeRenderer,
    }),
    []
  );

  const handleEdgeClickHandler = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      onEdgeSelected(edgeById.get(edge.id));
    },
    [edgeById, onEdgeSelected]
  );

  return (
    <TopologyGraphFlow
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onEdgeClick={handleEdgeClickHandler}
      nodeWidth={150}
      nodeHeight={60}
      nodesep={60}
      ranksep={160}
    />
  );
};

export function SpanLogInspectorTopoView({ spanTree }: SpanLogInspectorTopoViewProps) {
  const topo = useMemo(() => buildTraceTopo(spanTree), [spanTree]);
  const [selectedEdge, setSelectedEdge] = useState<TraceTopoEdge | undefined>(undefined);

  const microsecondFormatter = Formatter.getInstance().getFormatter("microsecond");
  const avgDuration = selectedEdge
    ? selectedEdge.count > 0
      ? Math.floor(selectedEdge.totalDurationUs / selectedEdge.count)
      : 0
    : 0;

  // Always render the same component tree so that ReactFlow is never
  // unmounted/remounted when the detail pane opens or closes.
  return (
    <PanelGroup direction="vertical" className="h-full min-h-0">
      <Panel defaultSize={selectedEdge ? 60 : 100} minSize={30}>
        <div className="h-full w-full min-h-0">
          <TraceTopoFlow
            topoNodes={topo.nodes}
            topoEdges={topo.edges}
            selectedEdgeId={selectedEdge?.id}
            onEdgeSelected={setSelectedEdge}
          />
        </div>
      </Panel>

      {selectedEdge && (
        <>
          <PanelResizeHandle className="h-[1px] w-full cursor-row-resize hover:bg-border/80 transition-colors" />
          <Panel defaultSize={40} minSize={20}>
            <div className="h-full min-h-0 flex flex-col border-t">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20 text-xs text-muted-foreground">
                <span>{`${selectedEdge.source} -> ${selectedEdge.target} | ${selectedEdge.count} calls | ${selectedEdge.errorCount} errors | avg ${microsecondFormatter(avgDuration)}`}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedEdge(undefined)}
                  className="h-6 w-6 flex-shrink-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <SpanLogInspectorTableView spanLogs={selectedEdge.sampleRows} />
              </div>
            </div>
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}

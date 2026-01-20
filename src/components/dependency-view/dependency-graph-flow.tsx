import type { GraphEdge } from "@/components/shared/graphviz/Graph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TextHighlighter } from "@/lib/text-highlighter";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { Maximize, Maximize2, Minimize, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DependencyGraphNode } from "./DependencyBuilder";

interface DependencyGraphFlowProps {
  nodes: Map<string, DependencyGraphNode>;
  edges: GraphEdge[];
  onNodeClick?: (nodeId: string) => void;
  className?: string;
  style?: React.CSSProperties;
  database: string; // Database name for unique ID generation
  highlightedTableId?: string; // Optional: ID of table to highlight (for table-specific views)
}

// Custom node component for table nodes
function TableNode({
  data,
  selected,
}: {
  data: { node: DependencyGraphNode; searchQuery?: string; isHighlighted?: boolean };
  selected?: boolean;
}) {
  const { node, searchQuery, isHighlighted } = data;
  const isNotFound = node.category === "";
  const isExternal = node.type === "External";

  // Highlight table name if search query matches
  const tableNameDisplay = useMemo(() => {
    if (!node.name) return null;
    if (!searchQuery || !searchQuery.trim()) {
      return <div className="text-sm font-medium text-foreground">{node.name}</div>;
    }
    return (
      <div className="text-sm font-medium text-foreground">
        {TextHighlighter.highlight(node.name, searchQuery, "bg-yellow-400 dark:bg-yellow-600")}
      </div>
    );
  }, [node.name, searchQuery]);

  return (
    <div
      className={`rounded-lg border-2 shadow-lg min-w-[200px] transition-all ${
        isHighlighted
          ? "border-green-500 ring-4 ring-green-500/50 ring-offset-2 bg-green-50 dark:bg-green-950/30"
          : selected
            ? "border-primary ring-2 ring-primary ring-offset-2"
            : isNotFound
              ? "border-red-500 bg-red-50 dark:bg-red-950/20"
              : isExternal
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                : "border-border bg-background"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="px-3 py-2 border-b border-border text-center">
        <div className="font-semibold text-sm text-foreground">
          {isNotFound ? "NOT FOUND" : `<<${node.category}>>`}
        </div>
      </div>
      <div className="px-3 py-2 text-center">
        <div className="text-sm font-medium text-foreground">{node.namespace}</div>
      </div>
      {node.name && (
        <div className="px-3 py-2 border-t border-border text-center">{tableNameDisplay}</div>
      )}
    </div>
  );
}

// Custom edge component with label rendering
function CustomEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd }: EdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const label = data?.label;
  const hasLabel = label !== undefined && label !== null && String(label).trim() !== "";

  // Use markerEnd from props, fallback to ArrowClosed
  // BaseEdge expects a string, so extract type if it's an object
  let edgeMarkerEnd: string = MarkerType.ArrowClosed;
  if (typeof markerEnd === "string") {
    edgeMarkerEnd = markerEnd;
  } else if (markerEnd && typeof markerEnd === "object" && "type" in markerEnd) {
    edgeMarkerEnd = (markerEnd as { type: string }).type;
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={edgeMarkerEnd} style={{ strokeWidth: 2 }} />
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
            }}
            className="nodrag nopan"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Dedicated panel component to minimize re-renders
interface GraphControlPanelProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  matchingNodeIds: Set<string>;
  selectedNodeId: string | null;
  onFocusFirstMatch: () => void;
  onNextMatch: () => void;
  onPreviousMatch: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
}

const GraphControlPanel = ({
  searchQuery,
  onSearchChange,
  onClearSearch,
  matchingNodeIds,
  selectedNodeId,
  onFocusFirstMatch,
  onNextMatch,
  onPreviousMatch,
  containerRef,
  onZoomIn,
  onZoomOut,
  onFitView,
}: GraphControlPanelProps) => {
  const [showSearch, setShowSearch] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when it becomes visible
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Handle fullscreen toggle
  const handleFullscreenToggle = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch (error) {
      console.error("Error toggling fullscreen:", error);
    }
  }, [isFullscreen, containerRef]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleSearchClick = useCallback(() => {
    setShowSearch((prev) => !prev);
    if (!showSearch) {
      // Clear search when closing
      onClearSearch();
    }
  }, [showSearch, onClearSearch]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  const handleClearSearch = useCallback(() => {
    onClearSearch();
    // Only close search panel if there's no query
    if (!searchQuery.trim()) {
      setShowSearch(false);
    }
  }, [onClearSearch, searchQuery]);

  return (
    <TooltipProvider>
      <Panel position="top-right" className="!m-1">
        <div className="flex items-start gap-1">
          <div className="bg-background rounded-md shadow-lg">
            <div className="flex items-center gap-1">
              {showSearch && (
                <>
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search tables..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    className="border-0 border-b rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 h-8 px-2 bg-transparent flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (selectedNodeId) {
                          onNextMatch();
                        } else {
                          onFocusFirstMatch();
                        }
                      } else if (e.key === "Enter" && e.shiftKey) {
                        e.preventDefault();
                        onPreviousMatch();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleClearSearch();
                      }
                    }}
                  />
                  {searchQuery && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleClearSearch}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clear search</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSearchClick}
                    className="h-8 w-8 flex-shrink-0"
                    aria-label={showSearch ? "Hide search" : "Show search"}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{showSearch ? "Hide search" : "Show search"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {showSearch && searchQuery && matchingNodeIds.size === 0 && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">No tables found</div>
            )}
            {showSearch && searchQuery && matchingNodeIds.size > 0 && (
              <>
                <div className="px-3 min-h-[2rem] flex items-center text-xs text-muted-foreground">
                  {selectedNodeId
                    ? `${Array.from(matchingNodeIds).indexOf(selectedNodeId) + 1}/${matchingNodeIds.size} `
                    : `${matchingNodeIds.size} tables found. `}
                  Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Enter</kbd>/
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Shift+Enter</kbd> to
                  locate
                </div>
              </>
            )}
          </div>
          <div className="bg-background rounded-md shadow-lg flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onZoomIn}
                  className="h-8 w-8"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Zoom in</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onZoomOut}
                  className="h-8 w-8"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Zoom out</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onFitView}
                  className="h-8 w-8"
                  aria-label="Fit view"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fit view</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="bg-background rounded-md shadow-lg">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleFullscreenToggle}
                  className="h-8 w-8"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </Panel>
    </TooltipProvider>
  );
};

const DependencyGraphFlowInner = ({
  nodes,
  edges,
  onNodeClick,
  className,
  style,
  database,
  highlightedTableId,
}: DependencyGraphFlowProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { fitView, getNode, zoomIn, zoomOut } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFittedViewRef = useRef(false);
  const previousNodesSizeRef = useRef(0);
  // Use database name for unique ID to prevent marker conflicts between multiple instances
  const instanceId = `react-flow-dependency-${database}`;

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
          type: "customEdge" as const,
          data: { label: edge.label },
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: { strokeWidth: 2 },
        };
        return edgeObj;
      });
    return mappedEdges;
  }, [edges, nodes]);

  // Calculate maximum name length for dynamic spacing
  const maxNameLength = useMemo(() => {
    let maxLength = 0;
    nodes.forEach((node) => {
      const engineLength = node.category?.length || 0;
      const databaseLength = node.namespace?.length || 0;
      const nameLength = node.name?.length || 0;
      maxLength = Math.max(maxLength, engineLength, databaseLength, nameLength);
    });
    return maxLength;
  }, [nodes]);

  // Layout function
  const getLayoutedNodes = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));

      // Calculate ranksep based on max name length
      // Base: 250 for names <= 60, then scale proportionally
      const baseRanksep = 250;
      const baseMaxLength = 60;
      const ranksep =
        maxNameLength <= baseMaxLength
          ? baseRanksep
          : baseRanksep + (maxNameLength - baseMaxLength) * 4; // 4px per character over 60

      dagreGraph.setGraph({ rankdir: "LR", nodesep: 10, ranksep });

      const nodeWidth = 250;
      const nodeHeight = 150;

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
    },
    [maxNameLength]
  );

  // Convert nodes to React Flow format
  const initialNodes: Node[] = useMemo(() => {
    if (!nodes || nodes.size === 0) {
      return [];
    }

    return Array.from(nodes.values()).map((node) => ({
      id: node.id,
      type: "tableNode",
      position: { x: 0, y: 0 }, // Will be calculated by layout
      data: {
        node,
        searchQuery: searchQuery.trim() || undefined,
        isHighlighted: highlightedTableId === node.id,
      },
      draggable: true,
    }));
  }, [nodes, searchQuery, highlightedTableId]);

  // Use React Flow's built-in state hooks
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when props change
  useEffect(() => {
    if (initialNodes.length > 0 && initialEdges.length > 0) {
      const layoutedNodes = getLayoutedNodes(initialNodes, initialEdges);
      setFlowNodes(layoutedNodes);
      setFlowEdges(initialEdges);
    } else {
      setFlowNodes([]);
      setFlowEdges([]);
    }
  }, [initialNodes, initialEdges, getLayoutedNodes, setFlowNodes, setFlowEdges]);

  // Reset fit view flag when nodes change (e.g., database switch)
  useEffect(() => {
    const currentNodesSize = nodes.size;
    if (currentNodesSize !== previousNodesSizeRef.current) {
      hasFittedViewRef.current = false;
      previousNodesSizeRef.current = currentNodesSize;
    }
  }, [nodes]);

  // Fit view when graph is initially loaded or when database changes
  useEffect(() => {
    if (flowNodes.length > 0 && flowEdges.length > 0 && !hasFittedViewRef.current) {
      // Use requestAnimationFrame to ensure the layout is complete before fitting
      // Double RAF ensures the DOM is fully updated and ReactFlow has calculated positions
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Add a small delay to ensure ReactFlow internal state is ready
          setTimeout(() => {
            try {
              fitView({ padding: 0.2, duration: 300, maxZoom: 1.5, minZoom: 0.1 });
              hasFittedViewRef.current = true;
            } catch (error) {
              console.warn("Failed to fit view:", error);
            }
          }, 200);
        });
      });
    }
  }, [flowNodes, flowEdges, fitView]);

  // Filter nodes based on search query (only match table name)
  const matchingNodeIds = useMemo(() => {
    if (!searchQuery.trim()) {
      return new Set<string>();
    }

    const query = searchQuery.toLowerCase().trim();
    const matches = new Set<string>();

    nodes.forEach((node, nodeId) => {
      const nameMatch = node.name?.toLowerCase().includes(query) ?? false;
      if (nameMatch) {
        matches.add(nodeId);
      }
    });

    return matches;
  }, [searchQuery, nodes]);

  // Update node selection state and ensure search query is in data
  const flowNodesWithSelection = useMemo(() => {
    return flowNodes.map((node) => ({
      ...node,
      selected: selectedNodeId === node.id,
      data: {
        ...node.data,
        searchQuery: searchQuery.trim() || undefined,
        isHighlighted: highlightedTableId === node.id,
      },
    }));
  }, [flowNodes, selectedNodeId, searchQuery, highlightedTableId]);

  // Node and edge types configuration
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      tableNode: TableNode,
    }),
    []
  );

  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      customEdge: CustomEdge,
    }),
    []
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

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSelectedNodeId(null);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleFocusFirstMatch = useCallback(() => {
    if (matchingNodeIds.size === 0) return;

    const firstMatchId = Array.from(matchingNodeIds)[0];
    const node = getNode(firstMatchId);
    if (node) {
      setSelectedNodeId(firstMatchId);
      fitView({
        nodes: [{ id: firstMatchId }],
        padding: 0.2,
        duration: 300,
      });
    }
  }, [matchingNodeIds, getNode, fitView]);

  const handleNextMatch = useCallback(() => {
    if (matchingNodeIds.size === 0) return;

    const matchArray = Array.from(matchingNodeIds);
    const currentIndex = selectedNodeId ? matchArray.indexOf(selectedNodeId) : -1;
    const nextIndex = (currentIndex + 1) % matchArray.length;
    const nextNodeId = matchArray[nextIndex];

    const node = getNode(nextNodeId);
    if (node) {
      setSelectedNodeId(nextNodeId);
      fitView({
        nodes: [{ id: nextNodeId }],
        duration: 300,
      });
    }
  }, [matchingNodeIds, selectedNodeId, getNode, fitView]);

  const handlePreviousMatch = useCallback(() => {
    if (matchingNodeIds.size === 0) return;

    const matchArray = Array.from(matchingNodeIds);
    const currentIndex = selectedNodeId ? matchArray.indexOf(selectedNodeId) : -1;
    const prevIndex = currentIndex <= 0 ? matchArray.length - 1 : currentIndex - 1;
    const prevNodeId = matchArray[prevIndex];

    const node = getNode(prevNodeId);
    if (node) {
      setSelectedNodeId(prevNodeId);
      fitView({
        nodes: [{ id: prevNodeId }],
        duration: 300,
      });
    }
  }, [matchingNodeIds, selectedNodeId, getNode, fitView]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%", position: "relative", ...style }}
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
        key={instanceId}
        id={instanceId}
        nodes={flowNodesWithSelection}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickHandler}
        defaultEdgeOptions={{
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
        }}
        fitView
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll={true}
        zoomOnScroll={false}
        panOnDrag={true}
      >
        <GraphControlPanel
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={handleClearSearch}
          matchingNodeIds={matchingNodeIds}
          selectedNodeId={selectedNodeId}
          onFocusFirstMatch={handleFocusFirstMatch}
          onNextMatch={handleNextMatch}
          onPreviousMatch={handlePreviousMatch}
          containerRef={containerRef}
          onZoomIn={() => zoomIn()}
          onZoomOut={() => zoomOut()}
          onFitView={() => fitView({ padding: 0.2 })}
        />
      </ReactFlow>
      {flowEdges.length > 0 && (
        <div
          className="absolute top-1 left-1 bg-background/95 backdrop-blur-sm shadow-lg text-xs text-muted-foreground pointer-events-none"
          style={{ zIndex: 10 }}
        >
          💡 Use scroll wheel or trackpad to zoom, drag to pan
        </div>
      )}
    </div>
  );
};

export const DependencyGraphFlow = (props: DependencyGraphFlowProps) => {
  return (
    <ReactFlowProvider>
      <DependencyGraphFlowInner {...props} />
    </ReactFlowProvider>
  );
};

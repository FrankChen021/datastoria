import DebouncedSearchInput from "@/components/shared/debounced-search-input";
import { Button } from "@/components/ui/button";
import { Formatter } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ZoomIn, ZoomOut } from "lucide-react";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { TimelineRow } from "./timeline-row";
import { calculateTimelineTooltipPosition, TimelineTooltip } from "./timeline-tooltip";
import type { ExpandableTreeView, TimelineNode, TimelineStats } from "./timeline-types";

const MICROSECONDS_PER_MS = 1000;
const BAR_HEIGHT = 36;
const ROW_GAP = 0;
const MIN_TREE_WIDTH = 10;
const MAX_TREE_WIDTH = 60;
const INITIAL_EXPANSION_LIMIT = 1000;

interface SharedTimelineViewProps {
  inputNodeTree: TimelineNode[];
  inputNodeList: TimelineNode[];
  timelineStats: TimelineStats;
  isActive: boolean;
  searchPlaceholderSuffix?: string;
  inactiveMessage?: string;
  processingMessage?: string;
  noDataMessage?: string;
  renderDetailPane?: (selectedNode: TimelineNode, onClose: () => void) => React.ReactNode;
  renderTooltipContent?: (node: TimelineNode) => React.ReactNode;
}

function flattenVisibleNodes(
  tree: TimelineNode[],
  expanded: Set<string>
): {
  visibleNodes: TimelineNode[];
  minStart: number;
  maxDuration: number;
} {
  const nodes: TimelineNode[] = [];
  const stack: TimelineNode[] = [];
  let minStart = Number.MAX_SAFE_INTEGER;
  let maxEnd = Number.MIN_SAFE_INTEGER;

  for (let i = tree.length - 1; i >= 0; i--) {
    stack.push(tree[i]);
  }

  while (stack.length > 0) {
    const node = stack.pop() as TimelineNode;
    nodes.push(node);

    const start = node.startTime / MICROSECONDS_PER_MS;
    const end = start + node.costTime / MICROSECONDS_PER_MS;
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;

    if (node.children && expanded.has(node.id)) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }

  return {
    visibleNodes: nodes,
    minStart,
    maxDuration: maxEnd - minStart || 1,
  };
}

function applyPattern(node: TimelineNode, pattern: string): boolean {
  const idx = node._search.indexOf(pattern);
  if (idx >= 0) {
    const displayIdx = node._display.toLowerCase().indexOf(pattern);
    if (displayIdx >= 0) {
      node._matchedIndex = displayIdx;
      node._matchedLength = pattern.length;
    } else {
      node._matchedIndex = -1;
      node._matchedLength = 0;
    }
    return true;
  }
  node._matchedIndex = -1;
  node._matchedLength = 0;
  return false;
}

function searchNodes(
  nodeList: TimelineNode[],
  namePattern: string,
  nodeTree: TimelineNode[]
): TimelineNode[] {
  const namePatternLower = namePattern.toLowerCase();
  const matchedNodeIds = new Set<string>();

  nodeList.forEach((node) => {
    if (applyPattern(node, namePatternLower)) {
      matchedNodeIds.add(node.id);
    }
  });

  const hasMatchInSubtreeCache = new Map<string, boolean>();

  const checkDescendants = (node: TimelineNode): boolean => {
    if (hasMatchInSubtreeCache.has(node.id)) {
      return hasMatchInSubtreeCache.get(node.id) as boolean;
    }

    let childrenMatch = false;
    if (node.children) {
      for (const child of node.children) {
        if (checkDescendants(child)) {
          childrenMatch = true;
        }
      }
    }

    const selfMatch = matchedNodeIds.has(node.id);
    const hasMatch = selfMatch || childrenMatch;
    hasMatchInSubtreeCache.set(node.id, hasMatch);
    if (hasMatch) {
      matchedNodeIds.add(node.id);
    }
    return hasMatch;
  };

  nodeTree.forEach((node) => checkDescendants(node));

  const buildFilteredTree = (node: TimelineNode): TimelineNode | null => {
    const hasMatchInSubtree = hasMatchInSubtreeCache.get(node.id);
    if (!hasMatchInSubtree) {
      return null;
    }

    const filteredChildren: TimelineNode[] = [];
    node.children.forEach((child) => {
      const filteredChild = buildFilteredTree(child);
      if (filteredChild) {
        filteredChildren.push(filteredChild);
      }
    });

    applyPattern(node, namePatternLower);

    return {
      ...node,
      children: filteredChildren,
      childCount: filteredChildren.length,
    };
  };

  const filteredTree: TimelineNode[] = [];
  nodeTree.forEach((rootNode) => {
    const filteredRoot = buildFilteredTree(rootNode);
    if (filteredRoot) {
      filteredTree.push(filteredRoot);
    }
  });

  return filteredTree;
}

const SharedTimelineView = React.memo(
  forwardRef<ExpandableTreeView, SharedTimelineViewProps>(
    (
      {
        inputNodeTree,
        inputNodeList,
        timelineStats,
        isActive,
        searchPlaceholderSuffix = "nodes",
        inactiveMessage = "Switch to Timeline tab to view logs",
        processingMessage = "Processing timeline data...",
        noDataMessage = "No nodes found",
        renderDetailPane,
        renderTooltipContent,
      },
      ref
    ) => {
      const [filteredNodeTree, setFilteredNodeTree] = useState<TimelineNode[]>([]);
      const [expanded, setExpanded] = useState<Set<string>>(new Set());
      const [currentSearchTerm, setCurrentSearchTerm] = useState<string>("");
      const lastProcessedInputRef = useRef<TimelineNode[] | null>(null);

      const [zoomLevel, setZoomLevel] = useState<number>(1.0);
      const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
      const [selectedNode, setSelectedNode] = useState<TimelineNode | undefined>(undefined);
      const [tooltipNode, setTooltipNode] = useState<TimelineNode | null>(null);
      const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(
        null
      );

      const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null);
      const isMouseInTimelineRowRef = useRef(false);
      const tooltipNodeRef = useRef<TimelineNode | null>(null);
      const tooltipPositionRef = useRef<{ top: number; left: number } | null>(null);
      const tooltipRafRef = useRef<number | undefined>(undefined);
      const lastMouseMoveTimeRef = useRef<number>(0);

      const [treeWidthPercent, setTreeWidthPercent] = useState(25);
      const parentRef = useRef<HTMLDivElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);
      const dragStartX = useRef<number>(0);
      const dragStartPercent = useRef<number>(0);
      const isDragging = useRef(false);
      const justFinishedDragging = useRef(false);

      const visibleNodesRef = useRef<TimelineNode[]>([]);
      const handleMouseMoveRef = useRef<((e: MouseEvent) => void) | undefined>(undefined);

      useEffect(() => {
        function onMouseMove(e: MouseEvent) {
          if (!isDragging.current || !containerRef.current) return;

          requestAnimationFrame(() => {
            const containerWidth = containerRef.current?.getBoundingClientRect().width || 0;
            if (containerWidth <= 0) {
              return;
            }
            const deltaX = e.clientX - dragStartX.current;
            const deltaPercent = (deltaX / containerWidth) * 100;
            let newPercent = dragStartPercent.current + deltaPercent;
            newPercent = Math.max(MIN_TREE_WIDTH, Math.min(newPercent, MAX_TREE_WIDTH));
            setTreeWidthPercent(newPercent);
          });
        }

        function onMouseUp() {
          if (!isDragging.current) return;

          isDragging.current = false;
          justFinishedDragging.current = true;
          setTimeout(() => {
            justFinishedDragging.current = false;
          }, 100);

          requestAnimationFrame(() => {
            document.body.style.cursor = "";
          });
        }

        window.addEventListener("mousemove", onMouseMove, { passive: true });
        window.addEventListener("mouseup", onMouseUp, { passive: true });
        return () => {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };
      }, []);

      const onMouseEnterRow = useCallback((e: React.MouseEvent) => {
        const target = e.currentTarget as HTMLElement;
        const nodeId = target.getAttribute("data-node-id");
        if (!nodeId) return;

        const node = visibleNodesRef.current.find((n) => n.id === nodeId);
        if (!node) return;

        isMouseInTimelineRowRef.current = true;
        lastMousePositionRef.current = { x: e.clientX, y: e.clientY };
        tooltipNodeRef.current = node;
        tooltipPositionRef.current = calculateTimelineTooltipPosition(e.clientX, e.clientY);

        if (tooltipRafRef.current) {
          cancelAnimationFrame(tooltipRafRef.current);
        }
        tooltipRafRef.current = requestAnimationFrame(() => {
          setTooltipNode(tooltipNodeRef.current);
          setTooltipPosition(tooltipPositionRef.current);
        });
      }, []);

      const handleViewMouseEnter = useCallback(() => {
        isMouseInTimelineRowRef.current = true;
      }, []);

      const handleViewMouseLeave = useCallback(() => {
        isMouseInTimelineRowRef.current = false;
        tooltipNodeRef.current = null;
        tooltipPositionRef.current = null;
        setTooltipNode(null);
        setTooltipPosition(null);
        if (tooltipRafRef.current) {
          cancelAnimationFrame(tooltipRafRef.current);
        }
      }, []);

      const onMouseLeaveRow = useCallback(() => {
        tooltipNodeRef.current = null;
        tooltipPositionRef.current = null;
        isMouseInTimelineRowRef.current = false;
        setTooltipNode(null);
        setTooltipPosition(null);
        if (tooltipRafRef.current) {
          cancelAnimationFrame(tooltipRafRef.current);
        }
      }, []);

      handleMouseMoveRef.current = (e: MouseEvent) => {
        if (
          !isMouseInTimelineRowRef.current ||
          !lastMousePositionRef.current ||
          !parentRef.current
        ) {
          return;
        }

        const now = Date.now();
        if (now - lastMouseMoveTimeRef.current < 16) {
          return;
        }
        lastMouseMoveTimeRef.current = now;

        if (tooltipNodeRef.current) {
          const dx = e.clientX - lastMousePositionRef.current.x;
          const dy = e.clientY - lastMousePositionRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 5) {
            lastMousePositionRef.current = { x: e.clientX, y: e.clientY };
            tooltipPositionRef.current = calculateTimelineTooltipPosition(e.clientX, e.clientY);
            if (tooltipRafRef.current) {
              cancelAnimationFrame(tooltipRafRef.current);
            }
            tooltipRafRef.current = requestAnimationFrame(() => {
              setTooltipNode(tooltipNodeRef.current);
              setTooltipPosition(tooltipPositionRef.current);
            });
          }
        }
      };

      useEffect(() => {
        const handler = (e: MouseEvent) => handleMouseMoveRef.current?.(e);
        window.addEventListener("mousemove", handler);
        return () => {
          window.removeEventListener("mousemove", handler);
          if (tooltipRafRef.current) {
            cancelAnimationFrame(tooltipRafRef.current);
          }
        };
      }, []);

      const onSearch = useCallback(
        (value: string) => {
          setCurrentSearchTerm(value);
          if (!value.trim()) {
            const clearHighlights = (nodes: TimelineNode[]) => {
              nodes.forEach((node) => {
                node._matchedIndex = -1;
                node._matchedLength = 0;
                clearHighlights(node.children);
              });
            };
            clearHighlights(inputNodeTree);
            setFilteredNodeTree(inputNodeTree);
            return;
          }
          const tree = searchNodes(inputNodeList, value, inputNodeTree);
          setFilteredNodeTree(tree);
        },
        [inputNodeList, inputNodeTree]
      );

      useEffect(() => {
        const dataHasChanged = lastProcessedInputRef.current !== inputNodeTree;
        if (isActive && dataHasChanged) {
          const initialExpanded = new Set<string>();
          let count = 0;

          function traverse(node: TimelineNode) {
            if (count >= INITIAL_EXPANSION_LIMIT) return;
            initialExpanded.add(node.id);
            count++;
            node.children.forEach((child) => traverse(child));
          }

          inputNodeTree.forEach((node) => traverse(node));
          setExpanded(initialExpanded);

          if (currentSearchTerm.trim()) {
            const tree = searchNodes(inputNodeList, currentSearchTerm, inputNodeTree);
            setFilteredNodeTree(tree);
          } else {
            setFilteredNodeTree(inputNodeTree);
          }
          lastProcessedInputRef.current = inputNodeTree;
        }
      }, [isActive, inputNodeTree, inputNodeList, currentSearchTerm]);

      const expandNodes = useCallback(
        (shouldExpand: (depth: number) => boolean) => {
          const newExpanded = new Set<string>();
          let totalNodes = 0;

          function traverse(node: TimelineNode, depth: number) {
            if (totalNodes >= INITIAL_EXPANSION_LIMIT) return;
            if (shouldExpand(depth)) {
              newExpanded.add(node.id);
              totalNodes++;
              node.children.forEach((child) => traverse(child, depth + 1));
            }
          }

          filteredNodeTree.forEach((node) => traverse(node, 0));
          setExpanded(newExpanded);
        },
        [filteredNodeTree]
      );

      const handleZoomIn = useCallback(() => {
        setZoomLevel((prevZoom) => prevZoom * 1.5);
      }, []);

      const handleZoomOut = useCallback(() => {
        setZoomLevel((prevZoom) => Math.max(prevZoom / 1.5, 0.1));
      }, []);

      const { visibleNodes, minStart, maxDuration } = useMemo(() => {
        return flattenVisibleNodes(filteredNodeTree, expanded);
      }, [filteredNodeTree, expanded]);

      useEffect(() => {
        visibleNodesRef.current = visibleNodes;
      }, [visibleNodes]);

      const getRowSize = useCallback(() => BAR_HEIGHT + ROW_GAP, []);

      const rowPositions = useMemo(() => {
        const positions: number[] = [];
        let currentPosition = 0;
        visibleNodes.forEach((_, index) => {
          positions[index] = currentPosition;
          currentPosition += BAR_HEIGHT + ROW_GAP;
        });
        return { positions, totalHeight: currentPosition };
      }, [visibleNodes]);

      const rowVirtualizer = useVirtualizer({
        count: visibleNodes.length,
        getScrollElement: () => parentRef.current,
        estimateSize: getRowSize,
        getItemKey: (index) => visibleNodes[index]?.id || index,
        overscan: 5,
        measureElement: (element) => {
          return element?.getBoundingClientRect().height ?? BAR_HEIGHT + ROW_GAP;
        },
      });

      const toggleExpand = useCallback((nodeId: string) => {
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
      }, []);

      useImperativeHandle(
        ref,
        () => ({
          expandAll: () => {
            expandNodes(() => true);
          },
          collapseAll: () => setExpanded(new Set()),
          expandToDepth: (depth: number) => {
            expandNodes((currentDepth) => currentDepth < depth);
          },
          canExpand: () => true,
        }),
        [expandNodes]
      );

      const handleNodeSelect = useCallback((node: TimelineNode) => {
        if (justFinishedDragging.current) {
          return;
        }
        setSelectedNodeId(node.id);
        setSelectedNode(node);
        tooltipNodeRef.current = null;
        tooltipPositionRef.current = null;
        setTooltipNode(null);
        setTooltipPosition(null);
        if (tooltipRafRef.current) {
          cancelAnimationFrame(tooltipRafRef.current);
        }
      }, []);

      const onSplitterMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        isDragging.current = true;
        dragStartX.current = e.clientX;
        dragStartPercent.current = treeWidthPercent;
        requestAnimationFrame(() => {
          document.body.style.cursor = "col-resize";
        });
      };

      const handleCloseDetailPane = useCallback(() => {
        setSelectedNode(undefined);
        setSelectedNodeId(null);
      }, []);

      if (!lastProcessedInputRef.current) {
        return (
          <div className="flex items-center justify-center h-full py-8">
            <div className="text-sm text-gray-500">
              {!isActive ? inactiveMessage : processingMessage}
            </div>
          </div>
        );
      }

      const showDetailPane = !!selectedNode && !!renderDetailPane;

      return (
        <PanelGroup direction="horizontal" className="w-full h-full">
          <Panel defaultSize={showDetailPane ? 70 : 100} minSize={30}>
            <div
              ref={containerRef}
              className={cn("w-full h-full overflow-auto border-t")}
              onMouseEnter={handleViewMouseEnter}
              onMouseLeave={handleViewMouseLeave}
            >
              <div className="flex items-center h-8 border-b border-gray-200 dark:border-gray-700 font-medium bg-gray-50 dark:bg-gray-800">
                <div className="shrink-0" style={{ width: `${treeWidthPercent}%` }}>
                  <DebouncedSearchInput
                    inputClassName="h-8 border-0 border-b rounded-none"
                    placeholder={`${Formatter.getInstance().getFormatter("comma_number")(timelineStats.totalNodes)} ${searchPlaceholderSuffix}`}
                    onSearch={onSearch}
                    defaultValue={""}
                    autoFocus={isActive}
                  />
                </div>
                <div className="w-[2px] shrink-0 mx-0.5 h-full bg-gray-300 dark:bg-gray-600" />
                <div className="flex-1 min-w-0 px-2 text-sm flex items-center justify-between text-gray-900 dark:text-gray-100">
                  <span>Timeline</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Zoom</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleZoomOut}
                      disabled={zoomLevel <= 0.1}
                    >
                      <ZoomOut className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleZoomIn}
                    >
                      <ZoomIn className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              <div ref={parentRef} className="h-[calc(100dvh-110px)] overflow-auto">
                <div
                  className="w-full relative"
                  style={{
                    height: `${rowPositions.totalHeight + 36}px`,
                    minHeight: `${rowPositions.totalHeight + 36}px`,
                  }}
                >
                  {visibleNodes.length === 0 && (
                    <div className="flex items-center justify-center h-full py-4">
                      <div className="text-sm text-gray-500">{noDataMessage}</div>
                    </div>
                  )}
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const node = visibleNodes[virtualRow.index];
                    const isSelected = node.id === selectedNodeId;
                    const isExpanded = expanded.has(node.id);
                    const manualPosition = rowPositions.positions[virtualRow.index];

                    return (
                      <div
                        key={node.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${manualPosition}px)`,
                        }}
                      >
                        <TimelineRow
                          node={node}
                          searchTerm={currentSearchTerm}
                          isSelected={isSelected}
                          isExpanded={isExpanded}
                          treeWidthPercent={treeWidthPercent}
                          onSelect={handleNodeSelect}
                          onToggleExpand={toggleExpand}
                          onSplitterMouseDown={onSplitterMouseDown}
                          minStart={minStart}
                          totalDuration={maxDuration}
                          onEnterRow={onMouseEnterRow}
                          onLeaveRow={onMouseLeaveRow}
                          zoomLevel={zoomLevel}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {tooltipNode && tooltipPosition && (
                <TimelineTooltip
                  node={tooltipNode}
                  initialPosition={tooltipPosition}
                  renderTooltipContent={renderTooltipContent}
                />
              )}
            </div>
          </Panel>
          {showDetailPane && selectedNode && renderDetailPane && (
            <>
              <PanelResizeHandle className="w-[1px] h-full cursor-col-resize bg-border hover:bg-border/80 transition-colors" />
              <Panel defaultSize={30} minSize={20} className="">
                {renderDetailPane(selectedNode, handleCloseDetailPane)}
              </Panel>
            </>
          )}
        </PanelGroup>
      );
    }
  )
);

SharedTimelineView.displayName = "SharedTimelineView";
export default SharedTimelineView;

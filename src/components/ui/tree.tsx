/**
 * Based on: https://github.com/shadcn-ui/ui/issues/355#issuecomment-1703767574
 * Enhanced with virtual scrolling for optimal performance with large datasets
 */

"use client";

import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, type LucideIcon } from "lucide-react";
import React, { useCallback, useMemo, useRef } from "react";
import { searchTree } from "../../lib/tree-search";
import { Badge } from "./badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

interface TreeDataItem {
  id: string;
  labelContent: React.ReactNode;
  search: string;
  icon?: LucideIcon;
  children?: TreeDataItem[];

  // Attached data
  data?: unknown;
  // Node type: 'folder' represents a non-leaf node, 'leaf' represents a terminal node
  type?: "folder" | "leaf";
  // Used by searchTree to suggest expansion
  _expanded?: boolean;
  // Custom tag/badge to render alongside the node label
  tag?: React.ReactNode | (() => React.ReactNode);
  // Tooltip for the node label
  labelTooltip?: React.ReactNode | (() => React.ReactNode);
  // Tooltip for the tag/badge
  tagTooltip?: React.ReactNode;
  // Tooltip for the entire node - if provided, the entire row will be wrapped in a HoverCard
  nodeTooltip?: React.ReactNode;
  // Optional className override for nodeTooltip HoverCard content
  nodeTooltipClassName?: string;
  // Internal: used for testing to store original label
  _originalLabel?: string;
}

type TreeProps = React.HTMLAttributes<HTMLDivElement> & {
  data: TreeDataItem[] | TreeDataItem;
  initialSlelectedItemId?: string;
  selectedItemId?: string; // Controlled selection prop
  onSelectChange?: (item: TreeDataItem | undefined) => void;
  expandAll?: boolean;
  initialExpandedIds?: string[];
  folderIcon?: LucideIcon;
  itemIcon?: LucideIcon;
  showChildCount?: boolean;
  // Integrated search support
  search?: string;
  pathSeparator?: string; // default '.'
  highlighter?: (text: string, start: number, end: number) => React.ReactNode;
  searchOptions?: {
    startLevel?: number; // Level to start searching from (0 = root, 1 = children of root, etc.)
  };
  // Context menu support
  onNodeContextMenu?: (node: TreeDataItem, event: React.MouseEvent) => void;
  // Virtualization options
  rowHeight?: number; // Default is 32px
  overscan?: number; // Number of items to render outside viewport (default: 5)
};

export interface TreeRef {
  /**
   * Scroll to a specific node by ID
   * @param nodeId The ID of the node to scroll to
   * @param options Scroll options
   */
  scrollToNode: (nodeId: string, options?: { align?: "start" | "center" | "end" | "auto"; behavior?: "auto" | "smooth" }) => void;
}

interface FlatNode {
  node: TreeDataItem;
  depth: number;
  hasChildren: boolean;
  childCount: number;
}

// Helper function to flatten tree into visible nodes
const flattenTree = (
  items: TreeDataItem[],
  expandedIds: Set<string>,
  depth: number = 0,
  result: FlatNode[] = []
): FlatNode[] => {
  for (const item of items) {
    const hasChildren = !!(item.children && item.children.length > 0);
    const childCount = item.children?.length || 0;

    result.push({
      node: item,
      depth,
      hasChildren,
      childCount,
    });

    // If expanded and has children, recursively flatten children
    if (hasChildren && expandedIds.has(item.id)) {
      flattenTree(item.children!, expandedIds, depth + 1, result);
    }
  }

  return result;
};

// Helper function to render tag
const renderTag = (tag?: React.ReactNode | (() => React.ReactNode)): React.ReactNode => {
  if (!tag) return null;
  return typeof tag === "function" ? tag() : tag;
};

// Helper function to resolve potential function content
const resolveContent = (content?: React.ReactNode | (() => React.ReactNode)): React.ReactNode => {
  if (typeof content === "function") {
    return content();
  }
  return content;
};

// Helper function to render tooltip wrapper
const renderTooltip = (
  children: React.ReactNode,
  tooltipContent?: React.ReactNode | (() => React.ReactNode),
  options?: {
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    className?: string;
    style?: React.CSSProperties;
    onClick?: (e: React.MouseEvent) => void;
  }
): React.ReactNode => {
  if (!tooltipContent) {
    return children;
  }

  const {
    side = "right",
    align = "start",
    className = "w-auto min-w-[150px] max-w-[250px] p-2",
    onClick,
  } = options || {};

  const resolvedTooltipContent = resolveContent(tooltipContent);

  if (!resolvedTooltipContent) {
    return children;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        onMouseDown={(e) => {
          // Prevent mousedown from bubbling to prevent selection
          e.stopPropagation();
        }}
      >
        {resolvedTooltipContent}
      </HoverCardContent>
    </HoverCard>
  );
};

const Tree = React.forwardRef<TreeRef, TreeProps>(
  (
    {
      data,
      initialSlelectedItemId,
      selectedItemId: controlledSelectedItemId,
      onSelectChange,
      expandAll,
      initialExpandedIds,
      folderIcon,
      itemIcon,
      className,
      search,
      pathSeparator = ".",
      highlighter,
      searchOptions,
      onNodeContextMenu,
      rowHeight = 32,
      overscan = 5,
      showChildCount = false,
      ...props
    },
    ref
  ) => {
    // Use controlled prop if provided, otherwise use internal state
    const [internalSelectedItemId, setInternalSelectedItemId] = React.useState<string | undefined>(
      initialSlelectedItemId
    );
    const selectedItemId = controlledSelectedItemId !== undefined ? controlledSelectedItemId : internalSelectedItemId;

    // - userOverrides: Map of nodeId -> boolean, where:
    //   - true: user explicitly expanded this node
    //   - false: user explicitly collapsed this node
    //   - undefined/not present: use default state (auto-expanded from search or base state)
    const [userOverrides, setUserOverrides] = React.useState<Map<string, boolean>>(new Map());
    const parentRef = useRef<HTMLDivElement>(null);
    // Track the index of the node that was clicked (for accurate scrolling to the clicked instance)
    const clickedNodeIndexRef = useRef<number | null>(null);

    const handleSelectChange = React.useCallback(
      (item: TreeDataItem | undefined) => {
        // Only update internal state if not controlled
        if (controlledSelectedItemId === undefined) {
          setInternalSelectedItemId(item?.id);
        }
        if (onSelectChange) {
          onSelectChange(item);
        }
      },
      [onSelectChange, controlledSelectedItemId]
    );

    // Find a tree item by ID
    const findItemById = React.useCallback((items: TreeDataItem[] | TreeDataItem, id: string): TreeDataItem | null => {
      const itemsArray = items instanceof Array ? items : [items];
      for (const item of itemsArray) {
        if (item.id === id) {
          return item;
        }
        if (item.children) {
          const found = findItemById(item.children, id);
          if (found) return found;
        }
      }
      return null;
    }, []);

    const baseExpandedItemIds = React.useMemo(() => {
      // If initialExpandedIds is provided, use that
      if (initialExpandedIds) {
        return initialExpandedIds;
      }

      // If expandAll is true, collect all node IDs with children
      if (expandAll) {
        const ids: string[] = [];

        function collectAllIds(items: TreeDataItem[] | TreeDataItem) {
          if (items instanceof Array) {
            for (const item of items) {
              if (item.children && item.children.length > 0) {
                ids.push(item.id);
                collectAllIds(item.children);
              }
            }
          } else if (items.children && items.children.length > 0) {
            ids.push(items.id);
            collectAllIds(items.children);
          }
        }

        collectAllIds(data);
        return ids;
      }

      // Otherwise, only expand nodes to reach the initialSelectedItemId
      if (!initialSlelectedItemId) {
        return [] as string[];
      }

      const ids: string[] = [];

      function walkTreeItems(items: TreeDataItem[] | TreeDataItem, targetId: string) {
        if (items instanceof Array) {
          for (let i = 0; i < items.length; i++) {
            ids.push(items[i]!.id);
            if (walkTreeItems(items[i]!, targetId)) {
              return true;
            }
            ids.pop();
          }
        } else if (items.id === targetId) {
          return true;
        } else if (items.children) {
          return walkTreeItems(items.children, targetId);
        }
      }

      walkTreeItems(data, initialSlelectedItemId);
      return ids;
    }, [data, initialSlelectedItemId, expandAll, initialExpandedIds]);

    // Reset user overrides when search is cleared (clean slate for new search)
    React.useEffect(() => {
      if (!search || search.length === 0) {
        setUserOverrides(new Map());
      }
    }, [search]);

    // When search is provided, filter data and compute expanded ids from _expanded flags
    const { dataToRender, expandedItemIds, searchAutoExpandedIds } = React.useMemo(() => {
      const asArray = (items: TreeDataItem[] | TreeDataItem): TreeDataItem[] =>
        items instanceof Array ? items : [items];
      if (search && search.length > 0) {
        const filtered = searchTree(
          asArray(data),
          // Search query case-insensitive
          search.toLowerCase(),
          // Search Context
          {
            pathSeparator,
            highlighter,
            startLevel: searchOptions?.startLevel,
          }
        );
        // Collect nodes auto-expanded by search (from _expanded flag)
        const autoExpandedIds: string[] = [];
        // Also track which nodes exist in the filtered tree to preserve their original expanded state
        const filteredNodeIds = new Set<string>();
        const traverse = (nodes?: TreeDataItem[]) => {
          if (!nodes) return;
          for (const n of nodes) {
            filteredNodeIds.add(n.id);
            if (n._expanded) {
              autoExpandedIds.push(n.id);
            }
            if (n.children) traverse(n.children);
          }
        };
        traverse(filtered);

        // Preserve original expanded state for nodes that are in filtered tree but don't have _expanded flag
        // This is important for nodes before startLevel that are passed through
        const originallyExpandedIds = new Set(baseExpandedItemIds);
        originallyExpandedIds.forEach((id) => {
          // If node is in filtered tree and was originally expanded, but search didn't set _expanded,
          // preserve its expanded state
          if (filteredNodeIds.has(id) && !autoExpandedIds.includes(id)) {
            autoExpandedIds.push(id);
          }
        });

        // Compute default expanded state (from search auto-expand and base state)
        const defaultExpandedIds = new Set(autoExpandedIds);

        // Apply user overrides: if user has explicitly set a state, use that; otherwise use default
        const finalExpandedIds = new Set<string>();
        const allNodeIds = new Set([...defaultExpandedIds, ...Array.from(userOverrides.keys())]);
        for (const id of allNodeIds) {
          const userOverride = userOverrides.get(id);
          if (userOverride !== undefined) {
            // User has explicitly set a state
            if (userOverride) {
              finalExpandedIds.add(id);
            }
            // If false, don't add (collapsed)
          } else {
            // No user override, use default state
            if (defaultExpandedIds.has(id)) {
              finalExpandedIds.add(id);
            }
          }
        }

        return {
          dataToRender: filtered,
          expandedItemIds: Array.from(finalExpandedIds),
          searchAutoExpandedIds: autoExpandedIds,
        };
      }
      // No search: use base expanded IDs, apply user overrides
      const defaultExpandedIds = new Set(baseExpandedItemIds);
      const finalExpandedIds = new Set<string>();
      const allNodeIds = new Set([...defaultExpandedIds, ...Array.from(userOverrides.keys())]);
      for (const id of allNodeIds) {
        const userOverride = userOverrides.get(id);
        if (userOverride !== undefined) {
          if (userOverride) {
            finalExpandedIds.add(id);
          }
        } else {
          if (defaultExpandedIds.has(id)) {
            finalExpandedIds.add(id);
          }
        }
      }
      return { dataToRender: asArray(data), expandedItemIds: Array.from(finalExpandedIds), searchAutoExpandedIds: [] };
    }, [data, search, pathSeparator, highlighter, searchOptions, baseExpandedItemIds, userOverrides]);

    // Clear user overrides for nodes that are now auto-expanded by the new search
    // This allows the search to expand nodes even if the user had previously collapsed them
    // Use a ref to store the IDs and a stable string key to avoid infinite loops
    const searchAutoExpandedIdsRef = React.useRef<string[]>([]);
    const searchAutoExpandedIdsKey = React.useMemo(() => {
      const sorted = [...searchAutoExpandedIds].sort();
      const key = sorted.length > 0 ? sorted.join(",") : "";
      searchAutoExpandedIdsRef.current = searchAutoExpandedIds;
      return key;
    }, [searchAutoExpandedIds]);
    React.useEffect(() => {
      if (search && search.length > 0 && searchAutoExpandedIdsRef.current.length > 0) {
        setUserOverrides((prev) => {
          const next = new Map(prev);
          let changed = false;
          for (const id of searchAutoExpandedIdsRef.current) {
            // If the node is now auto-expanded by search, clear any user override
            // This allows the search to take precedence
            if (next.has(id)) {
              next.delete(id);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    }, [search, searchAutoExpandedIdsKey]);

    // Create expanded set for efficient lookup
    const expandedSet = useMemo(() => new Set(expandedItemIds), [expandedItemIds]);

    // Flatten tree based on expanded state
    const flatNodes = useMemo(() => {
      return flattenTree(dataToRender, expandedSet);
    }, [dataToRender, expandedSet]);

    // Setup virtualizer
    const rowVirtualizer = useVirtualizer({
      count: flatNodes.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => rowHeight,
      overscan,
    });

    // Expose imperative handle for scrolling
    React.useImperativeHandle(ref, () => ({
      scrollToNode: (nodeId: string, options?: { align?: "start" | "center" | "end" | "auto"; behavior?: "auto" | "smooth" }) => {
        // Find the item in flatNodes
        const selectedIndex = flatNodes.findIndex((fn) => fn.node.id === nodeId);

        if (selectedIndex !== -1) {
          // Check if the item is already visible in the viewport
          const virtualItems = rowVirtualizer.getVirtualItems();
          const isAlreadyVisible = virtualItems.some((item) => item.index === selectedIndex);

          // Only scroll if the item is not already visible
          if (!isAlreadyVisible) {
            requestAnimationFrame(() => {
              rowVirtualizer.scrollToIndex(selectedIndex, {
                align: options?.align || "start",
                behavior: options?.behavior || "smooth",
              });
            });
          }
        } else {
          // Selected item is not in flatNodes - likely because parent nodes are collapsed
          // Find the item in the full tree and expand parent nodes to make it visible
          const findAndExpandParents = (
            items: TreeDataItem[] | TreeDataItem,
            targetId: string,
            path: string[] = []
          ): boolean => {
            const itemsArray = items instanceof Array ? items : [items];
            for (const item of itemsArray) {
              if (item.id === targetId) {
                // Found the target - expand all parent nodes in the path
                const parentsToExpand: string[] = [];
                path.forEach((parentId) => {
                  if (!expandedSet.has(parentId) && userOverrides.get(parentId) !== false) {
                    parentsToExpand.push(parentId);
                  }
                });

                // Expand all parents at once
                if (parentsToExpand.length > 0) {
                  setUserOverrides((prev) => {
                    const next = new Map(prev);
                    parentsToExpand.forEach((id) => next.set(id, true));
                    return next;
                  });

                  // After expanding, scroll to the node
                  // Use a timeout to allow the tree to re-render with expanded nodes
                  setTimeout(() => {
                    const newIndex = flatNodes.findIndex((fn) => fn.node.id === targetId);
                    if (newIndex !== -1) {
                      rowVirtualizer.scrollToIndex(newIndex, {
                        align: options?.align || "start",
                        behavior: options?.behavior || "smooth",
                      });
                    }
                  }, 100);
                }
                return true;
              }
              if (item.children) {
                if (findAndExpandParents(item.children, targetId, [...path, item.id])) {
                  return true;
                }
              }
            }
            return false;
          };

          // Try to find and expand parents
          findAndExpandParents(data, nodeId);
        }
      },
    }), [flatNodes, rowVirtualizer, data, expandedSet, userOverrides]);

    const toggleExpand = useCallback(
      (nodeId: string) => {
        const isCurrentlyExpanded = expandedSet.has(nodeId);

        setUserOverrides((prev) => {
          const next = new Map(prev);
          if (isCurrentlyExpanded) {
            // User is collapsing: set override to false
            next.set(nodeId, false);
          } else {
            // User is expanding: set override to true
            next.set(nodeId, true);
          }
          return next;
        });
      },
      [expandedSet]
    );

    // Handle keyboard navigation with virtualized list
    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent) => {
        if (!selectedItemId) return;

        const currentIndex = flatNodes.findIndex((fn) => fn.node.id === selectedItemId);
        if (currentIndex === -1) return;

        const currentFlatNode = flatNodes[currentIndex];

        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            if (currentIndex < flatNodes.length - 1) {
              const nextNode = flatNodes[currentIndex + 1].node;
              handleSelectChange(nextNode);
              rowVirtualizer.scrollToIndex(currentIndex + 1, { align: "auto" });
            }
            break;

          case "ArrowUp":
            event.preventDefault();
            if (currentIndex > 0) {
              const prevNode = flatNodes[currentIndex - 1].node;
              handleSelectChange(prevNode);
              rowVirtualizer.scrollToIndex(currentIndex - 1, { align: "auto" });
            }
            break;

          case "ArrowRight":
            event.preventDefault();
            if (currentFlatNode.hasChildren) {
              if (!expandedSet.has(selectedItemId)) {
                toggleExpand(selectedItemId);
              } else if (currentIndex < flatNodes.length - 1) {
                // Already expanded, move to first child
                const nextNode = flatNodes[currentIndex + 1].node;
                handleSelectChange(nextNode);
                rowVirtualizer.scrollToIndex(currentIndex + 1, { align: "auto" });
              }
            }
            break;

          case "ArrowLeft":
            event.preventDefault();
            if (currentFlatNode.hasChildren && expandedSet.has(selectedItemId)) {
              // Collapse if expanded
              toggleExpand(selectedItemId);
            } else if (currentFlatNode.depth > 0) {
              // Move to parent
              for (let i = currentIndex - 1; i >= 0; i--) {
                if (flatNodes[i].depth < currentFlatNode.depth) {
                  handleSelectChange(flatNodes[i].node);
                  rowVirtualizer.scrollToIndex(i, { align: "auto" });
                  break;
                }
              }
            }
            break;

          case "Enter":
          case " ":
            event.preventDefault();
            if (currentFlatNode.hasChildren) {
              toggleExpand(selectedItemId);
            }
            break;
        }
      },
      [selectedItemId, flatNodes, expandedSet, handleSelectChange, toggleExpand, rowVirtualizer]
    );

    return (
      <div
        ref={parentRef}
        className={cn("relative overflow-auto px-1", className)}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ outline: "none" }}
        {...props}
      >
        {/* Total size container */}
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {/* Virtual items */}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const flatNode = flatNodes[virtualRow.index];
            const { node, depth, hasChildren, childCount } = flatNode;
            const isExpanded = expandedSet.has(node.id);
            const isSelected = selectedItemId === node.id;
            const Icon = node.icon || (hasChildren ? folderIcon : itemIcon);

            const rowContent = (
              <div
                data-index={virtualRow.index}
                className={cn(
                  "relative flex items-center py-1 cursor-pointer transition-colors",
                  !isSelected && "hover:bg-accent hover:text-accent-foreground",
                  isSelected &&
                  "bg-accent text-accent-foreground border-l-2 border-l-accent-foreground/50 dark:border-0"
                )}
                style={{
                  position: "absolute",
                  top: 0,
                  left: "-0.5rem",
                  right: "-0.5rem",
                  height: `${rowHeight}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingLeft: `${depth * 20 + 8 + 8}px`,
                  paddingRight: "0.5rem",
                  minHeight: `${rowHeight}px`,
                  zIndex: 1,
                }}
                onClick={() => {
                  // Track the index of the clicked node for accurate scrolling
                  clickedNodeIndexRef.current = virtualRow.index;
                  handleSelectChange(node);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onNodeContextMenu) {
                    onNodeContextMenu(node, e);
                  }
                }}
              >
                {/* Expand/collapse button */}
                {hasChildren ? (
                  <button
                    className="flex items-center justify-center w-4 h-4 mr-1 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(node.id);
                    }}
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-200 text-accent-foreground/50",
                        isExpanded && "rotate-90"
                      )}
                    />
                  </button>
                ) : (
                  <span className="w-4 h-4 mr-1 shrink-0" />
                )}

                {/* Icon */}
                {Icon && <Icon className="h-4 w-4 shrink-0 mr-2 text-accent-foreground/50" aria-hidden="true" />}

                {/* Text, tag and child count */}
                <span className="flex items-center justify-between flex-grow min-w-0">
                  {renderTooltip(
                    <span className="text-sm truncate">{node.labelContent}</span>,
                    node.labelTooltip,
                    {
                      className: node.nodeTooltipClassName,
                    }
                  )}
                  <span className="flex items-center gap-1 shrink-0">
                    {/* Tag */}
                    {renderTooltip(
                      <span className="flex items-center gap-1 shrink-0">{renderTag(node.tag)}</span>,
                      node.tagTooltip
                    )}
                    {showChildCount && hasChildren && (
                      <Badge variant="secondary" className="py-0 ml-1 rounded-sm px-1 font-normal whitespace-nowrap">
                        {childCount}
                      </Badge>
                    )}
                  </span>
                </span>
              </div>
            );

            // Wrap in HoverCard if nodeTooltip is provided
            if (node.nodeTooltip) {
              return (
                <React.Fragment key={node.id}>
                  {renderTooltip(rowContent, node.nodeTooltip, {
                    className: node.nodeTooltipClassName,
                  })}
                </React.Fragment>
              );
            }

            return <React.Fragment key={node.id}>{rowContent}</React.Fragment>;
          })}
        </div>
      </div>
    );
  }
);
Tree.displayName = "Tree";

export { Tree, type TreeDataItem };

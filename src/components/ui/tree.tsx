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
  text: string;

  // If it's not set, use name
  displayText?: React.ReactNode;
  search: string;
  icon?: LucideIcon;
  children?: TreeDataItem[];

  // Attached data
  data?: any;
  // Node type: 'folder' represents a non-leaf node, 'leaf' represents a terminal node
  type?: "folder" | "leaf";
  // Used by searchTree to suggest expansion
  _expanded?: boolean;
  // Custom tag/badge to render alongside the node text
  tag?: React.ReactNode | (() => React.ReactNode);
  // Hover card content - if provided, the entire row will be wrapped in a HoverCard
  hoverCardContent?: React.ReactNode;
}

type TreeProps = React.HTMLAttributes<HTMLDivElement> & {
  data: TreeDataItem[] | TreeDataItem;
  initialSlelectedItemId?: string;
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
  depth: number = 0
): FlatNode[] => {
  const result: FlatNode[] = [];

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
      result.push(...flattenTree(item.children!, expandedIds, depth + 1));
    }
  }

  return result;
};

// Helper function to render tag
const renderTag = (tag?: React.ReactNode | (() => React.ReactNode)): React.ReactNode => {
  if (!tag) return null;
  return typeof tag === "function" ? tag() : tag;
};

const Tree = React.forwardRef<HTMLDivElement, TreeProps>(
  (
    {
      data,
      initialSlelectedItemId,
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
    _ref
  ) => {
    const [selectedItemId, setSelectedItemId] = React.useState<string | undefined>(initialSlelectedItemId);
    const [keyboardExpandedIds, setKeyboardExpandedIds] = React.useState<string[]>([]);
    const [userExpandedIds, setUserExpandedIds] = React.useState<Set<string>>(new Set());
    // Track nodes that were auto-expanded by search but explicitly collapsed by user
    const [searchCollapsedIds, setSearchCollapsedIds] = React.useState<Set<string>>(new Set());
    const parentRef = useRef<HTMLDivElement>(null);

    const handleSelectChange = React.useCallback(
      (item: TreeDataItem | undefined) => {
        setSelectedItemId(item?.id);
        if (onSelectChange) {
          onSelectChange(item);
        }
      },
      [onSelectChange]
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

    // Reset search-collapsed IDs when search changes or is cleared
    React.useEffect(() => {
      if (!search || search.length === 0) {
        setSearchCollapsedIds(new Set());
      }
    }, [search]);

    // When search is provided, filter data and compute expanded ids from _expanded flags
    const { dataToRender, expandedItemIds } = React.useMemo(() => {
      const asArray = (items: TreeDataItem[] | TreeDataItem): TreeDataItem[] =>
        items instanceof Array ? items : [items];
      if (search && search.length > 0) {
        const filtered = searchTree(asArray(data), search, { 
          pathSeparator, 
          highlighter,
          startLevel: searchOptions?.startLevel,
        });
        const expandedIds: string[] = [];
        const traverse = (nodes?: TreeDataItem[]) => {
          if (!nodes) return;
          for (const n of nodes) {
            // Only include nodes with _expanded flag that haven't been explicitly collapsed by user
            if (n._expanded && !searchCollapsedIds.has(n.id)) {
              expandedIds.push(n.id);
            }
            if (n.children) traverse(n.children);
          }
        };
        traverse(filtered);
        // Merge with keyboard-controlled and user-controlled expanded IDs
        const mergedIds = [...new Set([...expandedIds, ...keyboardExpandedIds, ...Array.from(userExpandedIds)])];
        return { dataToRender: filtered, expandedItemIds: mergedIds };
      }
      // Merge base expanded IDs with keyboard-controlled and user-controlled expanded IDs
      const mergedIds = [...new Set([...baseExpandedItemIds, ...keyboardExpandedIds, ...Array.from(userExpandedIds)])];
      return { dataToRender: asArray(data), expandedItemIds: mergedIds };
    }, [data, search, pathSeparator, highlighter, searchOptions, baseExpandedItemIds, keyboardExpandedIds, userExpandedIds, searchCollapsedIds]);

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

    const toggleExpand = useCallback((nodeId: string) => {
      const isSearchMode = search && search.length > 0;
      const isCurrentlyExpanded = expandedSet.has(nodeId);
      const isInUserExpandedIds = userExpandedIds.has(nodeId);
      const isInSearchCollapsedIds = searchCollapsedIds.has(nodeId);
      
      if (isSearchMode) {
        // In search mode, handle auto-expanded nodes specially
        if (isCurrentlyExpanded) {
          // Node is currently expanded - user is collapsing it
          if (!isInUserExpandedIds) {
            // This was auto-expanded by search - just mark as collapsed
            // Don't add to userExpandedIds, only manage searchCollapsedIds
            setSearchCollapsedIds((prev) => {
              const next = new Set(prev);
              next.add(nodeId);
              return next;
            });
          } else {
            // This was manually expanded - remove from userExpandedIds
            setUserExpandedIds((prev) => {
              const next = new Set(prev);
              next.delete(nodeId);
              return next;
            });
          }
        } else {
          // Node is currently collapsed - user is expanding it
          if (isInSearchCollapsedIds) {
            // This was auto-expanded but user collapsed it - now user wants to expand it manually
            // Remove from searchCollapsedIds and add to userExpandedIds
            setSearchCollapsedIds((prev) => {
              const next = new Set(prev);
              next.delete(nodeId);
              return next;
            });
            setUserExpandedIds((prev) => {
              const next = new Set(prev);
              next.add(nodeId);
              return next;
            });
          } else {
            // Normal case - just toggle userExpandedIds
            setUserExpandedIds((prev) => {
              const next = new Set(prev);
              if (next.has(nodeId)) {
                next.delete(nodeId);
              } else {
                next.add(nodeId);
              }
              return next;
            });
          }
        }
      } else {
        // Not in search mode - normal toggle behavior
        setUserExpandedIds((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          return next;
        });
      }
    }, [search, expandedSet, userExpandedIds, searchCollapsedIds]);

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
                setKeyboardExpandedIds((prev) => {
                  if (!prev.includes(selectedItemId)) {
                    return [...prev, selectedItemId];
                  }
                  return prev;
                });
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
              setKeyboardExpandedIds((prev) => prev.filter((id) => id !== selectedItemId));
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
      [
        selectedItemId,
        flatNodes,
        expandedSet,
        handleSelectChange,
        toggleExpand,
        rowVirtualizer,
        setKeyboardExpandedIds,
      ]
    );

    return (
      <div
        ref={parentRef}
        className={cn("relative overflow-auto px-2", className)}
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
                  "relative flex items-center py-1 cursor-pointer transition-colors rounded-sm",
                  !isSelected && "hover:bg-accent hover:text-accent-foreground",
                  isSelected && "bg-accent text-accent-foreground border-l-2 border-l-accent-foreground/50 dark:border-0"
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
                }}
                onClick={() => handleSelectChange(node)}
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

                  {/* Text and child count */}
                  <span className="flex items-center justify-between flex-grow min-w-0">
                    <span className="text-sm truncate">
                      {node.displayText || node.text}
                      {showChildCount && hasChildren && (
                        <Badge variant="secondary" className="ml-2 rounded-sm px-1 font-normal whitespace-nowrap">
                          {childCount}
                        </Badge>
                      )}
                    </span>
                    {/* Tag */}
                    <span className="flex items-center gap-1 ml-2 shrink-0">{renderTag(node.tag)}</span>
                  </span>
              </div>
            );

            // Wrap in HoverCard if hoverCardContent is provided
            if (node.hoverCardContent) {
              return (
                <HoverCard key={node.id} openDelay={200} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    {rowContent}
                  </HoverCardTrigger>
                  <HoverCardContent 
                    side="bottom" 
                    align="center"
                    className="w-auto min-w-[200px] max-w-md z-[100] p-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {node.hoverCardContent}
                  </HoverCardContent>
                </HoverCard>
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

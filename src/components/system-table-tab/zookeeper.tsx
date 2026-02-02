"use client";

import { useConnection } from "@/components/connection/connection-context";
import type { JSONFormatResponse } from "@/lib/connection/connection";
import { Formatter } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, FileIcon, FolderIcon, Loader2, RotateCw } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface ZookeeperProps {
  database: string;
  table: string;
}

interface ZookeeperNode {
  name: string;
  path: string; // Parent path
  fullPath: string; // Constructed full path
  value: string;
  ctime: string;
  mtime: string;
  dataLength: string;
  numChildren: number | undefined;

  // Tree state
  children?: ZookeeperNode[];
  isLoaded?: boolean;
}

// Helper to flatten tree for virtualization
interface FlatNode {
  node: ZookeeperNode;
  depth: number;
  isExpanded: boolean;
}

function flattenTree(
  nodes: ZookeeperNode[],
  expandedPaths: Set<string>,
  depth: number = 0,
  result: FlatNode[] = []
): FlatNode[] {
  for (const node of nodes) {
    const isExpanded = expandedPaths.has(node.fullPath);
    result.push({ node, depth, isExpanded });
    if (isExpanded && node.children) {
      flattenTree(node.children, expandedPaths, depth + 1, result);
    }
  }
  return result;
}

export const Zookeeper = React.memo(({ database, table }: ZookeeperProps) => {
  const { connection } = useConnection();
  // Root node is hardcoded as per requirement
  const [root, setRoot] = useState<ZookeeperNode>({
    name: "/",
    path: "",
    fullPath: "/",
    value: "",
    ctime: "",
    mtime: "",
    dataLength: "",
    numChildren: undefined,
    isLoaded: false,
    children: [],
  });

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  // Function to update a node's children in the tree
  const updateNodeChildren = useCallback((targetPath: string, children: ZookeeperNode[]) => {
    setRoot((prevRoot) => {
      // If target is root
      if (targetPath === "/") {
        return {
          ...prevRoot,
          children,
          isLoaded: true,
          numChildren: children.length,
        };
      }

      // Recursive update
      const updateRecursive = (node: ZookeeperNode): ZookeeperNode => {
        if (node.fullPath === targetPath) {
          return { ...node, children, isLoaded: true };
        }
        if (node.children) {
          return {
            ...node,
            children: node.children.map(updateRecursive),
          };
        }
        return node;
      };

      return updateRecursive(prevRoot);
    });
  }, []);

  const fetchChildren = useCallback(
    async (nodePath: string) => {
      if (!connection) return;

      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.add(nodePath);
        return next;
      });

      try {
        const response = await connection.query(
          `SELECT 
  path, 
  decodeURLComponent(name) as name, 
  decodeURLComponent(value) as value, 
  numChildren, 
  dataLength, 
  ctime, 
  mtime 
FROM system.zookeeper
WHERE path = '${nodePath}'`,
          { default_format: "JSON" }
        ).response;
        const jsonResponse = await response.data.json<JSONFormatResponse>();

        const dataRows = jsonResponse.data as any[];
        const newChildren: ZookeeperNode[] = dataRows.map((row) => {
          const name = row.name;

          return {
            name: row.name,
            path: row.path,
            fullPath: nodePath === "/" ? `/${name}` : `${nodePath}/${name}`,
            value: row.value,
            ctime: row.ctime,
            mtime: row.mtime,
            dataLength: row.dataLength,
            numChildren: row.numChildren,
            isLoaded: false,
          };
        });

        // Sort by name
        newChildren.sort((a, b) => a.name.localeCompare(b.name));

        updateNodeChildren(nodePath, newChildren);
      } catch (e) {
        console.error("Failed to fetch zookeeper nodes", e);
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(nodePath);
          return next;
        });
      }
    },
    [connection, updateNodeChildren]
  );

  // Initial load for root
  useEffect(() => {
    // Check if root is already loaded or loading
    if (!root.isLoaded && !loadingPaths.has("/")) {
      fetchChildren("/");
      // Expand root by default
      setExpandedPaths(new Set(["/"]));
    }
  }, [connection]); // Run once when connection is available (and root is not loaded)

  const toggleExpand = useCallback(
    (node: ZookeeperNode) => {
      const isExpanded = expandedPaths.has(node.fullPath);
      if (isExpanded) {
        // Collapse
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(node.fullPath);
          return next;
        });
      } else {
        // Expand
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.add(node.fullPath);
          return next;
        });
        // Load children if not loaded
        if (!node.isLoaded && !loadingPaths.has(node.fullPath)) {
          fetchChildren(node.fullPath);
        }
      }
    },
    [expandedPaths, loadingPaths, fetchChildren, root]
  );

  const parentRef = useRef<HTMLDivElement>(null);

  const flatData = useMemo(() => {
    return flattenTree([root], expandedPaths);
  }, [root, expandedPaths]);

  const rowVirtualizer = useVirtualizer({
    count: flatData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // Row height
    overscan: 10,
  });

  const [pathColumnWidth, setPathColumnWidth] = useState(300);
  const isResizingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;
    // Calculate new width relative to the container usually, but simpler to use movementX or absolute pageX if we knew container offset.
    // However, since we don't have container ref easily accessible here, let's try a simpler approach or rely on movementX.
    // movementX can be unreliable. Let's assume the previous width + movementX.
    setPathColumnWidth((prev) => Math.max(100, Math.min(800, prev + e.movementX)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "";
  }, [handleMouseMove]);

  const handleRefresh = useCallback(() => {
    setRoot({
      name: "/",
      path: "",
      fullPath: "/",
      value: "",
      ctime: "",
      mtime: "",
      dataLength: "",
      numChildren: undefined,
      isLoaded: false,
      children: [],
    });
    setExpandedPaths(new Set(["/"]));
    fetchChildren("/");
  }, [fetchChildren]);

  const truncatedTextFormatter = Formatter.getInstance().getFormatter("truncatedText");

  return (
    <div className="h-full overflow-hidden flex flex-col text-sm">
      {/* Header */}
      <div
        className="grid bg-muted/50 font-medium border-b shrink-0"
        style={{ gridTemplateColumns: `${pathColumnWidth}px 150px 150px 100px 1fr 40px` }}
      >
        <div className="px-4 py-1.5 border-r truncate flex items-center justify-between relative group">
          <span>Path</span>
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-blue-400/50 z-10"
            onMouseDown={handleMouseDown}
          />
        </div>
        <div className="px-4 py-1.5 border-r truncate">Created</div>
        <div className="px-4 py-1.5 border-r truncate">Modified</div>
        <div className="px-4 py-1.5 border-r truncate">Size</div>
        <div className="px-4 py-1.5 border-r truncate">Value</div>
        <div className="px-2 py-1.5 flex items-center justify-center">
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded hover:bg-muted"
            title="Refresh"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div ref={parentRef} className="flex-1 overflow-auto relative">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const { node, depth, isExpanded } = flatData[virtualRow.index];
            const isLoading = loadingPaths.has(node.fullPath);
            const canExpand = node.numChildren === undefined || node.numChildren > 0;

            return (
              <div
                key={node.fullPath}
                className={cn(
                  "absolute top-0 left-0 w-full grid border-b hover:bg-muted/50 transition-colors items-center",
                  isExpanded ? "bg-muted/20" : ""
                )}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `${pathColumnWidth}px 150px 150px 100px 1fr 40px`,
                }}
              >
                {/* Path Column (Tree) */}
                <div className="px-2 py-1 border-r h-full flex items-center overflow-hidden">
                  <div
                    style={{ paddingLeft: `${depth * 16}px` }}
                    className="flex items-center w-full min-w-0"
                  >
                    {canExpand ? (
                      <button
                        onClick={() => toggleExpand(node)}
                        className="p-1 hover:bg-accent rounded-sm mr-1 shrink-0"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ChevronRight
                            className={cn(
                              "h-3 w-3 transition-transform",
                              isExpanded && "rotate-90"
                            )}
                          />
                        )}
                      </button>
                    ) : (
                      <span className="w-5 mr-1 shrink-0"></span>
                    )}
                    <div className="flex items-center truncate min-w-0" title={node.name}>
                      {node.numChildren === undefined || node.numChildren > 0 ? (
                        <FolderIcon className="h-3 w-3 mr-2 shrink-0" />
                      ) : (
                        <FileIcon className="h-3 w-3 mr-2 shrink-0" />
                      )}
                      <span className="truncate">
                        {node.name}
                        {node.numChildren != null &&
                          node.numChildren > 0 &&
                          ` (${node.numChildren})`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Created */}
                <div className="px-4 py-1 border-r h-full flex items-center overflow-hidden text-xs truncate">
                  {node.ctime}
                </div>

                {/* Modified */}
                <div className="px-4 py-1 border-r h-full flex items-center overflow-hidden text-xs truncate">
                  {node.mtime}
                </div>

                {/* Size */}
                <div className="px-4 py-1 border-r h-full flex items-center overflow-hidden">
                  {node.dataLength && node.dataLength !== "0" && Number(node.dataLength) !== 0
                    ? node.dataLength
                    : ""}
                </div>

                {/* Value */}
                <div className="px-4 py-1 h-full flex items-center overflow-hidden text-xs min-w-0">
                  {truncatedTextFormatter(node.value) as React.ReactNode}
                </div>
                <div />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

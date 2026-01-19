import { useConnection } from "@/components/connection/connection-context";
import FloatingProgressBar from "@/components/shared/floating-progress-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tree, type TreeDataItem, type TreeRef } from "@/components/ui/tree";
import type { DatabaseInfo, TableInfo } from "@/lib/connection/connection";
import { cn } from "@/lib/utils";
import { AlertCircle, Database, RotateCw, Search, Table as TableIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TabManager, type TabInfo } from "../tab-manager";
import { showDropTableConfirmationDialog } from "./drop-table-confirmation-dialog";
import { buildSchemaTree } from "./schema-tree-builder";
import {
  SchemaTreeLoader,
  type DatabaseNodeData,
  type HostNodeData,
  type SchemaLoadResult,
  type SchemaNodeData,
  type TableNodeData,
} from "./schema-tree-loader";

/**
 * Extract table names and database names from schema load result
 */
function extractTableNames(result: SchemaLoadResult): {
  tableNames: Map<string, TableInfo>;
  databaseNames: Map<string, DatabaseInfo>;
} {
  const tableNames = new Map<string, TableInfo>();
  const databaseNames = new Map<string, DatabaseInfo>();

  for (const row of result.rows) {
    // Extract database names with comments
    if (row.database) {
      // Only set if not already set (to avoid overwriting with null comment from table/column rows)
      if (!databaseNames.has(row.database)) {
        databaseNames.set(row.database, {
          name: row.database,
          comment: row.dbComment || null,
        });
      }
    }

    // Extract table names
    if (row.database && row.table) {
      const qualifiedName = `${row.database}.${row.table}`;
      // Only set if not already set (to avoid overwriting with null comment from column rows)
      if (!tableNames.has(qualifiedName)) {
        tableNames.set(qualifiedName, {
          database: row.database,
          table: row.table,
          comment: row.tableComment || null,
          engine: row.tableEngine || null,
        });
      }
    }
  }

  return { tableNames, databaseNames };
}

export interface SchemaTreeViewProps {
  initialSchemaData?: SchemaLoadResult | null;
}

export function SchemaTreeView({ initialSchemaData }: SchemaTreeViewProps) {
  const { connection, updateConnectionMetadata } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [treeData, setTreeData] = useState<TreeDataItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loaderRef = useRef(new SchemaTreeLoader());
  const treeRef = useRef<TreeRef>(null);

  // Track the last active tab info to sync when search is cleared
  const lastActiveTabInfoRef = useRef<TabInfo | null>(null);
  // Track if we were in search mode to detect when search is cleared
  const wasInSearchModeRef = useRef(false);
  // Ref to store the latest handleHostChange to avoid circular dependency
  const handleHostChangeRef = useRef<((hostName: string) => void) | undefined>(undefined);

  // Build tree from schema data
  const buildTree = useCallback(
    (schemaData: SchemaLoadResult) => {
      if (!connection) return [];

      const hostNode = buildSchemaTree(connection, schemaData, handleHostChangeRef.current);
      return [hostNode];
    },
    [connection]
  );

  // Shared load data function
  const loadDatabases = useCallback(() => {
    if (!connection) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await loaderRef.current.load(connection);
        const tree = buildTree(result);
        setTreeData(tree);
        setError(null);

        // Extract and update table names and database names in connection metadata
        const { tableNames, databaseNames } = extractTableNames(result);
        updateConnectionMetadata({ tableNames, databaseNames });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [connection, buildTree, updateConnectionMetadata]);

  // Handle host change from the host selector
  const handleHostChange = useCallback(
    (hostName: string) => {
      if (!connection) return;

      updateConnectionMetadata({ remoteHostName: hostName });

      // Refresh the tree to load data from the new host
      loadDatabases();
    },
    [connection, updateConnectionMetadata, loadDatabases]
  );

  // Update the ref whenever handleHostChange changes
  useEffect(() => {
    handleHostChangeRef.current = handleHostChange;
  }, [handleHostChange]);

  // Update tree when initial schema data changes
  useEffect(() => {
    if (initialSchemaData && connection) {
      const tree = buildTree(initialSchemaData);
      setTreeData(tree);
    }
  }, [initialSchemaData, connection, buildTree]);

  // Helper function to sync tree selection to a tab info
  const scrollToNode = useCallback((tabInfo: TabInfo | null) => {
    if (!tabInfo) {
      return;
    }

    // Calculate the target node ID based on tab type
    let targetNodeId: string | undefined;
    if (tabInfo.type === "database") {
      targetNodeId = `db:${tabInfo.database}`;
    } else if (tabInfo.type === "table") {
      targetNodeId = `table:${tabInfo.database}.${tabInfo.table}`;
    } else if (tabInfo.type === "node") {
      targetNodeId = "host";
    } else {
      // For other tab types (query, dependency, query-log), clear selection
      targetNodeId = undefined;
    }

    // Only update if the node ID has changed
    setSelectedNodeId((currentNodeId) => {
      if (currentNodeId === targetNodeId) {
        return currentNodeId; // No change needed
      }

      // Scroll to the new node when tab changes
      if (targetNodeId && treeRef.current) {
        // Use setTimeout to ensure the tree has updated with the new selection
        setTimeout(() => {
          treeRef.current?.scrollToNode(targetNodeId);
        }, 0);
      }

      return targetNodeId;
    });
  }, []);

  // Listen to active tab changes and sync tree selection (only when not in search mode)
  useEffect(() => {
    const onActiveTabChange = (event: CustomEvent<{ tabId: string; tabInfo: TabInfo | null }>) => {
      const { tabInfo } = event.detail;
      const isSearchMode = search.length > 0;

      // Case 1: Tab is closed (tabInfo is null) - do nothing
      if (tabInfo === null) {
        lastActiveTabInfoRef.current = null;
        return;
      }

      // Always track the last active tab info
      lastActiveTabInfoRef.current = tabInfo;

      // Case 2: Only sync to active tab when not in search mode
      if (!isSearchMode) {
        scrollToNode(tabInfo);
      }
    };

    const unsubscribe = TabManager.onActiveTabChange(onActiveTabChange);
    return unsubscribe;
  }, [search, scrollToNode]);

  // Sync to active tab when search is cleared (exiting search mode)
  useEffect(() => {
    // Track when we enter search mode
    if (search.length > 0) {
      wasInSearchModeRef.current = true;
      return;
    }

    // When search is cleared (search.length === 0) and we were previously in search mode,
    // sync to the last active tab and scroll to it
    if (wasInSearchModeRef.current && lastActiveTabInfoRef.current) {
      scrollToNode(lastActiveTabInfoRef.current);
      wasInSearchModeRef.current = false;
    }
  }, [search, scrollToNode]);

  const [contextMenuNode, setContextMenuNode] = useState<TreeDataItem | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );

  const onTreeNodeContextMenu = useCallback((node: TreeDataItem, event: React.MouseEvent) => {
    const nodeData = node.data as SchemaNodeData | undefined;
    if (!nodeData) return;

    // Show context menu only for table nodes (if not materialized view)
    if (nodeData.type === "table") {
      const tableData = nodeData as TableNodeData;
      // Only show context menu if table engine is not MaterializedView
      if (tableData.fullTableEngine !== "MaterializedView") {
        event.preventDefault();
        event.stopPropagation();
        setContextMenuNode(node);
        setContextMenuPosition({ x: event.clientX, y: event.clientY });
      }
    }
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenuNode(null);
      setContextMenuPosition(null);
    };

    if (contextMenuNode) {
      // Use setTimeout to avoid closing immediately on click
      setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 0);
      return () => {
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [contextMenuNode]);

  const handleDropTable = useCallback(() => {
    if ((contextMenuNode?.data as SchemaNodeData)?.type === "table" && connection) {
      const tableData = contextMenuNode!.data as TableNodeData;
      showDropTableConfirmationDialog({
        table: tableData,
        connection: connection,
        onSuccess: () => {
          // Refresh the schema tree
          loadDatabases();
        },
      });
    }
    setContextMenuNode(null);
    setContextMenuPosition(null);
  }, [contextMenuNode, connection, loadDatabases]);

  const onTreeNodeSelected = useCallback((item: TreeDataItem | undefined) => {
    if (!item?.data) return;

    const data = item.data as SchemaNodeData;

    // Always update the selected node ID for visual highlighting (works in both search and non-search modes)
    setSelectedNodeId(item.id);

    // Always open tabs when nodes are clicked (user interaction)
    // Tab changes from external sources won't sync to tree in search mode (handled by the active tab change listener)
    // If a host node is clicked, open the dashboard tab
    if (data.type === "host") {
      const hostData = data as HostNodeData;
      TabManager.openTab({
        id: `node:${hostData.fullName}`,
        type: "node",
        host: hostData.shortName,
      });
    }
    // If a database node is clicked, open the database tab
    else if (data.type === "database") {
      const databaseData = data as DatabaseNodeData;
      TabManager.openTab({
        id: `database:${databaseData.name}`,
        type: "database",
        database: databaseData.name,
      });
    }
    // If a table node is clicked, open the table tab
    else if (data.type === "table") {
      const tableData = data as TableNodeData;
      TabManager.openTab({
        id: `table:${tableData.database}.${tableData.table}`,
        type: "table",
        database: tableData.database,
        table: tableData.table,
        engine: tableData.fullTableEngine,
      });
    }
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="relative border-b-2 flex items-center h-9">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          ref={searchInputRef}
          placeholder="Search databases/tables/columns"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            "pl-8 pr-20 rounded-none border-none flex-1 h-9",
            search.length > 0 ? "pr-16" : "pr-8"
          )}
          disabled={!connection || isLoading}
        />
        {search && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-8 h-6 w-6 shrink-0"
            onClick={() => setSearch("")}
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-1 h-6 w-6 shrink-0"
          onClick={() => loadDatabases()}
          disabled={isLoading || !connection}
          title="Refresh schema"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <FloatingProgressBar show={isLoading} />
        {error ? (
          <div className="h-full overflow-y-auto">
            <Alert
              variant="destructive"
              className="border-0 p-3 bg-destructive/10 dark:bg-destructive/20"
            >
              <div className="flex items-start gap-2 w-full">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <AlertTitle className="text-sm">Error loading schema</AlertTitle>
                  <AlertDescription className="mt-1 break-words overflow-wrap-anywhere whitespace-pre-wrap text-xs">
                    {error}
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          </div>
        ) : (
          treeData.length > 0 && (
            <Tree
              ref={treeRef}
              data={treeData}
              search={search}
              selectedItemId={selectedNodeId}
              onSelectChange={onTreeNodeSelected}
              onNodeContextMenu={onTreeNodeContextMenu}
              folderIcon={Database}
              itemIcon={TableIcon}
              className="h-full"
              pathSeparator="."
              initialExpandedIds={["host"]}
              searchOptions={{ startLevel: 1 }}
            />
          )
        )}
      </div>

      {/* Context Menu */}
      {contextMenuNode &&
        contextMenuPosition &&
        (() => {
          // Build menu items based on node type
          const menuItems: React.ReactNode[] = [];

          if ((contextMenuNode.data as SchemaNodeData)?.type === "table") {
            const tableData = contextMenuNode.data as TableNodeData;
            // Only show drop table if engine is not 'Sys' (System tables)
            if (tableData.tableEngine !== "Sys") {
              menuItems.push(
                <div
                  key="drop-table"
                  className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={handleDropTable}
                >
                  Drop table
                </div>
              );
            }
          }

          // Only render context menu if there are items to show
          if (menuItems.length === 0) {
            return null;
          }

          return createPortal(
            <div
              className="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              style={{
                left: `${contextMenuPosition.x}px`,
                top: `${contextMenuPosition.y}px`,
              }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              {menuItems}
            </div>,
            document.body
          );
        })()}
    </div>
  );
}

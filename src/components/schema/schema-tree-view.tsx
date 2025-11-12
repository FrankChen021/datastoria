import FloatingProgressBar from "@/components/floating-progress-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tree, type TreeDataItem } from "@/components/ui/tree";
import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Calculator,
  Calendar,
  Clock,
  Database,
  FileText,
  Hash,
  List,
  Loader2,
  Map as MapIcon,
  Monitor,
  Package,
  RefreshCw,
  Search,
  Table as TableIcon,
  Type,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TabManager, type TabInfo } from "../tab-manager";
import { showDropTableConfirmationDialog } from "./drop-table-confirmation-dialog";

// Shared badge component for schema tree nodes
function SchemaTreeBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 text-[10px] text-muted-foreground">{children}</span>
    // <Badge variant="secondary" className="ml-2 text-[10px] whitespace-nowrap rounded-sm font-normal">
    //   {children}
    // </Badge>
  );
}

// Map column types to appropriate icons
function getColumnIcon(typeString: string): LucideIcon | undefined {
  const type = String(typeString || "").toLowerCase();

  // String types
  if (type.includes("string") || type.includes("char")) {
    return FileText;
  }

  // Integer types (UInt8, Int32, etc.)
  if (
    type.includes("uint") ||
    type.includes("int") ||
    type.includes("int8") ||
    type.includes("int16") ||
    type.includes("int32") ||
    type.includes("int64")
  ) {
    return Hash;
  }

  // UUID types - use same icon as numbers
  if (type === "uuid") {
    return Hash;
  }

  // Float types
  if (type.includes("float") || type.includes("double") || type.includes("decimal")) {
    return Calculator;
  }

  // Date/DateTime types
  if (type.includes("date") || type.includes("datetime")) {
    if (type.includes("time")) {
      return Clock;
    }
    return Calendar;
  }

  // Array types
  if (type.startsWith("array") || type.includes("array(")) {
    return List;
  }

  // Tuple types
  if (type.startsWith("tuple") || type.includes("tuple(")) {
    return Package;
  }

  // Map types
  if (type.startsWith("map") || type.includes("map(")) {
    return MapIcon;
  }

  // Enum types
  if (type.includes("enum")) {
    return Type;
  }

  // Nullable types - use the underlying type
  if (type.startsWith("nullable(")) {
    const innerType = type.replace(/^nullable\(/, "").replace(/\)$/, "");
    return getColumnIcon(innerType);
  }

  // Default: no icon
  return undefined;
}

// Parse Enum type to extract base type and key-value pairs
// Example: Enum8('NewPart' = 1, 'MergeParts' = 2) -> { baseType: 'Enum8', pairs: [['NewPart', '1'], ['MergeParts', '2']] }
function parseEnumType(typeString: string): { baseType: string; pairs: Array<[string, string]> } | null {
  const type = String(typeString || "").trim();

  // Match Enum8, Enum16, Enum, etc.
  const enumMatch = type.match(/^(Enum\d*)\s*\((.+)\)$/);
  if (!enumMatch) {
    return null;
  }

  const baseType = enumMatch[1];
  const content = enumMatch[2];
  const pairs: Array<[string, string]> = [];

  // Parse key-value pairs: 'NewPart' = 1, 'MergeParts' = 2
  // Handle quoted strings and numbers
  const pairRegex = /'([^']+)'\s*=\s*(\d+)/g;
  let match;
  while ((match = pairRegex.exec(content)) !== null) {
    // Remove single quotes from key if present
    let key = match[1];
    key = key.replace(/^'|'$/g, "");
    // Keep value as string
    const value = match[2];
    pairs.push([key, value]);
  }

  return { baseType, pairs };
}

// Create a column tree node
function toColumnTreeNode(column: { name: string; type: string }): TreeDataItem {
  const columnName = String(column.name || "Unknown");
  const columnType = String(column.type || "");

  // Check if it's an Enum type
  const enumInfo = parseEnumType(columnType);

  // Create the tag - show base type for Enum, full type for others
  const tagContent = enumInfo ? enumInfo.baseType : columnType;
  const tag = <span className="ml-2 text-[10px] text-muted-foreground">{tagContent}</span>;

  // Create hover card content if it's an Enum with pairs
  const hoverCardContent =
    enumInfo && enumInfo.pairs.length > 0 ? (
      <div className="space-y-1">
        <div className="font-semibold text-sm">{enumInfo.baseType}</div>
        <div className="space-y-1">
          {enumInfo.pairs.map(([key, value], index) => (
            <div key={index} className="text-xs font-mono">
              <span className="text-muted-foreground">{key}</span>
              <span className="mx-2">=</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>
    ) : undefined;

  return {
    id: `column:${column.name}`,
    text: columnName,
    search: columnName.toLowerCase(),
    type: "leaf" as const,
    icon: getColumnIcon(columnType),
    tag: tag,
    hoverCardContent: hoverCardContent,
    data: {
      type: "column",
      name: columnName,
      typeString: columnType,
      enumPairs: enumInfo?.pairs || undefined,
    } as ColumnNodeData,
  };
}

interface TableItemDO {
  database: string;
  dbEngine: string;
  table: string | null;
  tableEngine: string | null;
  columnName: string | null;
  columnType: string | null;
  version: string;
}

interface DatabaseNodeData {
  type: "database";
  name: string;
  engine: string;
  tableCount: number;
  hasDistributedTable: boolean;
  hasReplicatedTable: boolean;
}

interface TableNodeData {
  type: "table";
  database: string;
  table: string;
  fullName: string;
  tableEngine: string; // Shortened version for display
  fullTableEngine: string; // Full engine name for logic
  isLoading?: boolean;
}

interface ColumnNodeData {
  type: "column";
  name: string;
  typeString: string;
  enumPairs?: Array<[string, string]>; // Key-value pairs for Enum types
}

interface HostNodeData {
  type: "host";
  host: string;
}

export interface SchemaTreeViewProps {
  tabId?: string; // Optional tab ID for multi-tab support
}

export function SchemaTreeView({ tabId }: SchemaTreeViewProps) {
  const { selectedConnection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [treeData, setTreeData] = useState<TreeDataItem[]>([]);
  const [completeTree, setCompleteTree] = useState<TreeDataItem | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [apiCanceller, setApiCanceller] = useState<ApiCanceller | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const isLoadingRef = useRef(false);
  const currentConnectionIdRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasOpenedServerTabRef = useRef(false);
  // Track the last active tab info to sync when search is cleared
  const lastActiveTabInfoRef = useRef<TabInfo | null>(null);
  // Track if we were in search mode to detect when search is cleared
  const wasInSearchModeRef = useRef(false);

  // Cancel API call on unmount
  useEffect(() => {
    return () => {
      if (apiCanceller) {
        apiCanceller.cancel();
      }
    };
  }, [apiCanceller]);

  const toDatabaseTreeNodes = useCallback((rows: TableItemDO[]): [number, TreeDataItem[]] => {
    if (rows.length === 0) {
      return [0, []];
    }

    const databaseNodes: TreeDataItem[] = [];
    let currentDatabase: string | null = null;
    let currentDbEngine = "";
    let currentTable: string | null = null;
    let currentTableEngine = "";
    let currentFullTableEngine = "";
    let tableNodes: TreeDataItem[] = [];
    let columnNodes: TreeDataItem[] = [];
    let hasDistributedTable = false;
    let hasReplicatedTable = false;
    let totalTables = 0;

    // Process each row and group by database -> table -> columns
    for (const row of rows) {
      const database = String(row.database || "");
      if (!database) continue;

      // New database encountered
      if (database !== currentDatabase) {
        // Finalize previous table if exists
        if (currentTable && currentDatabase) {
          const tableNode = toTableTreeNode({
            database: currentDatabase,
            table: currentTable,
            tableEngine: currentTableEngine,
            fullTableEngine: currentFullTableEngine,
          });
          tableNode.children = columnNodes;
          tableNodes.push(tableNode);
          columnNodes = [];
        }

        // Finalize previous database if exists
        if (currentDatabase) {
          const databaseNode = toDatabaseTreeNode({
            name: currentDatabase,
            engine: currentDbEngine,
            tableCount: tableNodes.length,
            hasDistributedTable,
            hasReplicatedTable,
          });
          databaseNode.children = tableNodes;
          (databaseNode.data as DatabaseNodeData).tableCount = tableNodes.length;

          if (currentDatabase === "system") {
            databaseNodes.unshift(databaseNode);
          } else {
            databaseNodes.push(databaseNode);
          }

          totalTables += tableNodes.length;
        }

        // Start new database
        currentDatabase = database;
        currentDbEngine = String(row.dbEngine || "");
        tableNodes = [];
        hasDistributedTable = false;
        hasReplicatedTable = false;
        currentTable = null;
        currentTableEngine = "";
        currentFullTableEngine = "";
        columnNodes = [];
      }

      const tableName = row.table ? String(row.table) : null;

      // New table encountered
      if (tableName !== currentTable) {
        // Finalize previous table if exists
        if (currentTable && currentDatabase) {
          const tableNode = toTableTreeNode({
            database: currentDatabase,
            table: currentTable,
            tableEngine: currentTableEngine,
            fullTableEngine: currentFullTableEngine,
          });
          tableNode.children = columnNodes;
          tableNodes.push(tableNode);
          columnNodes = [];
        }

        // Start new table (if table exists)
        if (tableName) {
          currentTable = tableName;
          currentFullTableEngine = String(row.tableEngine || "");
          currentTableEngine = currentFullTableEngine;

          // Shorten engine names for display
          const len = "MergeTree".length;
          if (currentTableEngine.length > len && currentTableEngine.endsWith("MergeTree")) {
            currentTableEngine = currentTableEngine.substring(0, currentTableEngine.length - len);
          } else if (currentTableEngine === "MaterializedView") {
            currentTableEngine = "MV";
          } else if (currentTableEngine.startsWith("System")) {
            currentTableEngine = "Sys";
          }

          // Check for distributed/replicated tables
          if (row.tableEngine === "Distributed") {
            hasDistributedTable = true;
          }
          if (row.tableEngine && String(row.tableEngine).startsWith("Replicated")) {
            hasReplicatedTable = true;
          }
        } else {
          currentTable = null;
          currentTableEngine = "";
          currentFullTableEngine = "";
        }
      }

      // Add column if exists
      if (tableName && row.columnName) {
        const columnName = String(row.columnName);
        const columnType = String(row.columnType || "");
        const columnNode = toColumnTreeNode({ name: columnName, type: columnType });
        columnNode.id = `table:${currentDatabase}.${tableName}.${columnName}`;
        columnNodes.push(columnNode);
      }

      // Update database engine if changed
      if (row.dbEngine) {
        currentDbEngine = String(row.dbEngine);
      }
    }

    // Finalize last table
    if (currentTable && currentDatabase) {
      const tableNode = toTableTreeNode({
        database: currentDatabase,
        table: currentTable,
        tableEngine: currentTableEngine,
        fullTableEngine: currentFullTableEngine,
      });
      tableNode.children = columnNodes;
      tableNodes.push(tableNode);
    }

    // Finalize last database
    if (currentDatabase) {
      const databaseNode = toDatabaseTreeNode({
        name: currentDatabase,
        engine: currentDbEngine,
        tableCount: tableNodes.length,
        hasDistributedTable,
        hasReplicatedTable,
      });
      databaseNode.children = tableNodes;
      (databaseNode.data as DatabaseNodeData).tableCount = tableNodes.length;

      if (currentDatabase === "system") {
        databaseNodes.unshift(databaseNode);
      } else {
        databaseNodes.push(databaseNode);
      }

      totalTables += tableNodes.length;
    }

    return [totalTables, databaseNodes];
  }, []);

  const toHostTreeNode = useCallback(
    (response: ApiResponse, tables: TableItemDO[]): TreeDataItem => {
      let responseServer = response.httpHeaders?.["x-clickhouse-server-display-name"];
      const canSwitchServer = selectedConnection!.cluster.length > 0;

      if (!responseServer || responseServer === undefined) {
        if (canSwitchServer) {
          responseServer = "Host";
        } else {
          responseServer = selectedConnection?.name || "Unknown";
        }
      }

      // Ensure responseServer is a string
      const serverName = String(responseServer || "Unknown");

      const [totalTables, databaseNodes] = toDatabaseTreeNodes(tables);

      const hostNode: TreeDataItem = {
        id: "host",
        text: serverName,
        search: serverName.toLowerCase(),
        icon: Monitor,
        type: "folder",
        children: databaseNodes,
        tag: (
          <SchemaTreeBadge>
            {databaseNodes.length} DBs | {totalTables} Tables
          </SchemaTreeBadge>
        ),
        data: {
          type: "host",
          host: serverName,
        } as HostNodeData,
      };

      return hostNode;
    },
    [selectedConnection, toDatabaseTreeNodes]
  );

  const [contextMenuNode, setContextMenuNode] = useState<TreeDataItem | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((node: TreeDataItem, event: React.MouseEvent) => {
    const nodeData = node.data;
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

  const loadDatabases = useCallback(() => {
    if (!selectedConnection) {
      setTreeData([]);
      setError(null);
      isLoadingRef.current = false;
      currentConnectionIdRef.current = null;
      return;
    }

    // Get a unique ID for this connection
    const connectionId = `${selectedConnection.name}-${selectedConnection.user}-${selectedConnection.cluster}`;

    // Prevent duplicate calls for the same connection
    if (isLoadingRef.current && currentConnectionIdRef.current === connectionId) {
      return;
    }

    // Cancel previous request if any
    if (apiCanceller) {
      apiCanceller.cancel();
    }

    isLoadingRef.current = true;
    currentConnectionIdRef.current = connectionId;
    setIsLoading(true);
    setError(null); // Clear any previous errors

    const api = Api.create(selectedConnection);
    const canceller = api.executeSQL(
      {
        sql: `SELECT 
    databases.name AS database,
    databases.engine AS dbEngine,
    tables.name AS table,
    tables.engine AS tableEngine,
    columns.name AS columnName,
    columns.type AS columnType,
    (SELECT value FROM system.build_options WHERE name = 'VERSION_INTEGER') AS version
FROM
    system.databases
LEFT JOIN 
    system.tables
ON 
    databases.name = tables.database
LEFT JOIN
    system.columns
ON
    tables.database = columns.database AND tables.name = columns.table
WHERE
    (tables.name IS NULL OR (NOT startsWith(tables.name, '.inner.') AND NOT startsWith(tables.name, '.inner_id.')))
ORDER BY lower(database), database, table, columnName`,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
          output_format_json_quote_64bit_integers: 0,
        },
      },
      (response: ApiResponse) => {
        try {
          const rows = (response.data.data || []) as TableItemDO[];
          const hostNode = toHostTreeNode(response, rows);

          setCompleteTree(hostNode);
          setTreeData([hostNode]);
          setError(null); // Clear error on success
        } catch (err) {
          console.error("Error processing database response:", err);
          console.error("Response data:", response);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(`Failed to process database response: ${errorMessage}`);
        }
      },
      (error: ApiErrorResponse) => {
        console.error("API Error:", error);
        console.error("Error details:", {
          message: error.errorMessage,
          status: error.httpStatus,
          headers: error.httpHeaders,
          data: error.data,
        });
        // Build detailed error message
        let errorMessage = `Failed to load databases: ${error.errorMessage}`;
        if (error.httpStatus) {
          errorMessage += ` (HTTP ${error.httpStatus})`;
        }
        // Add detail message if available
        const detailMessage =
          typeof error?.data == "object"
            ? error.data?.message
              ? error.data.message
              : JSON.stringify(error.data, null, 2)
            : error?.data;
        if (detailMessage) {
          errorMessage += `\n${detailMessage}`;
        }
        setError(errorMessage);
      },
      () => {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    );

    setApiCanceller(canceller);
  }, [selectedConnection, toHostTreeNode, apiCanceller]);

  // Load databases when connection changes
  useEffect(() => {
    if (selectedConnection) {
      // Clear tree data first to ensure fresh reload
      setTreeData([]);
      setCompleteTree(null);
      setError(null); // Clear errors when connection changes
      // Reset the flag when connection changes
      hasOpenedServerTabRef.current = false;
      // Reset connection tracking to force reload even if connectionId is the same
      // This handles the case where connection details (URL, password) changed but name/user/cluster didn't
      currentConnectionIdRef.current = null;
      isLoadingRef.current = false;
      // Cancel any pending requests
      if (apiCanceller) {
        apiCanceller.cancel();
        setApiCanceller(null);
      }
      // Load databases for the new/updated connection
      loadDatabases();
    } else {
      setTreeData([]);
      setCompleteTree(null);
      setError(null);
      hasOpenedServerTabRef.current = false;
      currentConnectionIdRef.current = null;
      isLoadingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnection]);

  // Automatically open server tab when tree is first loaded
  useEffect(() => {
    if (!isLoading && treeData.length > 0 && !hasOpenedServerTabRef.current && treeData[0]?.data?.type === "host") {
      const hostData = treeData[0].data as HostNodeData;
      TabManager.sendOpenServerTabRequest(hostData.host, tabId);
      hasOpenedServerTabRef.current = true;
    }
  }, [treeData, isLoading, tabId]);

  // Helper function to sync tree selection to a tab info
  const syncToTabInfo = useCallback((tabInfo: TabInfo | null) => {
    if (!tabInfo) {
      return;
    }

    // Calculate the target node ID based on tab type
    let targetNodeId: string | undefined;
    if (tabInfo.type === "database") {
      targetNodeId = `db:${tabInfo.database}`;
    } else if (tabInfo.type === "table") {
      targetNodeId = `table:${tabInfo.database}.${tabInfo.table}`;
    } else if (tabInfo.type === "dashboard") {
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
      return targetNodeId;
    });
  }, []);

  // Listen to active tab changes and sync tree selection (only when not in search mode)
  useEffect(() => {
    const handler = (event: CustomEvent<{ tabId: string; tabInfo: TabInfo | null }>) => {
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
        syncToTabInfo(tabInfo);
      }
    };

    const unsubscribe = TabManager.onActiveTabChange(handler);
    return unsubscribe;
  }, [search, syncToTabInfo]);

  // Sync to active tab when search is cleared (exiting search mode)
  useEffect(() => {
    // Track when we enter search mode
    if (search.length > 0) {
      wasInSearchModeRef.current = true;
      return;
    }

    // When search is cleared (search.length === 0) and we were previously in search mode,
    // sync to the last active tab
    if (wasInSearchModeRef.current && lastActiveTabInfoRef.current) {
      syncToTabInfo(lastActiveTabInfoRef.current);
      wasInSearchModeRef.current = false;
    }
  }, [search, syncToTabInfo]);

  const handleDropTable = useCallback(() => {
    if (contextMenuNode?.data?.type === "table" && selectedConnection) {
      const tableData = contextMenuNode.data as TableNodeData;
      showDropTableConfirmationDialog({
        table: tableData,
        connection: selectedConnection,
        onSuccess: () => {
          // Refresh the schema tree
          loadDatabases();
        },
      });
    }
    setContextMenuNode(null);
    setContextMenuPosition(null);
  }, [contextMenuNode, selectedConnection, loadDatabases]);

  const toDatabaseTreeNode = (db: {
    name: string;
    engine: string;
    tableCount: number;
    hasDistributedTable: boolean;
    hasReplicatedTable: boolean;
  }): TreeDataItem => {
    const dbName = String(db.name || "Unknown");
    return {
      id: `db:${dbName}`,
      text: dbName,
      search: dbName.toLowerCase(),
      icon: Database,
      type: "folder",
      children: [],
      tag: (
        <SchemaTreeBadge>
          {db.engine || ""} | {db.tableCount}
        </SchemaTreeBadge>
      ),
      data: {
        type: "database",
        name: dbName,
        engine: db.engine || "",
        tableCount: db.tableCount,
        hasDistributedTable: db.hasDistributedTable,
        hasReplicatedTable: db.hasReplicatedTable,
      } as DatabaseNodeData,
    };
  };

  const toTableTreeNode = (table: {
    database: string;
    table: string;
    tableEngine: string;
    fullTableEngine: string;
  }): TreeDataItem => {
    const tableName = String(table.table || "Unknown");
    const databaseName = String(table.database || "Unknown");
    const fullName = `${databaseName}.${tableName}`;
    return {
      id: `table:${fullName}`,
      text: tableName,
      search: tableName.toLowerCase(),
      icon: TableIcon,
      type: "folder", // Has columns as children
      children: [],
      tag: <SchemaTreeBadge>{table.tableEngine || ""}</SchemaTreeBadge>,
      data: {
        type: "table",
        database: databaseName,
        table: tableName,
        fullName: fullName,
        tableEngine: table.tableEngine || "",
        fullTableEngine: table.fullTableEngine || "",
      } as TableNodeData,
    };
  };

  const handleNodeExpand = useCallback(
    (item: TreeDataItem | undefined) => {
      if (!item?.data) return;

      // Always update the selected node ID for visual highlighting (works in both search and non-search modes)
      setSelectedNodeId(item.id);

      // Always open tabs when nodes are clicked (user interaction)
      // Tab changes from external sources won't sync to tree in search mode (handled by the active tab change listener)
      // If a host node is clicked, open the dashboard tab
      if (item.data.type === "host") {
        const hostData = item.data as HostNodeData;
        TabManager.sendOpenServerTabRequest(hostData.host, tabId);
      }
      // If a database node is clicked, open the database tab
      else if (item.data.type === "database") {
        const databaseData = item.data as DatabaseNodeData;
        TabManager.sendOpenDatabaseTabRequest(databaseData.name, tabId);
      }
      // If a table node is clicked, open the table tab
      else if (item.data.type === "table") {
        const tableData = item.data as TableNodeData;
        TabManager.sendOpenTableTabRequest(tableData.database, tableData.table, tableData.fullTableEngine, tabId);
      }
    },
    [tabId]
  );

  if (!selectedConnection) {
    return (
      <div className="h-full w-full overflow-auto p-4 flex flex-col">
        <div className="text-sm font-semibold mb-4">Schema</div>
        <div className="text-sm text-muted-foreground flex-1">No connection selected</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <div className="relative border-b flex items-center h-9">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          ref={searchInputRef}
          placeholder="Filter database or table"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-20 rounded-none border-none flex-1 h-9"
          disabled={!selectedConnection || (!completeTree && treeData.length === 0 && !isLoading)}
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
          disabled={isLoading || !selectedConnection}
          title="Refresh schema"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <FloatingProgressBar show={isLoading} />
        {error ? (
          <div className="h-full overflow-y-auto">
            <Alert variant="destructive" className="border-0 p-3 bg-destructive/10 dark:bg-destructive/20">
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
              data={treeData}
              search={search}
              selectedItemId={selectedNodeId}
              onSelectChange={handleNodeExpand}
              onNodeContextMenu={handleContextMenu}
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

          if (contextMenuNode.data?.type === "table") {
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

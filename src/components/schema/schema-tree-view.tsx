import FloatingProgressBar from "@/components/floating-progress-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tree, type TreeDataItem } from "@/components/ui/tree";
import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { toastManager } from "@/lib/toast";
import type { LucideIcon } from "lucide-react";
import {
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
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QueryExecutor } from "../query-execution/query-executor";
import { TableTabManager } from "../table-tab/table-tab-manager";

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

// Create a column tree node
function toColumnTreeNode(column: { name: string; type: string }): TreeDataItem {
  const columnName = String(column.name || "Unknown");
  const columnType = String(column.type || "");
  return {
    id: `column:${column.name}`,
    text: columnName,
    search: columnName.toLowerCase(),
    type: "leaf" as const,
    icon: getColumnIcon(columnType),
    tag: <span className="ml-2 text-[10px] text-muted-foreground">{columnType}</span>,
    data: {
      type: "column",
      name: columnName,
      typeString: columnType,
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
}

interface HostNodeData {
  type: "host";
  host: string;
}

// Type union for all possible tree node data types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TreeNodeData = HostNodeData | DatabaseNodeData | TableNodeData | ColumnNodeData;

export interface SchemaTreeViewProps {
  tabId?: string; // Optional tab ID for multi-tab support
  onExecuteQuery?: (
    sql: string,
    options?: { displayFormat?: "sql" | "text"; formatter?: (text: string) => string }
  ) => void; // Deprecated: use event-based approach instead
}

export function SchemaTreeView({ onExecuteQuery, tabId }: SchemaTreeViewProps) {
  const { selectedConnection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [treeData, setTreeData] = useState<TreeDataItem[]>([]);
  const [completeTree, setCompleteTree] = useState<TreeDataItem | null>(null);
  const [search, setSearch] = useState("");
  const [apiCanceller, setApiCanceller] = useState<ApiCanceller | null>(null);
  const isLoadingRef = useRef(false);
  const currentConnectionIdRef = useRef<string | null>(null);

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

  const executeQuery = useCallback(
    (sql: string, options?: { displayFormat?: "sql" | "text"; formatter?: (text: string) => string }) => {
      // Emit event for event-based communication
      QueryExecutor.sendQueryRequest(sql, options, undefined, tabId);

      // Fallback to prop-based approach for backward compatibility
      if (onExecuteQuery) {
        onExecuteQuery(sql, options);
      }
    },
    [onExecuteQuery, tabId]
  );

  const [contextMenuNode, setContextMenuNode] = useState<TreeDataItem | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((node: TreeDataItem, event: React.MouseEvent) => {
    const nodeData = node.data;
    if (!nodeData) return;

    // Only show context menu for database nodes
    if (nodeData.type === "database") {
      event.preventDefault();
      event.stopPropagation();
      setContextMenuNode(node);
      setContextMenuPosition({ x: event.clientX, y: event.clientY });
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

  const handleShowCreateDatabase = useCallback(() => {
    if (contextMenuNode?.data?.type === "database") {
      const dbData = contextMenuNode.data as DatabaseNodeData;
      const sql = `SHOW CREATE DATABASE ${dbData.name}`;
      executeQuery(sql, {
        displayFormat: "sql",
        formatter: (text: string) => text.replaceAll("\\n", "\n").replaceAll("\\", ""),
      });
    }
    setContextMenuNode(null);
    setContextMenuPosition(null);
  }, [contextMenuNode, executeQuery]);

  const loadDatabases = useCallback(() => {
    if (!selectedConnection) {
      setTreeData([]);
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
        } catch (err) {
          console.error("Error processing database response:", err);
          console.error("Response data:", response);
          toastManager.show(
            `Failed to process database response: ${err instanceof Error ? err.message : String(err)}`,
            "error"
          );
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
        toastManager.show(`Failed to load databases: ${error.errorMessage}`, "error");
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
      loadDatabases();
    } else {
      setTreeData([]);
      setCompleteTree(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnection]);

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

      // If a table node is clicked, open the table tab
      if (item.data.type === "table") {
        const tableData = item.data as TableNodeData;
        TableTabManager.sendOpenTableTabRequest(tableData.database, tableData.table, tableData.fullTableEngine, tabId);
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
          placeholder="Filter database or table"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-10 rounded-none border-none flex-1 h-9"
          disabled={!selectedConnection || (!completeTree && treeData.length === 0 && !isLoading)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 h-8 w-8 shrink-0"
          onClick={() => loadDatabases()}
          disabled={isLoading || !selectedConnection}
          title="Refresh schema"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <FloatingProgressBar show={isLoading} />
        {treeData.length > 0 && (
          <Tree
            data={treeData}
            search={search}
            onSelectChange={handleNodeExpand}
            onNodeContextMenu={handleContextMenu}
            folderIcon={Database}
            itemIcon={TableIcon}
            className="h-full"
            pathSeparator="."
            initialExpandedIds={["host"]}
            searchOptions={{ startLevel: 1 }}
          />
        )}
      </div>

      {/* Context Menu */}
      {contextMenuNode &&
        contextMenuPosition &&
        createPortal(
          <div
            className="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{
              left: `${contextMenuPosition.x}px`,
              top: `${contextMenuPosition.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {contextMenuNode.data?.type === "database" && (
              <div
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={handleShowCreateDatabase}
              >
                Show create database
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

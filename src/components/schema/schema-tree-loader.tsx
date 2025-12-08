import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { type Connection } from "@/lib/connection/Connection";
import { type TreeDataItem } from "@/components/ui/tree";
import {
  Calculator,
  Calendar,
  Clock,
  Database,
  FileText,
  Hash,
  List,
  Map as MapIcon,
  Monitor,
  Package,
  Table as TableIcon,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HostSelector, SchemaTreeBadge } from "./schema-tree-host-selector";

export interface SchemaLoadResult {
  treeData: TreeDataItem[];
  completeTree: TreeDataItem; // The root host node
  totalTables: number;
}

interface TableItemDO {
  database: string;
  dbEngine: string;
  table: string | null;
  tableEngine: string | null;
  tableComment: string | null;
  columnName: string | null;
  columnType: string | null;
  columnComment: string | null;
  version: string;
}

export interface DatabaseNodeData {
  type: "database";
  name: string;
  engine: string;
  tableCount: number;
  hasDistributedTable: boolean;
  hasReplicatedTable: boolean;
}

export interface TableNodeData {
  type: "table";
  database: string;
  table: string;
  fullName: string;
  tableEngine: string; // Shortened version for display
  fullTableEngine: string; // Full engine name for logic
  tableComment?: string | null;
  isLoading?: boolean;
}

export interface ColumnNodeData {
  type: "column";
  name: string;
  typeString: string;
  enumPairs?: Array<[string, string]>; // Key-value pairs for Enum types
  columnComment?: string | null;
}

export interface HostNodeData {
  type: "host";
  host: string;
}

export type SchemaNodeData = DatabaseNodeData | TableNodeData | ColumnNodeData | HostNodeData;

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
function toColumnTreeNode(column: { name: string; type: string; comment?: string | null }): TreeDataItem {
  const columnName = String(column.name || "Unknown");
  const columnType = String(column.type || "");
  const columnComment = column.comment || null;

  // Check if it's an Enum type
  const enumInfo = parseEnumType(columnType);

  // Create the tag - show base type for Enum, full type for others
  const tagContent = enumInfo ? enumInfo.baseType : columnType;
  const tag = <span className="ml-2 text-[10px] text-muted-foreground">{tagContent}</span>;

  // Tooltip structure: column name, column type, enum info (if available), comment (if available)
  const labelTooltip = (() => {
    const hasEnumPairs = enumInfo && enumInfo.pairs.length > 0;
    const hasComment = !!columnComment;

    // Only show tooltip if there's enum info or comment
    if (!hasEnumPairs && !hasComment) {
      return undefined;
    }

    return (
      <div className="space-y-1 max-w-[300px]">
        {/* Column name */}
        <div className="font-semibold text-sm break-words">{columnName}</div>

        {/* Column type */}
        <div className="text-xs text-muted-foreground break-words">
          <span className="font-mono">{columnType}</span>
        </div>

        {/* Enum info */}
        {hasEnumPairs && (
          <div className="mt-2 pt-2 border-t space-y-1">
            <div className="font-semibold text-xs break-words">{enumInfo.baseType}</div>
            <div className="space-y-1">
              {enumInfo.pairs.map(([key, value], index) => (
                <div key={index} className="text-xs font-mono break-words">
                  <span className="text-muted-foreground break-all">{key}</span>
                  <span className="mx-2">=</span>
                  <span className="break-all">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comment */}
        {hasComment && (
          <div className={hasEnumPairs ? "mt-2 pt-2 border-t" : ""}>
            <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{columnComment}</div>
          </div>
        )}
      </div>
    );
  })();

  return {
    id: `column:${column.name}`,
    labelContent: columnName,
    search: columnName.toLowerCase(),
    type: "leaf" as const,
    icon: getColumnIcon(columnType),
    tag: tag,
    labelTooltip: labelTooltip,
    data: {
      type: "column",
      name: columnName,
      typeString: columnType,
      enumPairs: enumInfo?.pairs || undefined,
      columnComment: columnComment || undefined,
    } as ColumnNodeData,
  };
}

function toTableTreeNode(table: {
  database: string;
  table: string;
  tableEngine: string;
  fullTableEngine: string;
  tableComment?: string | null;
}): TreeDataItem {
  const tableName = String(table.table || "Unknown");
  const databaseName = String(table.database || "Unknown");
  const fullName = `${databaseName}.${tableName}`;
  const tableComment = table.tableComment || null;

  // Use labelTooltip for table comment
  const labelTooltip = tableComment ? (
    <div className="text-xs text-muted-foreground whitespace-pre-wrap">{tableComment}</div>
  ) : undefined;

  return {
    id: `table:${fullName}`,
    labelContent: tableName,
    search: tableName.toLowerCase(),
    icon: TableIcon,
    type: "folder", // Has columns as children
    children: [],
    tag: <SchemaTreeBadge>{table.tableEngine || ""}</SchemaTreeBadge>,
    labelTooltip: labelTooltip,
    data: {
      type: "table",
      database: databaseName,
      table: tableName,
      fullName: fullName,
      tableEngine: table.tableEngine || "",
      fullTableEngine: table.fullTableEngine || "",
      tableComment: tableComment || undefined,
    } as TableNodeData,
  };
}

function toDatabaseTreeNode(db: {
  name: string;
  engine: string;
  tableCount: number;
  hasDistributedTable: boolean;
  hasReplicatedTable: boolean;
}): TreeDataItem {
  const dbName = String(db.name || "Unknown");
  return {
    id: `db:${dbName}`,
    labelContent: dbName,
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
}

export class SchemaTreeLoader {
  private apiCanceller: ApiCanceller | null = null;

  /**
   * Cancels any ongoing loading request
   */
  cancel() {
    if (this.apiCanceller) {
      this.apiCanceller.cancel();
      this.apiCanceller = null;
    }
  }

  /**
   * Loads the schema tree for a given connection
   */
  load(connection: Connection): Promise<SchemaLoadResult> {
    return new Promise((resolve, reject) => {
      this.cancel(); // Cancel previous

      const api = Api.create(connection);
      
      const sql = `SELECT 
    databases.name AS database,
    databases.engine AS dbEngine,
    tables.name AS table,
    tables.engine AS tableEngine,
    tables.comment AS tableComment,
    columns.name AS columnName,
    columns.type AS columnType,
    columns.comment AS columnComment,
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
ORDER BY lower(database), database, table, columnName`;

      this.apiCanceller = api.executeSQL(
        {
          sql,
          headers: { "Content-Type": "text/plain" },
          params: { default_format: "JSON", output_format_json_quote_64bit_integers: 0 },
        },
        (response: ApiResponse) => {
          try {
            const rows = (response.data.data || []) as TableItemDO[];
            const hostNode = this.buildTree(connection, response, rows);
            
            resolve({
              treeData: [hostNode],
              completeTree: hostNode,
              totalTables: (hostNode.data as any).tableCount || 0 // Host node doesn't explicitly store totalTables in data in original code, but we can infer or add it
            });
          } catch (err) {
            reject(err);
          }
        },
        (error: ApiErrorResponse) => {
            let errorMessage = `Failed to load databases: ${error.errorMessage}`;
            if (error.httpStatus) {
              errorMessage += ` (HTTP ${error.httpStatus})`;
            }
            const detailMessage =
              typeof error?.data == "object"
                ? error.data?.message
                  ? error.data.message
                  : JSON.stringify(error.data, null, 2)
                : error?.data;
            if (detailMessage) {
              errorMessage += `\n${detailMessage}`;
            }
            reject(new Error(errorMessage));
        },
        () => {
          this.apiCanceller = null;
        }
      );
    });
  }

  private toDatabaseTreeNodes(rows: TableItemDO[]): [number, TreeDataItem[]] {
    if (rows.length === 0) {
      return [0, []];
    }

    const databaseNodes: TreeDataItem[] = [];
    let currentDatabase: string | null = null;
    let currentDbEngine = "";
    let currentTable: string | null = null;
    let currentTableEngine = "";
    let currentFullTableEngine = "";
    let currentTableComment: string | null = null;
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
            tableComment: currentTableComment,
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
        currentTableComment = null;
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
            tableComment: currentTableComment,
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
          currentTableComment = row.tableComment ? String(row.tableComment) : null;

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
          currentTableComment = null;
        }
      }

      // Add column if exists
      if (tableName && row.columnName) {
        const columnName = String(row.columnName);
        const columnType = String(row.columnType || "");
        const columnComment = row.columnComment ? String(row.columnComment) : null;
        const columnNode = toColumnTreeNode({ name: columnName, type: columnType, comment: columnComment });
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
        tableComment: currentTableComment,
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
  }

  private buildTree(connection: Connection, response: ApiResponse, rows: TableItemDO[]): TreeDataItem {
      let responseServer = response.httpHeaders?.["x-clickhouse-server-display-name"];
      const canSwitchServer = connection.cluster.length > 0;

      if (!responseServer || responseServer === undefined) {
        if (canSwitchServer) {
          responseServer = "Host";
        } else {
          responseServer = connection.name || "Unknown";
        }
      }

      // Ensure responseServer is a string
      const serverName = String(responseServer || "Unknown");

      // Strip the Kubernetes cluster suffix if present
      const displayName = serverName.replace(/\.svc\.cluster\.local$/, "");

      const [totalTables, databaseNodes] = this.toDatabaseTreeNodes(rows);

      const hostNode: TreeDataItem = {
        id: "host",
        labelContent: connection.cluster ? (
          <HostSelector clusterName={connection.cluster} displayName={displayName} />
        ) : (
          displayName
        ),
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
  }
}


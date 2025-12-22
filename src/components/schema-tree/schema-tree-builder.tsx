import { type TreeDataItem } from "@/components/ui/tree";
import { type Connection } from "@/lib/connection/connection";
import type { LucideIcon } from "lucide-react";
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
import { CopyButton } from "@/components/ui/copy-button";
import { SchemaTreeBadge, SchemaTreeHostSelector } from "./schema-tree-host-selector";
import type {
  ColumnNodeData,
  DatabaseNodeData,
  HostNodeData,
  SchemaLoadResult,
  TableItemDO,
  TableNodeData,
} from "./schema-tree-types";

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
      <div className="text-xs space-y-1 max-w-[400px]">
        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <div className="font-medium text-muted-foreground">Column</div>
          <div className="text-foreground break-all flex items-center gap-1 min-w-0">
            <span>{columnName}</span>
            <CopyButton value={columnName} className="relative top-0 right-0 h-4 w-4 shrink-0 [&_svg]:h-2.5 [&_svg]:w-2.5" />
          </div>
          <div className="font-medium text-muted-foreground">Type</div>
          <div className="text-foreground font-mono break-all min-w-0">{columnType}</div>
        </div>

        {/* Enum info */}
        {hasEnumPairs && (
          <div className="pt-1 mt-1 border-t space-y-1">
            <div className="font-medium text-muted-foreground">{enumInfo.baseType}</div>
            <div className="space-y-1">
              {enumInfo.pairs.map(([key, value], index) => (
                <div key={index} className="font-mono break-words">
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
          <div className="pt-1 mt-1 border-t">
            <div className="text-foreground whitespace-pre-wrap break-words">{columnComment}</div>
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

  // Build comprehensive tooltip for table
  const labelTooltip = (
    <div className="text-xs space-y-1">
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
        <div className="font-medium text-muted-foreground">Table</div>
        <div className="text-foreground break-all flex items-center gap-1 min-w-0">
          <span>{fullName}</span>
          <CopyButton value={fullName} className="relative top-0 right-0 h-4 w-4 shrink-0 [&_svg]:h-2.5 [&_svg]:w-2.5" />
        </div>
        <div className="font-medium text-muted-foreground">Engine</div>
        <div className="text-foreground break-all min-w-0">{table.fullTableEngine || table.tableEngine}</div>
      </div>
      {tableComment && (
        <div className="pt-1 mt-1 border-t">
          <div className="text-foreground whitespace-pre-wrap break-words">{tableComment}</div>
        </div>
      )}
    </div>
  );

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
  comment?: string | null;
  tableCount: number;
  hasDistributedTable: boolean;
  hasReplicatedTable: boolean;
}): TreeDataItem {
  const dbName = String(db.name || "Unknown");

  // Build comprehensive tooltip for database
  const labelTooltip = (
    <div className="text-xs space-y-1">
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
        <div className="font-medium text-muted-foreground">Database</div>
        <div className="text-foreground break-all flex items-center gap-1 min-w-0">
          <span>{dbName}</span>
          <CopyButton value={dbName} className="relative top-0 right-0 h-4 w-4 shrink-0 [&_svg]:h-2.5 [&_svg]:w-2.5" />
        </div>
        <div className="font-medium text-muted-foreground">Engine</div>
        <div className="text-foreground break-all min-w-0">{db.engine}</div>
        <div className="font-medium text-muted-foreground">Tables</div>
        <div className="text-foreground min-w-0">{db.tableCount}</div>
      </div>
      {db.comment && (
        <div className="pt-1 mt-1 border-t">
          <div className="text-foreground whitespace-pre-wrap break-words">{db.comment}</div>
        </div>
      )}
    </div>
  );

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
    labelTooltip: labelTooltip,
    data: {
      type: "database",
      name: dbName,
      engine: db.engine || "",
      comment: db.comment || undefined,
      tableCount: db.tableCount,
      hasDistributedTable: db.hasDistributedTable,
      hasReplicatedTable: db.hasReplicatedTable,
    } as DatabaseNodeData,
  };
}

function toDatabaseTreeNodes(rows: TableItemDO[]): [number, TreeDataItem[]] {
  if (rows.length === 0) {
    return [0, []];
  }

  const databaseNodes: TreeDataItem[] = [];
  let currentDatabase: string | null = null;
  let currentDbEngine = "";
  let currentDbComment: string | null = null;
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
          comment: currentDbComment,
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
      currentDbComment = row.dbComment ? String(row.dbComment) : null;
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

    // Update database engine and comment if changed
    if (row.dbEngine) {
      currentDbEngine = String(row.dbEngine);
    }
    if (row.dbComment !== undefined) {
      currentDbComment = row.dbComment ? String(row.dbComment) : null;
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
      comment: currentDbComment,
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

export function buildSchemaTree(
  connection: Connection,
  schemaData: SchemaLoadResult,
  onHostChange?: (hostName: string) => void
): TreeDataItem {
  let targetServerNode = connection.session.targetNode;

  const canSwitchServer = (connection.cluster || "").length > 0;

  if (!targetServerNode || targetServerNode === undefined) {
    if (canSwitchServer) {
      targetServerNode = "Host";
    } else {
      // Priority: 1. serverDisplayName from header, 2. connection.name
      targetServerNode = schemaData.serverDisplayName || connection.name || "Unknown";
    }
  }

  // Ensure responseServer is a string
  const serverName = String(targetServerNode || "Unknown");

  const [totalTables, databaseNodes] = toDatabaseTreeNodes(schemaData.rows);

  // Default no-op handler if not provided
  const hostChangeHandler = onHostChange || (() => {});

  // Build comprehensive tooltip for host
  const hostTooltip = (
    <div className="text-xs space-y-1">
      <div className="font-medium text-muted-foreground">{connection.name}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
        <div className="font-medium text-muted-foreground">URL</div>
        <div className="text-foreground break-all flex items-center gap-1 min-w-0">
          <span>{connection.url}</span>
          <CopyButton value={connection.url} className="relative top-0 right-0 h-4 w-4 shrink-0 [&_svg]:h-2.5 [&_svg]:w-2.5" />
        </div>
        <div className="font-medium text-muted-foreground">User</div>
        <div className="text-foreground break-all min-w-0">{connection.user}</div>
        <div className="font-medium text-muted-foreground">Current Node</div>
        <div className="text-foreground break-all min-w-0">{serverName}</div>
      </div>
      <div className="pt-1 mt-1 border-t grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <div className="font-medium text-muted-foreground">Databases</div>
        <div className="text-foreground">{databaseNodes.length}</div>
        <div className="font-medium text-muted-foreground">Tables</div>
        <div className="text-foreground">{totalTables}</div>
      </div>
    </div>
  );

  const hostNode: TreeDataItem = {
    id: "host",
    labelContent: (
      <SchemaTreeHostSelector
        clusterName={connection.cluster || ""}
        nodeName={serverName}
        onHostChange={hostChangeHandler}
      />
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
    labelTooltip: hostTooltip,
    data: {
      type: "host",
      host: serverName,
    } as HostNodeData,
  };

  return hostNode;
}

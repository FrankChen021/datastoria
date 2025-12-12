export interface TableItemDO {
  database: string;
  dbEngine: string;
  table: string | null;
  tableEngine: string | null;
  tableComment: string | null;
  columnName: string | null;
  columnType: string | null;
  columnComment: string | null;
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

export interface SchemaLoadResult {
  rows: TableItemDO[];
}


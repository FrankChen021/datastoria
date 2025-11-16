import type { FormatName } from "@/lib/formatter";

interface DashboardConfig {
  // Define the structure of your dashboard config here
  text: string;
  value: string;
  folder: string;
  // ... other properties
}

export type SelectorUI = {
  type: string;
  name: string;
  fields: FilterSpec[];
};

export interface FilterSpec {
  filterType: string;
  sourceType: string;
  source: string;
  name: string;
  alias: string;
  displayText: string;
  defaultValue: string;
  width: number;
  filterExpression: string;
  allowClear: boolean;
  allowEdit: boolean;

  // If not given, all comparators are supported
  // See ComparatorManager for supported comparators
  supportedComparators?: string[];

  // Default to true is missing
  onPreviousFilters?: boolean;

  // Callback to convert name to the name in the expression
  nameConverter?: (name: string) => string;
}

export interface ColumnDef {
  // The name of property that is used to access value from a given object
  name: string;
  title?: string;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  resizable?: boolean;
  pinned?: boolean;
  format?: FormatName;
  align?: "left" | "right" | "center";
  lookupFn?: (value: any) => string | undefined;

  // If set, above format/lookupFn will be ignored
  render?: (row: { original: object }) => React.ReactNode;

  yAxis?: number;
  inverse?: boolean;
  chartType?: string;
  fill?: boolean;
}

export type DashboardFilter = {
  selectors?: SelectorUI[];
  showFilterInput?: boolean;
  showTimeSpanSelector?: boolean;
  showRefresh?: boolean;
  showAutoRefresh?: boolean;
};

export type QueryPrecondition = {
  filters?: string[];
};

// Base interface for common query properties
export interface BaseQuery {
  type: "list" | "timeseries" | "groupBy" | "http";
  // Common UI properties
  precondition?: QueryPrecondition;
}

export interface JsonQueryRequest {
  dataSource?: string;
  filterExpression?: string;
  fields?: any[];
  interval?: {
    startISO8601: string;
    endISO8601: string;
    step: number;
    bucketCount?: number;
  };
  limit?: number;
  orderBy?: { name: string; order: string };
  groupBy?: any[];
  window?: any;
}

export type JsonQuery = JsonQueryRequest &
  BaseQuery & {
    filter?: string;
    bucketCount?: number;
  };

export type HttpQuery = BaseQuery & {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;

  // For response
  responseDataField: string;
  responseDataFormat: "object" | "array";
};

// Union type for all query types
export type DashboardQuery = JsonQuery | HttpQuery;

export type DashboardGroup = {
  title: string;
  charts: any[];
  collapsed?: boolean;
};

export type Dashboard = {
  version?: number; // Dashboard version: 1 = 4-column system, 2 = 24-column system, 3 = gridPos system, default to 1 if missing
  filter: DashboardFilter;
  charts: (any | DashboardGroup)[];
};

export type DashboardFilterV2 = {
  id?: string;
  search?: string;
  folder?: string;
  page: number;
  size: number;
  sort: string;
  order: string;
};

export type { DashboardConfig };

import type { FormatName, ObjectFormatter } from "@/lib/formatter";
import type React from "react";

export type SelectorUI = {
  type: string;
  name: string;
  fields: FilterSpec[];
};

export type FilterType = "select" | "date_time";

export type FilterSpec = SelectorFilterSpec | DateTimeFilterSpec;

/**
 * Map comparator -> expression template.
 *
 * Supported placeholders (replaced by DashboardFilterComponent):
 * - {name}        : converted column name (see nameConverter)
 * - {value}       : single value as escaped SQL string literal (including quotes)
 * - {values}      : comma-joined escaped SQL string literals (e.g. 'a','b')
 * - {valuesArray} : ClickHouse array literal (e.g. ['a','b'])
 */
export type ExpressionTemplateMap = Partial<Record<string, string>>;

export type FilterDataSource =
  | {
      type: "inline";
      values: Array<{ label: string; value: string }>;
    }
  | {
      type: "sql";
      sql: string;
    };

export interface SelectorFilterSpec {
  filterType: "select";
  name: string;
  displayText: string;
  /**
   * Data source for loading selector values.
   * - If type is "inline", uses the provided values array directly.
   * - If type is "sql", uses the SQL query template to fetch options from the backend.
   *
   * For SQL data sources, supported template params (replaced by DashboardFilterComponent):
   * - {from:String}, {to:String}, {rounding:UInt32}, {seconds:UInt32}, {startTimestamp:UInt32}, {endTimestamp:UInt32}
   *   (same behavior as SQLQueryBuilder time span replacement)
   * - {filterExpression:String} -> combined expression from previous selectors (or "1=1" if empty)
   * - {timeFilter:String} -> generated from the date_time filter spec (or default time column if missing)
   *
   * The query should return a single-column result set; the first column is used as the selector value.
   */
  datasource: FilterDataSource;

  // If not given, all comparators are supported
  // See ComparatorManager for supported comparators
  supportedComparators?: string[];

  // Default to true is missing
  onPreviousFilters?: boolean;

  // Callback to convert name to the name in the expression
  nameConverter?: (name: string) => string;

  /**
   * Optional comparator -> expression template map.
   * If set (and comparator matches), it overrides `QueryPattern.toQueryString()`.
   *
   * Useful for array columns, e.g.:
   * - "=": "has({name}, {value})"
   * - "in": "hasAny({name}, {valuesArray})"
   */
  expressionTemplate?: ExpressionTemplateMap;

  /**
   * Optional initial filter pattern to apply when the component mounts.
   * If provided, this filter will be automatically applied on initialization.
   *
   * Example:
   * - { comparator: "!=", values: ["QueryStart"] } for `type <> 'QueryStart'`
   * - { comparator: "in", values: ["value1", "value2"] } for `type IN ('value1', 'value2')`
   */
  defaultPattern?: {
    comparator: string;
    values: string[];
  };
}

export interface DateTimeFilterSpec {
  filterType: "date_time";
  alias: string;
  displayText: string;
  width?: number;
  /**
   * The column name to apply the selected time span to (e.g. "event_time")
   */
  timeColumn: string;
  /**
   * Default time span label used by TimeSpanSelector (e.g. "Last 15 Mins")
   */
  defaultTimeSpan?: string;
}

// SQL Query interface
export interface SQLQuery {
  sql: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;

  interval?: {
    startISO8601: string;
    endISO8601: string;
    step: number;
    bucketCount?: number;
  };
}

// Query Response interface
export interface QueryResponse {
  startTimestamp: number;
  endTimestamp: number;
  interval: number;
  data: unknown[];
}

// Title Option interface
export interface TitleOption {
  title: string;
  link?: string;
  description?: string;

  // Default to center
  align?: "left" | "center" | "right";

  // Default to true. If false, the title bar will not be rendered
  showTitle?: boolean;

  // Whether to show the refresh button in the toolbar
  showRefreshButton?: boolean;
}

// Field Option interface
export interface FieldOption {
  // The name of property that is used to access value from a given object
  // Optional when defining fieldOptions in a Map/Record (the key is used as the name)
  // Will be set automatically by the component from the key or server response
  name?: string;
  title?: string;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  resizable?: boolean;
  pinned?: boolean;

  align?: "left" | "right" | "center";

  format?: FormatName | ObjectFormatter;
  // Arguments to pass to the formatter function (only used when format is FormatName)
  formatArgs?: unknown[];

  yAxis?: number;
  inverse?: boolean;
  chartType?: string;
  fill?: boolean;

  // Action column support: render custom action buttons for each row
  renderAction?: (row: Record<string, unknown>, rowIndex: number) => React.ReactNode;

  // Position in the table (for ordering) starting from 1. If not provided, columns will be shown in data order.
  // If negative, the column will be hidden from the table.
  position?: number;
}

// Grid position for version 3+ dashboards (Grafana-style layout)
// x, y are optional for auto-positioning; if provided, use manual positioning
export interface GridPos {
  x?: number; // Column position (0-23), optional for auto-positioning
  y?: number; // Row position (0+), optional for auto-positioning
  w: number; // Width in columns (1-24)
  h: number; // Height in flexible row units (similar to ch-ui's rowSpan)
}

// Panel Descriptor base interface
export interface PanelDescriptor {
  type: string; // "line" | "bar" | "area" | "pie" | "scatter" | "heatmap" | "table" | "transpose-table" | "stat" | "custom"

  titleOption?: TitleOption;

  // If not given, it defaults to false
  collapsed?: boolean;

  // Legacy width property (version 1-2)
  // For version 3+, use gridPos instead
  width?: number;

  // Table content height in viewport units (vh) - DEPRECATED for normal dashboards
  // This property is legacy and should NOT be used for regular dashboard panels.
  // Instead, use gridPos.h to control panel height - the table will automatically
  // scroll within its container.
  // Only use this for special cases like drilldown dialogs where explicit vh height is needed.
  height?: number;

  // Grid position for version 3+ (Grafana-style layout)
  // Controls both panel container size and table scrolling behavior
  // gridPos.h determines the panel height - tables will scroll if content exceeds this
  // If provided, takes precedence over width
  gridPos?: GridPos;

  datasource: SQLQuery;

  /**
   * key - for table, the key is column name. If it's '_row', then a action column is added
   */
  drilldown?: Record<string, PanelDescriptor>;
}

// Action Column interface
export interface ActionColumn {
  // Title for the action column header, default is 'Action'
  title?: string;
  // Alignment of the action title in column, default is 'center'
  align?: "left" | "right" | "center";
  // Render function for action buttons/cells
  renderAction: (row: Record<string, unknown>, rowIndex: number) => React.ReactNode;
  // Position in the table (for ordering) starting from 1, relative to data columns.
  // If not provided, action columns will be shown at the end of the table.
  position?: number;
}

// Miscellaneous options for table display
export interface MiscOption {
  // If true, display an index column as the first column (default: false)
  enableIndexColumn?: boolean;
  // If true, enable expandable rows with transposed detail view (default: false)
  enableShowRowDetail?: boolean;
  // If true, enable compact mode for table cells (default: false)
  enableCompactMode?: boolean;
}

// Table Descriptor interface
export interface TableDescriptor extends PanelDescriptor {
  type: "table";

  // Field options as Map or Record, where key is the field name
  // If not provided, all fields from data will be shown with default options
  fieldOptions?: Map<string, FieldOption> | Record<string, FieldOption>;

  // Action columns configuration (rendered as separate columns, typically at the end)
  actions?: ActionColumn[];

  // Sorting configuration
  sortOption?: {
    // Initial sorting configuration
    initialSort?: {
      column: string;
      direction: "asc" | "desc";
    };

    // Enable server-side sorting. When enabled, sorting will modify the SQL ORDER BY clause
    // and re-execute the query instead of sorting client-side
    serverSideSorting?: boolean;
  };

  // Header configuration
  headOption?: {
    // If true, the table header will be sticky (fixed at top when scrolling)
    // Default to false
    isSticky?: boolean;
  };

  // Miscellaneous display options
  miscOption?: MiscOption;

  /**
   * Pagination configuration.
   * Currently only server mode is supported by `DashboardPanelTable`.
   */
  pagination?: {
    mode: "server";
    pageSize: number;
  };
}

// Transpose Table Descriptor interface
export interface TransposeTableDescriptor extends PanelDescriptor {
  type: "transpose-table";

  // Field options as Map or Record, where key is the field name
  // The title property will be used to show the text in the name column
  // If not provided, all fields from data will be shown with default options
  fieldOptions?: Map<string, FieldOption> | Record<string, FieldOption>;
}

// Reducer type for stat charts
export type Reducer = "min" | "max" | "avg" | "sum" | "count" | "first" | "last";

/**
 * Apply a reducer function to an array of numbers
 * @param data - Array of numbers (may contain null/undefined values which will be filtered out)
 * @param reducer - The reducer type to apply
 * @returns The reduced value, or 0 if no valid data
 */
export function applyReducer(data: (number | null | undefined)[], reducer: Reducer): number {
  // Filter out null and undefined values
  const values = data.filter((v): v is number => v !== null && v !== undefined);

  if (values.length === 0) {
    return 0;
  }

  switch (reducer) {
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "sum":
      return values.reduce((acc, val) => acc + val, 0);
    case "count":
      return values.length;
    case "first":
      return values[0];
    case "last":
      return values[values.length - 1];
    case "avg":
      return values.reduce((acc, val) => acc + val, 0) / values.length;
  }
}

// Minimap Option type for stat charts
export type MinimapOption = {
  type: "line" | "area" | "none";
};

// Stat Descriptor interface
export interface StatDescriptor extends PanelDescriptor {
  type: "stat";

  // Minimap style for stat chart
  minimapOption?: MinimapOption;

  comparisonOption?: {
    offset: string;
  };

  // Value reducer option for stat chart
  valueOption?: {
    reducer?: Reducer;

    // Style
    textSize?: number;
    textColor?: string;

    // Default to center
    align?: "left" | "center" | "right";

    format?: FormatName;
  };
}

// Timeseries Descriptor interface
export interface TimeseriesDescriptor extends PanelDescriptor {
  type: "line" | "bar" | "area";

  // Field options as Map or Record, where key is the field name
  // If not provided, all fields from data will be shown with default options
  fieldOptions?: Map<string, FieldOption> | Record<string, FieldOption>;

  // Y-axis configuration
  yAxis?: {
    min?: number;
    minInterval?: number;
    interval?: number;
    inverse?: boolean;
    format?: FormatName;
  }[];

  // Legend configuration
  legendOption?: {
    // If not given, it defaults to the 'inside'. Use 'none' to hide the legend.
    placement: "bottom" | "inside" | "none";
    values?: Reducer[];
  };

  tooltipOption?: {
    sortValue: "asc" | "desc" | "none";
  };

  // Stacking configuration for bar charts
  stacked?: boolean;
}

// Pie Descriptor interface
export interface PieDescriptor extends PanelDescriptor {
  type: "pie";

  // Field options as Map or Record, where key is the field name
  // If not provided, all fields from data will be shown with default options
  fieldOptions?: Map<string, FieldOption> | Record<string, FieldOption>;

  // Legend configuration
  legendOption?: {
    // If not given, it defaults to the 'inside'. Use 'none' to hide the legend.
    placement: "bottom" | "inside" | "right" | "none";
  };

  // Label configuration
  labelOption?: {
    // Show labels on the pie chart
    show?: boolean;
    // Label format: "name", "value", "percent", "name-value", "name-percent"
    format?: "name" | "value" | "percent" | "name-value" | "name-percent";
  };

  // Value format for the pie chart
  valueFormat?: FormatName;
}

// Gauge Descriptor interface
export interface GaugeDescriptor extends PanelDescriptor {
  type: "gauge";

  // Field options as Map or Record, where key is the field name
  // If not provided, the first numeric column will be used as the value
  fieldOptions?: Map<string, FieldOption> | Record<string, FieldOption>;

  // Gauge configuration
  gaugeOption?: {
    // Minimum value (default: 0)
    min?: number;
    // Maximum value (default: 100)
    max?: number;
    // Number of split segments (default: 10)
    splitNumber?: number;
    // Show axis line (default: true)
    showAxisLine?: boolean;
    // Show split line (default: true)
    showSplitLine?: boolean;
    // Show axis tick (default: true)
    showAxisTick?: boolean;
    // Show axis label (default: true)
    showAxisLabel?: boolean;
    // Show pointer (default: true)
    showPointer?: boolean;
    // Show detail (default: true)
    showDetail?: boolean;
    // Detail formatter (default: "{value}%")
    detailFormatter?: string;
    // Value format for the gauge
    valueFormat?: FormatName;
  };
}

export type DashboardFilter = {
  selectors?: SelectorUI[];
  showTimeSpanSelector?: boolean;
  showRefresh?: boolean;
  showAutoRefresh?: boolean;
};

export type DashboardGroup = {
  title: string;
  charts: PanelDescriptor[];
  collapsed?: boolean;
};

export type Dashboard = {
  name?: string;
  version: 3; // Dashboard version: must be 3 (gridPos system). Legacy versions 1 and 2 are no longer supported.
  filter: DashboardFilter;
  charts: (PanelDescriptor | DashboardGroup)[];
};

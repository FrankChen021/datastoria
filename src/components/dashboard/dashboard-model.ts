import type React from "react";
import type { FormatName, ObjectFormatter } from "@/lib/formatter";

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

// Formatter function type
export interface FormatterFn {
  (value: string | number | Date): string | React.ReactNode;
}

// SQL Query interface
export interface SQLQuery {
  sql: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;

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
  data: any[];
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
  formatArgs?: any[];

  yAxis?: number;
  inverse?: boolean;
  chartType?: string;
  fill?: boolean;

  // Action column support: render custom action buttons for each row
  renderAction?: (row: Record<string, unknown>, rowIndex: number) => React.ReactNode;

  // Position in the table (for ordering). If not provided, columns will be shown in data order.
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
  type: string; // "line" | "bar" | "pie" | "scatter" | "heatmap" | "table" | "map" | "custom" | "stat"

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

  query: SQLQuery;

  /**
   * key - for table, the key is column name. If it's '_row', then a action column is added
   */
  drilldown?: Record<string, PanelDescriptor>;
}

// Action Column interface
export interface ActionColumn {
  // Title for the action column header, default is 'Action'
  title?: string;
  // Alignment of the action column, default is 'center'
  align?: "left" | "right" | "center";
  // Render function for action buttons/cells
  renderAction: (row: Record<string, unknown>, rowIndex: number) => React.ReactNode;
}

// Table Descriptor interface
export interface TableDescriptor extends PanelDescriptor {
  type: "table";

  // Field options as Map or Record, where key is the field name
  // If not provided, all fields from data will be shown with default options
  fieldOptions?: Map<string, FieldOption> | Record<string, FieldOption>;

  // Action columns configuration (rendered as separate columns, typically at the end)
  actions?: ActionColumn | ActionColumn[];

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

  // If true, display an index column as the first column (default: false)
  showIndexColumn?: boolean;
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
  legend?: {
    // If not given, it defaults to the 'inside'. Use 'none' to hide the legend.
    placement: "bottom" | "right" | "inside" | "none";
    values: ("min" | "max" | "sum" | "avg" | "count")[];
  };

  tooltipOption?: {
    sortValue: "asc" | "desc" | "none";
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
  charts: any[];
  collapsed?: boolean;
};

export type Dashboard = {
  version?: number; // Dashboard version: 1 = 4-column system, 2 = 24-column system, 3 = gridPos system, default to 1 if missing
  filter: DashboardFilter;
  charts: (any | DashboardGroup)[];
};

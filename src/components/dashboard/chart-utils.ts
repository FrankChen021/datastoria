import type { FormatName } from "@/lib/formatter";
import type { ChartOptionBuilder, ChartRenderer } from "./chart-pie";
import { PieChartOptionBuilder, PieChartRenderer } from "./chart-pie";
import {
  TimeSeriesChartBuilder as TimeSeriesChartBuilderImpl,
  TimeSeriesRenderer as TimeSeriesRendererImpl,
} from "./chart-timeseries";

export interface FormatterFn {
  (value: string | number | Date): string | React.ReactNode;
}

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

interface ChartOption {
  yAxisFormatters: FormatterFn[];
  option: any;
}

export interface YAxisOption {
  min?: number;
  minInterval?: number;
  interval?: number;
  inverse?: boolean;
  format?: FormatName;
}

// TracingSpec is not used but kept for compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/ban-ts-comment
// @ts-expect-error - Unused but kept for compatibility
type TracingSpec = {
  mappings?: Map<string, object>;

  // Legacy name
  dimensionMaps?: Map<string, object>;

  filter?: string;
};

export interface ThresholdSpec {
  value: number;
  displayText: string;
  color: string;
}

// For time series chart to show
export interface MarkerSpec {
  start: number;
  end: number;
}

export interface LegendSpec {
  // If not given, it defaults to the 'inside'. Use 'none' to hide the legend.
  placement: "bottom" | "right" | "inside" | "none";
  values: ("min" | "max" | "sum" | "avg" | "count")[];
}

export interface TitleOption {
  title: string;
  link?: string;
  description?: string;

  // Default to center
  align?: "left" | "center" | "right";

  // Default to true. If false, the title bar will not be rendered
  showTitle?: boolean;
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

  align?: "left" | "right" | "center";

  format?: FormatName;
  // Arguments to pass to the formatter function
  formatArgs?: any[];

  yAxis?: number;
  inverse?: boolean;
  chartType?: string;
  fill?: boolean;

  // Action column support: render custom action buttons for each row
  renderAction?: (row: Record<string, unknown>, rowIndex: number) => React.ReactNode;
}

export interface QueryResponse {
  startTimestamp: number;
  endTimestamp: number;
  interval: number;
  data: any[];
}

export interface JsonQuery extends SQLQuery {
  type?: string;
  dataSource?: string;
  mql?: string;
  filterExpression?: string;
  fields?: any[];
  limit?: number;
  orderBy?: { name: string; order: string };
  groupBy?: any[];
  window?: any;
}

export interface ChartDescriptor {
  type: string; // "line" | "bar" | "pie" | "scatter" | "heatmap" | "table" | "map" | "custom" | "stat"
  id?: string;

  titleOption?: TitleOption;

  // If not given, it defaults to false
  isCollapsed?: boolean;

  width: number;
  height?: number;

  query: SQLQuery;

  /**
   * key - for table, the key is column name. If it's '_row', then a action column is added
   */
  drilldown?: Record<string, ChartDescriptor>;
}

export interface SortOption {
  // Initial sorting configuration
  initialSort?: {
    column: string;
    direction: "asc" | "desc";
  };

  // Enable server-side sorting. When enabled, sorting will modify the SQL ORDER BY clause
  // and re-execute the query instead of sorting client-side
  serverSideSorting?: boolean;
}

export interface HeadOption {
  // If true, the table header will be sticky (fixed at top when scrolling)
  // Default to false
  isSticky?: boolean;
}

export interface TableDescriptor extends ChartDescriptor {
  type: "table";

  columns: (ColumnDef | string)[];

  // Sorting configuration
  sortOption?: SortOption;

  // Header configuration
  headOption?: HeadOption;
}

// Custom renderer for specific keys in transposed table
export type TransposedValueRenderer = (key: string, value: unknown) => React.ReactNode;

export interface TransposeTableDescriptor extends ChartDescriptor {
  type: "transpose-table";

  // Optional custom renderers for specific keys
  // If a key is not in this map, default formatting will be used
  valueRenderers?: Map<string, TransposedValueRenderer> | Record<string, TransposedValueRenderer>;
}

export type Reducer = "min" | "max" | "avg" | "sum" | "count" | "first" | "last";

export type MinimapOption = {
  type: "line" | "area" | "none";
};

export type ComparisonOption = {
  offset: string;
};

export interface StatDescriptor extends ChartDescriptor {
  type: "stat";

  // Minimap style for stat chart
  minimapOption?: MinimapOption;

  comparisonOption?: ComparisonOption;

  // Value reducer option for stat chart
  valueOption?: {
    reducer: Reducer;

    // Style
    textSize?: number;
    textColor?: string;

    // Default to center
    align?: "left" | "center" | "right";

    format?: FormatName;
  };
}

export interface TimeseriesDescriptor extends ChartDescriptor {
  type: "line" | "bar" | "area";

  // Columns for time series data
  columns: (ColumnDef | string)[];

  // Y-axis configuration
  yAxis?: YAxisOption[];

  // Legend configuration
  legend?: LegendSpec;
}

// Factory function to get the appropriate option builder
function getChartOptionBuilder(chartType: string): ChartOptionBuilder {
  switch (chartType) {
    case "pie":
      return new PieChartOptionBuilder();
    case "line":
    case "bar":
    case "area":
    default:
      return new TimeSeriesChartBuilderImpl();
  }
}

export function toEChartOption(chartDescriptor: ChartDescriptor): ChartOption {
  // Use the option builder pattern for different chart types
  const optionBuilder = getChartOptionBuilder(chartDescriptor.type);
  return optionBuilder.build(chartDescriptor);
}

// Factory function to get the appropriate renderer
export function getChartRenderer(chartType: string): ChartRenderer {
  switch (chartType) {
    case "pie":
      return new PieChartRenderer();
    case "line":
    case "bar":
    case "area":
    default:
      return new TimeSeriesRendererImpl();
  }
}

export function toEChartSeriesOption(
  chartDescriptor: ChartDescriptor,
  yAxisFormatters: FormatterFn[],
  columnMap: Map<string, ColumnDef>,
  queryResponse: QueryResponse
) {
  const renderer = getChartRenderer(chartDescriptor.type);
  return renderer.renderSeries(chartDescriptor, yAxisFormatters, columnMap, queryResponse);
}

function toDetailTableDescriptor(expr: AlertExpression): ChartDescriptor {
  const chartDescriptor: ChartDescriptor = {
    type: "table",
    title: expr.expressionText,
    columns: [],
    width: 100, // Required field
    query: {
      sql: "", // Required for SQLQuery
      type: "list",
      dataSource: expr.from,
      interval: {
        startISO8601: "2021-01-01T00:00:00Z",
        endISO8601: "2021-01-02T00:00:00Z",
        step: 60,
      },
      filterExpression: expr.where,
      fields: ["*"],
      limit: 15,
      orderBy: { name: expr.select.field || "", order: "asc" },
    } as JsonQuery,
  };
  return chartDescriptor;
}

export function toChartDescriptor(expr: AlertExpression): ChartDescriptor {
  const yAxsis: YAxisOption[] = [{}];
  const columns = [{ name: expr.select.name, fill: false } as ColumnDef];

  // For percentage expr, add a base and delta columns
  if (expr.offset && typeof expr.alertExpected === "object" && expr.alertExpected.type === "percentage") {
    // When this expr is a relative percentage expr, add a column 'delta'
    columns.push({ name: expr.offset, fill: false } as ColumnDef);
    columns.push({ name: "delta", yAxis: 1, fill: false } as ColumnDef);

    yAxsis.push({ format: "percentage_0_1", min: -1 });
  }

  const threshold: ThresholdSpec = {
    value: 0,
    displayText: "0",
    color: "red",
  };
  if (typeof expr.alertExpected === "object") {
    threshold.value = expr.alertExpected.value;
    threshold.displayText = expr.alertExpected.text;
  } else {
    threshold.value = expr.alertExpected as number;
    threshold.displayText = "" + (expr.alertExpected as number);
  }

  const chartDescriptor: ChartDescriptor = {
    type: "line",
    id: expr.id,
    title: expr.expressionText,
    yAxis: yAxsis,
    columns: columns,
    width: 100, // Required field
    query: {
      sql: "", // Required for SQLQuery
      type: "timeseries",
      mql: expr.expressionText,
      dataSource: expr.from,
      interval: {
        startISO8601: "2021-01-01T00:00:00Z",
        endISO8601: "2021-01-02T00:00:00Z",
        step: 60, // TODO: SHOULD use the 'every' field
        window: expr.window,
      },
      filterExpression: expr.where,
      fields: [expr.select],
      groupBy: expr.groupBy,
    } as JsonQuery,

    threshold: threshold,

    details: toDetailTableDescriptor(expr),
  };
  return chartDescriptor;
}

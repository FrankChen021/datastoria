import type { FormatName } from "@/lib/formatter";
import { ChartOptionBuilder, ChartRenderer, PieChartOptionBuilder, PieChartRenderer } from "./chart-pie";
import { TimeSeriesChartBuilder, TimeSeriesRenderer } from "./chart-time-series";

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

interface TracingSpec {
  mappings?: Map<string, object>;

  // Legacy name
  dimensionMaps?: Map<string, object>;

  filter?: string;
}

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

  yAxis?: number;
  inverse?: boolean;
  chartType?: string;
  fill?: boolean;
}

export interface ChartDescriptor {
  type: string; // "line" | "bar" | "pie" | "scatter" | "heatmap" | "table" | "map" | "custom" | "stat"
  id?: string;

  // Deprecated, use titleOption
  title: string;
  // Deprecated, use titleOption
  link?: string;
  titleOption?: TitleOption;

  // If not given, it defaults to false
  isCollapsed?: boolean;

  columns: (ColumnDef | string)[];

  yAxis?: YAxisOption[];

  data?: number[];
  labels?: string[];
  width: number;
  height?: number;

  query: SQLQuery;
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
  };
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
      return new TimeSeriesChartBuilder();
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
      return new TimeSeriesRenderer();
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
  const chartDescriptor = {
    type: "table",
    title: expr.expressionText,
    columns: [],
    query: {
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
      orderBy: { name: expr.select.field, order: "asc" },
    } as JsonQuery,
  } as ChartDescriptor;
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

  const chartDescriptor = {
    type: "line",
    id: expr.id,
    title: expr.expressionText,
    yAxis: yAxsis,
    columns: columns,
    query: {
      type: "timeseries",
      mql: expr.expressionText,
      dataSource: expr.from,
      interval: {
        startISO8601: "2021-01- 01T00:00:00Z",
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
  } as ChartDescriptor;
  return chartDescriptor;
}

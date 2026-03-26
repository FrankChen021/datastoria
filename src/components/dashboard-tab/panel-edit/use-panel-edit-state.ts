"use client";

import type {
  GaugeDescriptor,
  GridPos,
  LegendPlacement,
  PanelDescriptor,
  PieDescriptor,
  Reducer,
  StatDescriptor,
  TableDescriptor,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import { useCallback, useEffect, useRef, useState } from "react";

export type ChartType = "stat" | "line" | "bar" | "area" | "pie" | "gauge" | "table";

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  stat: "Stat",
  line: "Line",
  bar: "Bar",
  area: "Area",
  pie: "Pie",
  gauge: "Gauge",
  table: "Table",
};

/**
 * Built-in widget templates with pre-filled SQL queries
 */
export interface WidgetTemplate {
  name: string;
  description: string;
  chartType: ChartType;
  sql: string;
  gridW: number;
  gridH: number;
}

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    name: "Total Rows",
    description: "Count of rows in a table",
    chartType: "stat",
    sql: "SELECT count() AS value FROM system.parts WHERE active",
    gridW: 6,
    gridH: 4,
  },
  {
    name: "Query Rate",
    description: "Queries per second over time",
    chartType: "line",
    sql: `SELECT
  toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND) AS time,
  count() / {rounding:UInt32} AS qps
FROM system.query_log
WHERE {timeFilter}
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
GROUP BY time
ORDER BY time`,
    gridW: 12,
    gridH: 6,
  },
  {
    name: "Top Tables by Size",
    description: "Largest tables by disk usage",
    chartType: "bar",
    sql: `SELECT
  concat(database, '.', table) AS name,
  sum(bytes_on_disk) AS size
FROM system.parts
WHERE active
GROUP BY database, table
ORDER BY size DESC
LIMIT 10`,
    gridW: 12,
    gridH: 6,
  },
  {
    name: "Database Size Distribution",
    description: "Pie chart of database sizes",
    chartType: "pie",
    sql: `SELECT
  database AS name,
  sum(bytes_on_disk) AS value
FROM system.parts
WHERE active
GROUP BY database
ORDER BY value DESC
LIMIT 10`,
    gridW: 8,
    gridH: 8,
  },
  {
    name: "Memory Usage",
    description: "Current memory usage percentage",
    chartType: "gauge",
    sql: `SELECT
  round(
    (SELECT value FROM system.asynchronous_metrics WHERE metric = 'OSMemoryTotal')
    /
    (SELECT total_value FROM system.asynchronous_metrics WHERE metric = 'OSMemoryTotal')
    * 100, 1
  ) AS value`,
    gridW: 6,
    gridH: 6,
  },
  {
    name: "Recent Queries",
    description: "Table of recent query log entries",
    chartType: "table",
    sql: `SELECT
  type,
  query_id,
  user,
  query_duration_ms,
  read_rows,
  result_rows,
  formatReadableSize(memory_usage) AS memory,
  substring(query, 1, 100) AS query_preview
FROM system.query_log
WHERE {timeFilter}
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
ORDER BY event_time DESC
LIMIT 50`,
    gridW: 24,
    gridH: 8,
  },
];

// Type-specific options that can be edited in the sidebar
export interface StatOptions {
  minimapType: "line" | "area" | "none";
  reducer: "min" | "max" | "avg" | "sum" | "count" | "first" | "last";
  format: string;
}

export interface TimeseriesOptions {
  legendMode: "list" | "table" | "none";
  legendPlacement: LegendPlacement;
  legendValues: "simple" | "detailed" | "full";
  yAxisFormat: string;
  stacked: boolean;
}

export interface PieOptions {
  legendPlacement: "bottom" | "inside" | "right" | "none";
  labelFormat: "name" | "value" | "percent" | "name-value" | "name-percent";
}

export interface GaugeOptions {
  min: number;
  max: number;
  valueFormat: string;
}

export interface TableOptions {
  stickyHeader: boolean;
  serverSideSorting: boolean;
}

const DEFAULT_STAT_OPTIONS: StatOptions = {
  minimapType: "area",
  reducer: "last",
  format: "short_number",
};

const DEFAULT_TIMESERIES_OPTIONS: TimeseriesOptions = {
  legendMode: "list",
  legendPlacement: "bottom",
  legendValues: "simple",
  yAxisFormat: "short_number",
  stacked: false,
};

function reducersToLegendValues(values?: Reducer[]): "simple" | "detailed" | "full" {
  if (!values || values.length <= 1) return "simple";
  if (values.length <= 3) return "detailed";
  return "full";
}

const DEFAULT_PIE_OPTIONS: PieOptions = {
  legendPlacement: "right",
  labelFormat: "name-percent",
};

const DEFAULT_GAUGE_OPTIONS: GaugeOptions = {
  min: 0,
  max: 100,
  valueFormat: "",
};

const DEFAULT_TABLE_OPTIONS: TableOptions = {
  stickyHeader: false,
  serverSideSorting: false,
};

export interface PanelEditState {
  chartType: ChartType;
  title: string;
  sql: string;
  gridW: number;
  gridH: number;

  statOptions: StatOptions;
  timeseriesOptions: TimeseriesOptions;
  pieOptions: PieOptions;
  gaugeOptions: GaugeOptions;
  tableOptions: TableOptions;

  previewDescriptor: PanelDescriptor | null;
  previewKey: number;
  isDirty: boolean;
}

export function usePanelEditState(editingPanel?: PanelDescriptor | null) {
  // Preserved original descriptor for merging non-UI options
  const originalDescriptorRef = useRef<PanelDescriptor | null>(editingPanel ?? null);

  const [chartType, setChartTypeState] = useState<ChartType>(() =>
    editingPanel ? (editingPanel.type as ChartType) : "line"
  );
  const [title, setTitleState] = useState(() => editingPanel?.titleOption?.title ?? "");
  const [sql, setSqlState] = useState(() => editingPanel?.datasource?.sql ?? "");
  const [gridW, setGridW] = useState(() => editingPanel?.gridPos?.w ?? 12);
  const [gridH, setGridH] = useState(() => editingPanel?.gridPos?.h ?? 6);

  const [statOptions, setStatOptions] = useState<StatOptions>(() =>
    extractStatOptions(editingPanel)
  );
  const [timeseriesOptions, setTimeseriesOptions] = useState<TimeseriesOptions>(() =>
    extractTimeseriesOptions(editingPanel)
  );
  const [pieOptions, setPieOptions] = useState<PieOptions>(() => extractPieOptions(editingPanel));
  const [gaugeOptions, setGaugeOptions] = useState<GaugeOptions>(() =>
    extractGaugeOptions(editingPanel)
  );
  const [tableOptions, setTableOptions] = useState<TableOptions>(() =>
    extractTableOptions(editingPanel)
  );

  const [previewDescriptor, setPreviewDescriptor] = useState<PanelDescriptor | null>(() =>
    editingPanel
      ? buildDescriptorFromState(
          editingPanel.type as ChartType,
          editingPanel.titleOption?.title ?? "",
          editingPanel.datasource?.sql ?? "",
          editingPanel.gridPos?.w ?? 12,
          editingPanel.gridPos?.h ?? 6,
          extractStatOptions(editingPanel),
          extractTimeseriesOptions(editingPanel),
          extractPieOptions(editingPanel),
          extractGaugeOptions(editingPanel),
          extractTableOptions(editingPanel),
          editingPanel
        )
      : null
  );
  const [previewKey, setPreviewKey] = useState(0);
  const [isDirty, setIsDirty] = useState(false);

  // Track whether a preview has been created (either from editing or from running a query)
  const hasPreviewRef = useRef(!!editingPanel);
  // Keep a ref to the latest sql so the auto-update effect uses current sql
  // without re-firing on every keystroke
  const sqlRef = useRef(sql);
  sqlRef.current = sql;

  const markDirty = useCallback(() => setIsDirty(true), []);

  const setTitle = useCallback(
    (value: string) => {
      setTitleState(value);
      markDirty();
    },
    [markDirty]
  );

  const setSql = useCallback(
    (value: string) => {
      setSqlState(value);
      markDirty();
    },
    [markDirty]
  );

  const setChartType = useCallback(
    (type: ChartType) => {
      setChartTypeState(type);
      markDirty();
    },
    [markDirty]
  );

  const setGridSize = useCallback(
    (w: number, h: number) => {
      setGridW(w);
      setGridH(h);
      markDirty();
    },
    [markDirty]
  );

  const updateStatOptions = useCallback(
    (partial: Partial<StatOptions>) => {
      setStatOptions((prev) => ({ ...prev, ...partial }));
      markDirty();
    },
    [markDirty]
  );

  const updateTimeseriesOptions = useCallback(
    (partial: Partial<TimeseriesOptions>) => {
      setTimeseriesOptions((prev) => ({ ...prev, ...partial }));
      markDirty();
    },
    [markDirty]
  );

  const updatePieOptions = useCallback(
    (partial: Partial<PieOptions>) => {
      setPieOptions((prev) => ({ ...prev, ...partial }));
      markDirty();
    },
    [markDirty]
  );

  const updateGaugeOptions = useCallback(
    (partial: Partial<GaugeOptions>) => {
      setGaugeOptions((prev) => ({ ...prev, ...partial }));
      markDirty();
    },
    [markDirty]
  );

  const updateTableOptions = useCallback(
    (partial: Partial<TableOptions>) => {
      setTableOptions((prev) => ({ ...prev, ...partial }));
      markDirty();
    },
    [markDirty]
  );

  const runQuery = useCallback(() => {
    const descriptor = buildDescriptorFromState(
      chartType,
      title,
      sql,
      gridW,
      gridH,
      statOptions,
      timeseriesOptions,
      pieOptions,
      gaugeOptions,
      tableOptions,
      originalDescriptorRef.current
    );
    setPreviewDescriptor(descriptor);
    setPreviewKey((k) => k + 1);
    hasPreviewRef.current = true;
  }, [
    chartType,
    title,
    sql,
    gridW,
    gridH,
    statOptions,
    timeseriesOptions,
    pieOptions,
    gaugeOptions,
    tableOptions,
  ]);

  // Auto-update preview when visual options change (without re-running the query).
  // This lets the user see chart type, legend, title, grid size, etc. changes
  // reflected immediately. SQL changes still require an explicit "Run Query".
  useEffect(() => {
    if (!hasPreviewRef.current) return;

    const updated = buildDescriptorFromState(
      chartType,
      title,
      sqlRef.current,
      gridW,
      gridH,
      statOptions,
      timeseriesOptions,
      pieOptions,
      gaugeOptions,
      tableOptions,
      originalDescriptorRef.current
    );
    setPreviewDescriptor(updated);
  }, [
    chartType,
    title,
    gridW,
    gridH,
    statOptions,
    timeseriesOptions,
    pieOptions,
    gaugeOptions,
    tableOptions,
  ]);

  const buildDescriptor = useCallback((): PanelDescriptor | null => {
    if (!title.trim() || !sql.trim()) return null;
    return buildDescriptorFromState(
      chartType,
      title,
      sql,
      gridW,
      gridH,
      statOptions,
      timeseriesOptions,
      pieOptions,
      gaugeOptions,
      tableOptions,
      originalDescriptorRef.current
    );
  }, [
    chartType,
    title,
    sql,
    gridW,
    gridH,
    statOptions,
    timeseriesOptions,
    pieOptions,
    gaugeOptions,
    tableOptions,
  ]);

  const applyTemplate = useCallback(
    (template: WidgetTemplate) => {
      setChartTypeState(template.chartType);
      setTitleState(template.name);
      setSqlState(template.sql);
      setGridW(template.gridW);
      setGridH(template.gridH);
      markDirty();
    },
    [markDirty]
  );

  const isValid = title.trim().length > 0 && sql.trim().length > 0;

  return {
    // State
    chartType,
    title,
    sql,
    gridW,
    gridH,
    statOptions,
    timeseriesOptions,
    pieOptions,
    gaugeOptions,
    tableOptions,
    previewDescriptor,
    previewKey,
    isDirty,
    isValid,

    // Actions
    setChartType,
    setTitle,
    setSql,
    setGridSize,
    updateStatOptions,
    updateTimeseriesOptions,
    updatePieOptions,
    updateGaugeOptions,
    updateTableOptions,
    runQuery,
    buildDescriptor,
    applyTemplate,
  };
}

// --- Helper functions ---

function extractStatOptions(panel?: PanelDescriptor | null): StatOptions {
  if (!panel || panel.type !== "stat") return DEFAULT_STAT_OPTIONS;
  const d = panel as StatDescriptor;
  return {
    minimapType: d.minimapOption?.type ?? "area",
    reducer: d.valueOption?.reducer ?? "last",
    format: d.valueOption?.format ?? "short_number",
  };
}

function extractTimeseriesOptions(panel?: PanelDescriptor | null): TimeseriesOptions {
  if (!panel || (panel.type !== "line" && panel.type !== "bar" && panel.type !== "area"))
    return DEFAULT_TIMESERIES_OPTIONS;
  const d = panel as TimeseriesDescriptor;
  const placement = d.legendOption?.placement;
  const mode = d.legendOption?.mode;

  // Backwards compat: infer mode from placement if mode is not set
  const legendPlacement: TimeseriesOptions["legendPlacement"] = placement ?? "bottom";
  let legendMode: TimeseriesOptions["legendMode"];
  if (mode) {
    legendMode = mode;
  } else if (placement === "none") {
    legendMode = "none";
  } else if (placement === "bottom") {
    legendMode = "table";
  } else {
    // "inside" or undefined → list
    legendMode = "list";
  }

  return {
    legendMode,
    legendPlacement,
    legendValues: reducersToLegendValues(d.legendOption?.values),
    yAxisFormat: d.yAxis?.[0]?.format ?? "short_number",
    stacked: d.stacked ?? false,
  };
}

function extractPieOptions(panel?: PanelDescriptor | null): PieOptions {
  if (!panel || panel.type !== "pie") return DEFAULT_PIE_OPTIONS;
  const d = panel as PieDescriptor;
  return {
    legendPlacement: d.legendOption?.placement ?? "right",
    labelFormat: d.labelOption?.format ?? "name-percent",
  };
}

function extractGaugeOptions(panel?: PanelDescriptor | null): GaugeOptions {
  if (!panel || panel.type !== "gauge") return DEFAULT_GAUGE_OPTIONS;
  const d = panel as GaugeDescriptor;
  return {
    min: d.gaugeOption?.min ?? 0,
    max: d.gaugeOption?.max ?? 100,
    valueFormat: d.gaugeOption?.valueFormat ?? "",
  };
}

function extractTableOptions(panel?: PanelDescriptor | null): TableOptions {
  if (!panel || panel.type !== "table") return DEFAULT_TABLE_OPTIONS;
  const d = panel as TableDescriptor;
  return {
    stickyHeader: d.headOption?.isSticky ?? false,
    serverSideSorting: d.sortOption?.serverSideSorting ?? false,
  };
}

function buildDescriptorFromState(
  chartType: ChartType,
  title: string,
  sql: string,
  gridW: number,
  gridH: number,
  statOpts: StatOptions,
  timeseriesOpts: TimeseriesOptions,
  pieOpts: PieOptions,
  gaugeOpts: GaugeOptions,
  tableOpts: TableOptions,
  originalDescriptor?: PanelDescriptor | null
): PanelDescriptor {
  const gridPos: GridPos = { w: gridW, h: gridH };

  const base: PanelDescriptor = {
    type: chartType,
    titleOption: { title: title.trim() },
    gridPos,
    datasource: { sql: sql.trim() },
  };

  // Preserve any fields from the original descriptor that aren't managed by the UI
  switch (chartType) {
    case "stat": {
      const original =
        originalDescriptor?.type === "stat" ? (originalDescriptor as StatDescriptor) : undefined;
      return {
        ...base,
        type: "stat",
        minimapOption: { type: statOpts.minimapType },
        valueOption: {
          ...original?.valueOption,
          reducer: statOpts.reducer,
          format: statOpts.format,
        },
        comparisonOption: original?.comparisonOption,
      } as StatDescriptor;
    }
    case "line":
    case "bar":
    case "area": {
      const original =
        originalDescriptor?.type === chartType
          ? (originalDescriptor as TimeseriesDescriptor)
          : undefined;
      return {
        ...base,
        type: chartType,
        legendOption: { placement: timeseriesOpts.legendPlacement },
        yAxis: [
          {
            ...original?.yAxis?.[0],
            format: timeseriesOpts.yAxisFormat,
          },
        ],
        tooltipOption: original?.tooltipOption,
        stacked: timeseriesOpts.stacked,
        fieldOptions: original?.fieldOptions,
      } as TimeseriesDescriptor;
    }
    case "pie": {
      const original =
        originalDescriptor?.type === "pie" ? (originalDescriptor as PieDescriptor) : undefined;
      return {
        ...base,
        type: "pie",
        legendOption: { placement: pieOpts.legendPlacement },
        labelOption: {
          show: true,
          format: pieOpts.labelFormat,
        },
        valueFormat: original?.valueFormat,
        fieldOptions: original?.fieldOptions,
      } as PieDescriptor;
    }
    case "gauge": {
      const original =
        originalDescriptor?.type === "gauge" ? (originalDescriptor as GaugeDescriptor) : undefined;
      return {
        ...base,
        type: "gauge",
        gaugeOption: {
          ...original?.gaugeOption,
          min: gaugeOpts.min,
          max: gaugeOpts.max,
          valueFormat: gaugeOpts.valueFormat,
        },
        fieldOptions: original?.fieldOptions,
      } as GaugeDescriptor;
    }
    case "table": {
      const original =
        originalDescriptor?.type === "table" ? (originalDescriptor as TableDescriptor) : undefined;
      return {
        ...base,
        type: "table",
        headOption: { isSticky: tableOpts.stickyHeader },
        sortOption: {
          ...original?.sortOption,
          serverSideSorting: tableOpts.serverSideSorting,
        },
        fieldOptions: original?.fieldOptions,
        pagination: original?.pagination,
        miscOption: original?.miscOption,
        actions: original?.actions,
      } as TableDescriptor;
    }
    default:
      return base;
  }
}

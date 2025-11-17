import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter, type ObjectFormatter } from "@/lib/formatter";
import type { PanelDescriptor, ColumnDef, FormatterFn, QueryResponse, TimeseriesDescriptor } from "./dashboard-model";

// Type guard to check if format is an ObjectFormatter
function isObjectFormatter(format: string | ObjectFormatter): format is ObjectFormatter {
  return typeof format !== "string";
}

// Base interfaces
export interface ChartRenderer {
  renderSeries(
    chartDescriptor: PanelDescriptor,
    yAxisFormatters: FormatterFn[],
    columnMap: Map<string, ColumnDef>,
    queryResponse: QueryResponse
  ): any;
}

export interface ChartOptionBuilder {
  build(chartDescriptor: PanelDescriptor): { yAxisFormatters: FormatterFn[]; option: any };
}

// Time series renderer for line, bar, and area charts
export class TimeSeriesRenderer implements ChartRenderer {
  renderSeries(
    chartDescriptor: PanelDescriptor,
    yAxisFormatters: FormatterFn[],
    columnMap: Map<string, ColumnDef>,
    queryResponse: QueryResponse
  ): any {
    const timeLabels = [];
    for (let t = queryResponse.startTimestamp; t <= queryResponse.endTimestamp; t += queryResponse.interval) {
      timeLabels.push(DateTimeExtension.formatDateTime(new Date(t), "HH:mm:ss"));
    }

    const timeseriesDescriptor = chartDescriptor as TimeseriesDescriptor;
    const columns = timeseriesDescriptor.fieldOptions 
      ? (timeseriesDescriptor.fieldOptions instanceof Map
          ? Array.from(timeseriesDescriptor.fieldOptions.values())
          : Object.values(timeseriesDescriptor.fieldOptions))
      : [];
    const hasMultipleMetrics = columns.length > 1;

    const series = [];
    queryResponse.data.forEach((metric: { tags: string[]; values: number[] }) => {
      // The last tag is the metric name
      const metricName = metric.tags[metric.tags.length - 1];

      const column = columnMap.get(metricName);
      if (column === undefined) {
        console.warn(`Cant find definition of ${metricName}`);
        return;
      }

      // Use column's chartType if defined, otherwise fall back to descriptor's type, then default to "line"
      const chartType = column.chartType || chartDescriptor.type || "line";
      const isLine = chartType === "line";
      const isArea = isLine && (column.fill === undefined ? true : column.fill);
      const isBar = chartType === "bar";

      // Concat multiple BY fields as series name
      let title = column.title === undefined ? column.name : column.title;
      let group = "";
      for (let i = 0; i < metric.tags.length - 1; i++) {
        if (group !== "") {
          group += "-";
        }
        group += metric.tags[i];
      }

      if (hasMultipleMetrics) {
        // If there're multiple series, display the metric for each series
        title = group !== "" ? group + "-" + title : title;
      } else {
        // otherwise show the group only for short
        if (group !== "") {
          title = group;
        }
      }

      // Set the BY fields in a Map for Legend use
      const by: Record<string, string> = {};
      if ((queryResponse as any).meta) {
        for (let i = 0; i < (queryResponse as any).meta.length - 1; i++) {
          by[(queryResponse as any).meta[i].name] = metric.tags[i];
        }
      }

      //Use the yAxis defined formatter to format the data
      const yAxisIndex = column.yAxis || 0;

      const s = {
        id: title,
        name: title,
        type: chartType,

        by: by,
        data: metric.values,
        yAxisIndex: yAxisIndex,

        areaStyle: isArea ? { opacity: 0.3 } : null,
        lineStyle: isLine ? { width: 1 } : null,

        ...(isLine ? { showSymbol: false } : {}),

        label: {
          show: isBar,
          formatter: (v: any) => {
            if (v.value > 0) {
              const formatterFn = yAxisFormatters[yAxisIndex];
              return formatterFn(v.value);
            } else {
              return "";
            }
          },
        },

        // Limit the max width of a bar so that even if there're few bars, the bar will NOT be shown very large
        // 45 is an appropriate value to hold 5 chars.
        // as in most cases, the number is shown in binary_byte format, 5 chars is the max length
        barMaxWidth: 45,
      };
      series.push(s);
    });

    // a groupBy query might return empty data
    if (series.length === 0) {
      const count = (queryResponse.endTimestamp - queryResponse.startTimestamp) / queryResponse.interval;
      series.push({
        id: "empty",
        name: "empty",
        type: "line",
        by: {},
        data: new Array(count).fill(0),
        yAxisIndex: 0,
        areaStyle: { opacity: 0.3 },
        lineStyle: { width: 1 },
        itemStyle: { opacity: 0 },
        selected: true,
      });
    }

    return {
      legend: {
        data: series.map((s) => ({ name: s.name, icon: "circle" })),
      },
      xAxis: {
        data: timeLabels,
      },
      series: series,
    };
  }
}

// Time series chart option builder
export class TimeSeriesChartBuilder implements ChartOptionBuilder {
  build(chartDescriptor: PanelDescriptor): { yAxisFormatters: FormatterFn[]; option: any } {
    const yAxisFormatters: FormatterFn[] = [];
    const legendOption: { name: string; icon: string }[] = [];

    const timeseriesDescriptor = chartDescriptor as TimeseriesDescriptor;
    
    if (timeseriesDescriptor.yAxis === undefined) {
      timeseriesDescriptor.yAxis = [];
    }

    // Convert fieldOptions to array format for backward compatibility
    let columns: (string | ColumnDef)[] = [];
    if (timeseriesDescriptor.fieldOptions) {
      // Convert Map/Record to array, sorted by position if available
      const fieldOptionsArray = timeseriesDescriptor.fieldOptions instanceof Map
        ? Array.from(timeseriesDescriptor.fieldOptions.entries())
        : Object.entries(timeseriesDescriptor.fieldOptions);
      
      // Sort by position if available
      fieldOptionsArray.sort((a, b) => {
        const posA = a[1].position ?? Number.MAX_SAFE_INTEGER;
        const posB = b[1].position ?? Number.MAX_SAFE_INTEGER;
        return posA - posB;
      });
      
      columns = fieldOptionsArray.map(([key, value]) => ({ ...value, name: key }));
    }
    
    for (let i = 0, size = columns.length; i < size; i++) {
      let column = columns[i];

      // string type of column is allowed for simple configuration
      // during rendering, it's turned into an object for simple processing
      if (typeof column === "string") {
        columns[i] = {
          name: column,
          yAxis: 0,
        };
        column = columns[i];
      }

      // legend
      const columnName = typeof column === "string" ? column : (column.title || column.name || "Unknown");
      legendOption.push({
        name: columnName,
        icon: "circle",
      });

      // formatter
      const yAxisIndex = typeof column === "string" ? 0 : column.yAxis || 0;
      
      // Make sure the array has enough objects for further access
      while (timeseriesDescriptor.yAxis.length < yAxisIndex + 1) {
        timeseriesDescriptor.yAxis.push({});
      }

      while (yAxisFormatters.length < yAxisIndex + 1) {
        yAxisFormatters.push((v) => v.toString());
      }

      const format =
        typeof column === "string" || column.format === undefined
          ? timeseriesDescriptor.yAxis[yAxisIndex]?.format !== undefined
            ? timeseriesDescriptor.yAxis[yAxisIndex].format
            : "short_number"
          : column.format;
      
      if (isObjectFormatter(format)) {
        // format is an ObjectFormatter, use it directly
        yAxisFormatters[yAxisIndex] = format;
      } else {
        yAxisFormatters[yAxisIndex] = Formatter.getInstance().getFormatter(format);
      }
    }

    const echartOption = {
      // Maintain v5 behavior for rich text inheritance
      richInheritPlainLabel: false,
      title: {
        show: false,
      },
      legend: {
        type: "scroll",
        top: 0,
        data: legendOption,
        show: timeseriesDescriptor.legend === undefined || (timeseriesDescriptor.legend.placement !== "none" && timeseriesDescriptor.legend.placement !== "bottom"),
      },
      brush: {
        xAxisIndex: "all",
        brushLink: "all",
        outOfBrush: {
          colorAlpha: 0.1,
        },
      },

      // Enable brush
      toolbox: { show: false },
      axisPointer: {
        link: [
          {
            xAxisIndex: "all",
          },
        ],
        label: {
          backgroundColor: "#777",
        },
      },

      dataZoom: {
        show: false,
        start: 0,
        end: 100,
      },
      grid: {
        left: 60,
        right: timeseriesDescriptor.yAxis.length > 1 ? 60 : 20,
        bottom: 30,
        top: timeseriesDescriptor.legend === undefined || timeseriesDescriptor.legend.placement === "inside" || timeseriesDescriptor.legend.placement === "none" ? 50 : 30,
        // Maintain v5 behavior for label positioning
        outerBoundsMode: 'none'
      },
      yAxis: timeseriesDescriptor.yAxis.map((yAxis, index) => {
        return {
          type: "value",
          min: yAxis.min ?? 0,
          minInterval: yAxis.minInterval,
          interval: yAxis.interval,
          inverse: yAxis.inverse === undefined ? false : yAxis.inverse,
          splitLine: { show: true },
          axisLine: { show: false },
          scale: false,
          axisTick: {
            show: false,
          },
          axisLabel: {
            formatter: yAxisFormatters[index],
          },
          // Maintain v5 behavior for axis name positioning
          nameMoveOverlap: false
        };
      }),

      xAxis: { 
        type: "category",
        // Maintain v5 behavior for axis name positioning
        nameMoveOverlap: false
      },
      series: [],

      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          label: {
            backgroundColor: "#283b56",
          },
        },

        // The tooltip might be truncated if the chart is in a small container,
        // Set this property to make sure the tooltip is shown completely.
        // https://echarts.apache.org/en/option.html#tooltip.appendTo
        appendToBody: true,
      },
    };
    return { option: echartOption, yAxisFormatters: yAxisFormatters };
  }
}

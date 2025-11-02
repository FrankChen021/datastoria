import { Formatter } from "@/lib/formatter";
import type { ChartDescriptor, FormatterFn } from "./chart-utils";

// Base interfaces
export interface ChartRenderer {
  renderSeries(
    chartDescriptor: ChartDescriptor,
    yAxisFormatters: FormatterFn[],
    columnMap: Map<string, ColumnDef>,
    queryResponse: QueryResponse
  ): any;
}

export interface ChartOptionBuilder {
  build(chartDescriptor: ChartDescriptor): { yAxisFormatters: FormatterFn[]; option: any };
}

// Pie chart renderer for pie charts
export class PieChartRenderer implements ChartRenderer {
  renderSeries(
    chartDescriptor: ChartDescriptor,
    yAxisFormatters: FormatterFn[],
    columnMap: Map<string, ColumnDef>,
    queryResponse: QueryResponse
  ): any {
    const series = [];
    const legendData = [];

    // For pie charts, we need to aggregate data differently
    // We'll use the latest value from each metric or sum across time
    const pieData = [];

    queryResponse.data.forEach((metric: { tags: string[]; values: number[] }) => {
      // The last tag is the metric name
      const metricName = metric.tags[metric.tags.length - 1];

      const column = columnMap.get(metricName);
      if (column === undefined) {
        console.warn(`Cant find definition of ${metricName}`);
        return;
      }

      // For pie charts, we'll use the sum of all values or the latest value
      let value = 0;
      if (metric.values && metric.values.length > 0) {
        // Sum all values for total representation, or use latest for current state
        value = metric.values.reduce((sum, val) => sum + (val || 0), 0);
      }

      // Build the label from group by fields
      const title = column.title === undefined ? column.name : column.title;
      let group = "";
      for (let i = 0; i < metric.tags.length - 1; i++) {
        if (group !== "") {
          group += "-";
        }
        group += metric.tags[i];
      }

      const displayName = group !== "" ? group : title;

      pieData.push({
        name: displayName,
        value: value,
      });

      legendData.push({
        name: displayName,
        icon: "circle",
      });
    });

    // Create pie series
    const pieSeries = {
      id: "pie",
      name: chartDescriptor.title || "Pie Chart",
      type: "pie",
      radius: ["40%", "70%"], // Donut style by default
      avoidLabelOverlap: false,
      data: pieData,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: "rgba(0, 0, 0, 0.5)",
        },
      },
      label: {
        show: true,
        formatter: (params) => {
          const yAxisIndex = 0; // Default to first formatter for pie charts
          const formatterFn = yAxisFormatters[yAxisIndex] || ((v) => v.toString());
          return `${params.name}: ${formatterFn(params.value)}`;
        },
      },
      labelLine: {
        show: true,
      },
    };

    series.push(pieSeries);

    return {
      legend: {
        data: legendData,
        orient: "vertical",
        left: "left",
      },
      // Pie charts don't use xAxis and yAxis
      series: series,
    };
  }
}

// Pie chart option builder
export class PieChartOptionBuilder implements ChartOptionBuilder {
  build(chartDescriptor: ChartDescriptor): { yAxisFormatters: FormatterFn[]; option: any } {
    const yAxisFormatters: FormatterFn[] = [];
    const legendOption: { name: string; icon: string }[] = [];

    for (let i = 0, size = chartDescriptor.columns.length; i < size; i++) {
      let column = chartDescriptor.columns[i];

      // string type of column is allowed for simple configuration
      // during rendering, it's turned into an object for simple processing
      if (typeof column === "string") {
        chartDescriptor.columns[i] = {
          name: column,
          yAxis: 0,
        };
        column = chartDescriptor.columns[i];
      }

      // legend
      legendOption.push({
        name: typeof column === "string" ? column : column.title || column.name,
        icon: "circle",
      });

      // formatter
      const yAxisIndex = typeof column === "string" ? 0 : column.yAxis || 0;

      while (yAxisFormatters.length < yAxisIndex + 1) {
        yAxisFormatters.push((v) => v.toString());
      }

      const formatName = typeof column === "string" || column.format === undefined ? "short_number" : column.format;
      yAxisFormatters[yAxisIndex] = Formatter.getInstance().getFormatter(formatName);
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
        show:
          chartDescriptor.legend === undefined ||
          (chartDescriptor.legend.placement !== "none" && chartDescriptor.legend.placement !== "bottom"),
      },
      // Pie charts don't need brush, dataZoom, grid, axes
      series: [],

      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)",

        // The tooltip might be truncated if the chart is in a small container,
        // Set this property to make sure the tooltip is shown completely.
        // https://echarts.apache.org/en/option.html#tooltip.appendTo
        appendToBody: true,
      },
    };
    return { option: echartOption, yAxisFormatters: yAxisFormatters };
  }
}

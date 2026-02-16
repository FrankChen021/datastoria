"use client";

import { useConnection } from "@/components/connection/connection-context";
import type {
  Dashboard,
  DateTimeFilterSpec,
  FilterSpec,
  SelectorFilterSpec,
  TableDescriptor,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPage from "@/components/shared/dashboard/dashboard-page";
import { TraceIdLink } from "@/components/shared/trace-id-link";
import { memo, useMemo } from "react";

interface OpenTelemetrySpanLogProps {
  database: string;
  table: string;
}

export const OpenTelemetrySpanLog = memo(
  ({ database: _database, table: _table }: OpenTelemetrySpanLogProps) => {
    const { connection } = useConnection();

    const filterSpecs = useMemo<FilterSpec[]>(() => {
      return [
        {
          filterType: "date_time",
          alias: "_interval",
          displayText: "time",
          timeColumn: "finish_time_us",
          defaultTimeSpan: "Last 15 Mins",
        } as DateTimeFilterSpec,
        {
          filterType: "select",
          name: "FQDN()",
          displayText: "FQDN()",
          onPreviousFilters: true,
          datasource: {
            type: "sql",
            sql: `SELECT DISTINCT FQDN()
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE ({filterExpression:String})
  AND finish_date >= toDate({from:String}) 
  AND finish_date <= toDate({to:String})
  AND finish_time_us >= {startTimestampUs:UInt64}
  AND finish_time_us < {endTimestampUs:UInt64}
ORDER BY 1
LIMIT 200`,
          },
        } as SelectorFilterSpec,
        {
          filterType: "select",
          name: "kind",
          displayText: "kind",
          onPreviousFilters: true,
          datasource: {
            type: "sql",
            sql: `SELECT DISTINCT kind
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE ({filterExpression:String})
  AND finish_date >= toDate({from:String}) 
  AND finish_date <= toDate({to:String})
  AND finish_time_us >= {startTimestampUs:UInt64}
  AND finish_time_us < {endTimestampUs:UInt64}
ORDER BY 1`,
          },
        } as SelectorFilterSpec,
      ];
    }, []);

    const dashboard = useMemo<Dashboard>(() => {
      return {
        version: 3,
        filter: {},
        charts: [
          {
            type: "bar",
            titleOption: { title: "Trace Span Distribution", showTitle: true, align: "left" },
            datasource: {
              sql: `SELECT
  toStartOfInterval(fromUnixTimestamp64Micro(start_time_us), interval {rounding:UInt32} second) as t,
  kind,
  count() as count
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE 
  {filterExpression:String}
  AND finish_date >= toDate({from:String}) 
  AND finish_date <= toDate({to:String})
  AND finish_time_us >= {startTimestampUs:UInt64}
  AND finish_time_us < {endTimestampUs:UInt64}
GROUP BY 1, 2
ORDER BY 1`,
            },
            legendOption: {
              placement: "inside",
            },
            fieldOptions: {
              t: { name: "t", type: "datetime" },
              count: { name: "count", type: "number" },
              kind: { name: "kind", type: "string" },
            },
            stacked: true,
            gridPos: { w: 24, h: 6 },
          } as TimeseriesDescriptor,
          {
            type: "table",
            titleOption: { title: "Tracing Span Records", showTitle: true, align: "left" },
            datasource: {
              sql: `SELECT *
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE 
  {filterExpression:String}
  AND finish_date >= toDate({from:String}) 
  AND finish_date <= toDate({to:String})
  AND finish_time_us >= {startTimestampUs:UInt64}
  AND finish_time_us < {endTimestampUs:UInt64}
ORDER BY start_time_us DESC`,
            },
            sortOption: {
              serverSideSorting: true,
              initialSort: { column: "start_time_us", direction: "desc" },
            },
            pagination: { mode: "server", pageSize: 100 },
            headOption: { isSticky: true },
            miscOption: {
              enableIndexColumn: true,
              enableShowRowDetail: true,
              enableCompactMode: true,
            },
            fieldOptions: {
              trace_id: {
                width: 250,
                position: 1,
                format: (value: unknown, _params?: unknown[], row?: Record<string, unknown>) => {
                  if (!value) return "-";
                  const traceId = typeof value === "string" ? value : String(value);
                  const eventDate =
                    typeof row?.event_date === "string" ? row.event_date : undefined;
                  return (
                    <TraceIdLink displayTraceId={traceId} traceId={traceId} eventDate={eventDate} />
                  );
                },
              },
              start_time_us: {
                position: 2,
                name: "start_time_us",
                format: "yyyyMMddHHmmssSSS",
                formatArgs: [1000],
              },
              finish_time_us: {
                position: 3,
                name: "finish_time_us",
                format: "yyyyMMddHHmmssSSS",
                formatArgs: [1000],
              },
              span_id: {
                format: "string",
              },
              parent_span_id: {
                format: "string",
              },
            },
            gridPos: { w: 24, h: 18 },
          } as TableDescriptor,
        ],
      };
    }, []);

    return (
      <DashboardPage
        panels={dashboard}
        filterSpecs={filterSpecs}
        showInputFilter={true}
        timezone={connection?.metadata.timezone ?? "UTC"}
        showTimeSpanSelector={true}
        showRefresh={true}
        showAutoRefresh={false}
        chartSelectionFilterName="kind"
      />
    );
  }
);

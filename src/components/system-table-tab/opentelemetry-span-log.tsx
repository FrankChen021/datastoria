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
import { SpanIdLink } from "@/components/shared/span-id-link";
import { memo, useMemo } from "react";

interface OpenTelemetrySpanLogProps {
  database: string;
  table: string;
}

export const OpenTelemetrySpanLog = memo(
  ({ database: _database, table: _table }: OpenTelemetrySpanLogProps) => {
    const { connection } = useConnection();

    const distributionQuery = useMemo(
      () => `
SELECT
  toStartOfInterval(fromUnixTimestamp64Micro(start_time_us), interval {rounding:UInt32} second) as t,
  FQDN() as service_name,
  count() as count
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE 
  {filterExpression:String}
  AND finish_date >= toDate({from:String}) 
  AND finish_date <= toDate({to:String})
  AND fromUnixTimestamp64Micro(finish_time_us) >= {from:String}
  AND fromUnixTimestamp64Micro(finish_time_us) < {to:String}
GROUP BY t, service_name
ORDER BY t, service_name
`,
      []
    );

    const tableQuery = useMemo(
      () => `
SELECT *
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE 
  {filterExpression:String}
  AND finish_date >= toDate({from:String}) 
  AND finish_date <= toDate({to:String})
  AND fromUnixTimestamp64Micro(finish_time_us) >= {from:String}
  AND fromUnixTimestamp64Micro(finish_time_us) < {to:String}
ORDER BY start_time_us DESC
`,
      []
    );

    const filterSpecs = useMemo<FilterSpec[]>(() => {
      return [
        {
          filterType: "date_time",
          alias: "_interval",
          displayText: "time",
          timeColumn: "fromUnixTimestamp64Micro(start_time_us)",
          defaultTimeSpan: "Last 15 Mins",
        } as DateTimeFilterSpec,
        {
          filterType: "select",
          name: "service_name",
          displayText: "service_name",
          onPreviousFilters: true,
          datasource: {
            type: "sql",
            sql: `SELECT DISTINCT service_name
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE ({filterExpression:String})
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND fromUnixTimestamp64Micro(start_time_us) >= {from:String}
  AND fromUnixTimestamp64Micro(start_time_us) < {to:String}
  AND service_name != ''
ORDER BY service_name
LIMIT 200`,
          },
        } as SelectorFilterSpec,
        {
          filterType: "select",
          name: "span_kind",
          displayText: "span_kind",
          onPreviousFilters: true,
          datasource: {
            type: "sql",
            sql: `SELECT DISTINCT span_kind
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE ({filterExpression:String})
  AND event_date >= toDate({from:String}) 
  AND event_date <= toDate({to:String})
  AND fromUnixTimestamp64Micro(start_time_us) >= {from:String}
  AND fromUnixTimestamp64Micro(start_time_us) < {to:String}
  AND span_kind != ''
ORDER BY span_kind
LIMIT 100`,
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
              sql: distributionQuery,
            },
            legendOption: {
              placement: "inside",
            },
            fieldOptions: {
              t: { name: "t", type: "datetime" },
              count: { name: "count", type: "number" },
              service_name: { name: "service_name", type: "string" },
            },
            stacked: true,
            height: 150,
            gridPos: { w: 24, h: 4 },
          } as TimeseriesDescriptor,
          {
            type: "table",
            titleOption: { title: "Tracing Span Records", showTitle: true, align: "left" },
            datasource: {
              sql: tableQuery,
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
                    <SpanIdLink displayTraceId={traceId} traceId={traceId} eventDate={eventDate} />
                  );
                },
              },
              start_time_us: {
                position: 2,
                format: "microsecond",
              },
              duration_us: {
                format: "microsecond",
              },
            },
            gridPos: { w: 24, h: 18 },
          } as TableDescriptor,
        ],
      };
    }, [distributionQuery, tableQuery]);

    return (
      <DashboardPage
        panels={dashboard}
        filterSpecs={filterSpecs}
        showInputFilter={true}
        timezone={connection?.metadata.timezone ?? "UTC"}
        showTimeSpanSelector={true}
        showRefresh={true}
        showAutoRefresh={false}
        chartSelectionFilterName="service_name"
      />
    );
  }
);

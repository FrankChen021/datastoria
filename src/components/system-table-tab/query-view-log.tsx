"use client";

import { useConnection } from "@/components/connection/connection-context";
import { formatQueryLogType } from "@/components/query-log-inspector/query-log-inspector-table-view";
import type {
  Dashboard,
  DashboardGroup,
  DateTimeFilterSpec,
  FilterSpec,
  SelectorFilterSpec,
  TableDescriptor,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPage from "@/components/shared/dashboard/dashboard-page";
import { QueryIdLink } from "@/components/shared/query-id-link";
import { useMemo } from "react";
import { OpenTableTabButton } from "../table-tab/open-table-tab-button";

interface QueryViewLogProps {
  database: string;
  table: string;
}

export const QueryViewLog = ({ database: _database, table: _table }: QueryViewLogProps) => {
  const { connection } = useConnection();

  // NOTE: keep the {cluster} replacement, it will be processed by the underlying connection object

  const filterSpecs = useMemo<FilterSpec[]>(() => {
    return [
      {
        filterType: "date_time",
        alias: "_interval",
        displayText: "time",
        timeColumn: "event_time",
        defaultTimeSpan: "Last 15 Mins",
      } as DateTimeFilterSpec,

      {
        filterType: "select",
        name: "hostname",
        displayText: "hostname",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `SELECT DISTINCT hostname 
FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
                    WHERE {filterExpression:String} order by hostname`,
        },

        defaultPattern: {
          comparator: "=",
          values: [connection!.metadata.remoteHostName],
        },
      } as SelectorFilterSpec,
      {
        filterType: "select",
        name: "status",
        displayText: "status",
        onPreviousFilters: true,
        defaultPattern: {
          comparator: "!=",
          values: ["QueryStart"],
        },
        datasource: {
          type: "inline",
          values: [
            { label: "QueryStart", value: "QueryStart" },
            { label: "QueryFinish", value: "QueryFinish" },
            { label: "ExceptionBeforeStart", value: "ExceptionBeforeStart" },
            { label: "ExceptionWhileProcessing", value: "ExceptionWhileProcessing" },
          ],
        },
      } as SelectorFilterSpec,

      {
        filterType: "select",
        name: "view_name",
        displayText: "view_name",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `SELECT DISTINCT view_name
FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
WHERE ({filterExpression:String})
    AND event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
ORDER BY view_name
`,
        },
      } as SelectorFilterSpec,

      {
        filterType: "select",
        name: "exception_code",
        displayText: "exception_code",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `
SELECT DISTINCT exception_code
FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_log)` : "system.query_log"}
WHERE ({filterExpression:String})
    AND event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
ORDER BY exception_code
LIMIT 100
`,
        },
      } as SelectorFilterSpec,
    ];
  }, []);

  // Build Dashboard configuration with chart and table
  const dashboard = useMemo<Dashboard>(() => {
    return {
      version: 3,
      filter: {},
      charts: [
        {
          title: "Query View Log Dashbaord",
          charts: [
            {
              type: "bar",
              titleOption: { title: `Query Count Distribution`, showTitle: true, align: "left" },
              datasource: {
                sql: `
        SELECT
            toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
            status,
            count(1) as count
        FROM 
        ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
        WHERE 
          {filterExpression:String}
          AND event_date >= toDate({from:String}) 
          AND event_date >= toDate({to:String})
          AND event_time >= {from:String} 
          AND event_time < {to:String}
        GROUP BY t, status
        ORDER BY t, status
        `,
              },
              legendOption: {
                placement: "inside",
              },
              fieldOptions: {
                t: { name: "t", type: "datetime" },
                count: { name: "count", type: "number" },
                status: { name: "status", type: "string" },
              },
              stacked: true,
              gridPos: { w: 24, h: 4 },
            } as TimeseriesDescriptor,

            {
              type: "line",
              titleOption: { title: `AVG View Duration`, showTitle: true, align: "left" },
              datasource: {
                sql: `
        SELECT
            toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
            view_name,
            AVG(view_duration_ms) as view_duration_ms
        FROM 
        ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
        WHERE 
          {filterExpression:String}
          AND event_date >= toDate({from:String}) 
          AND event_date >= toDate({to:String})
          AND event_time >= {from:String} 
          AND event_time < {to:String}
        GROUP BY t, view_name
        ORDER BY t, view_name
        `,
              },
              legendOption: {
                placement: "bottom",
                values: ["count", "min", "max"],
              },
              fieldOptions: {
                t: { name: "t" },
                view_duration_ms: { name: "view_duration_ms", format: "millisecond" },
                view_name: { name: "view_name" },
              },
              gridPos: { w: 24, h: 6 },
            } as TimeseriesDescriptor,

            {
              type: "line",
              titleOption: { title: `Read Rows Per Second`, showTitle: true, align: "left" },
              datasource: {
                sql: `
        SELECT
            toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
            view_name,
            round(SUM(read_rows) / {rounding:UInt32}, 2) as read_rows
        FROM 
        ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
        WHERE 
          {filterExpression:String}
          AND event_date >= toDate({from:String}) 
          AND event_date >= toDate({to:String})
          AND event_time >= {from:String} 
          AND event_time < {to:String}
        GROUP BY t, view_name
        ORDER BY t, view_name
        `,
              },
              legendOption: {
                placement: "bottom",
                values: ["count", "min", "max"],
              },
              fieldOptions: {
                t: { name: "t" },
                read_rows: { name: "read_rows", format: "short_number" },
                view_name: { name: "view_name" },
              },
              gridPos: { w: 12, h: 6 },
            } as TimeseriesDescriptor,

            {
              type: "line",
              titleOption: { title: `Read Bytes Per Second`, showTitle: true, align: "left" },
              datasource: {
                sql: `
        SELECT
            toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
            view_name,
            SUM(read_bytes) / {rounding:UInt32} as read_bytes
        FROM 
        ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
        WHERE 
          {filterExpression:String}
          AND event_date >= toDate({from:String}) 
          AND event_date >= toDate({to:String})
          AND event_time >= {from:String} 
          AND event_time < {to:String}
        GROUP BY t, view_name
        ORDER BY t, view_name
        `,
              },
              legendOption: {
                placement: "bottom",
                values: ["count", "min", "max"],
              },
              fieldOptions: {
                t: { name: "t" },
                read_bytes: { name: "read_bytes", format: "binary_byte" },
                view_name: { name: "view_name" },
              },
              gridPos: { w: 12, h: 6 },
            } as TimeseriesDescriptor,

            {
              type: "line",
              titleOption: { title: `Written Rows Per Second`, showTitle: true, align: "left" },
              datasource: {
                sql: `
        SELECT
            toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
            view_name,
            SUM(written_rows) / {rounding:UInt32} as written_rows
        FROM 
        ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
        WHERE 
          {filterExpression:String}
          AND event_date >= toDate({from:String}) 
          AND event_date >= toDate({to:String})
          AND event_time >= {from:String} 
          AND event_time < {to:String}
        GROUP BY t, view_name
        ORDER BY t, view_name
        `,
              },
              legendOption: {
                placement: "bottom",
                values: ["count", "min", "max"],
              },
              fieldOptions: {
                t: { name: "t" },
                written_rows: { name: "written_rows", format: "short_number" },
                view_name: { name: "view_name" },
              },
              gridPos: { w: 12, h: 6 },
            } as TimeseriesDescriptor,

            {
              type: "line",
              titleOption: { title: `Written Bytes Per Second`, showTitle: true, align: "left" },
              datasource: {
                sql: `
        SELECT
            toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
            view_name,
            SUM(written_bytes) / {rounding:UInt32} as written_bytes
        FROM 
        ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
        WHERE 
          {filterExpression:String}
          AND event_date >= toDate({from:String}) 
          AND event_date >= toDate({to:String})
          AND event_time >= {from:String} 
          AND event_time < {to:String}
        GROUP BY t, view_name
        ORDER BY t, view_name
        `,
              },
              legendOption: {
                placement: "bottom",
                values: ["count", "min", "max"],
              },
              fieldOptions: {
                t: { name: "t" },
                written_bytes: { name: "written_bytes", format: "binary_size" },
                view_name: { name: "view_name" },
              },
              gridPos: { w: 12, h: 6 },
            } as TimeseriesDescriptor,
          ],
        } as DashboardGroup,

        {
          title: "Query View Log Records",
          collapsed: true,
          charts: [
            {
              type: "table",
              titleOption: { title: `Query View Log Records`, showTitle: true, align: "left" },
              datasource: {
                sql: `
        SELECT * FROM
        ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_views_log)` : "system.query_views_log"}
        WHERE 
          {filterExpression:String}
          AND event_date >= toDate({from:String}) 
          AND event_date >= toDate({to:String})
          AND event_time >= {from:String} 
        AND event_time < {to:String}
        ORDER BY event_time DESC
        `,
              },
              sortOption: {
                serverSideSorting: true,
                initialSort: { column: "event_time", direction: "desc" },
              },
              pagination: { mode: "server", pageSize: 100 },
              headOption: { isSticky: true },
              miscOption: {
                enableIndexColumn: true,
                enableShowRowDetail: true,
                enableCompactMode: true,
              },
              fieldOptions: {
                status: { format: formatQueryLogType, position: 1 },
                initial_query_id: {
                  width: 250,
                  position: 1,
                  format: (
                    value: unknown,
                    _params?: unknown[],
                    context?: Record<string, unknown>
                  ) => {
                    if (!value) return "-";
                    const queryId = typeof value === "string" ? value : String(value);
                    const eventDate =
                      typeof context?.event_date === "string" ? context.event_date : undefined;
                    return (
                      <QueryIdLink
                        displayQueryId={queryId}
                        queryId={queryId}
                        eventDate={eventDate}
                      />
                    );
                  },
                },

                peak_memory_usage: { format: "binary_size" },
                view_duration_ms: { format: "millisecond" },
                view_query: { format: "sql" },
                view_name: {
                  format: (value: unknown) => {
                    const viewName = value as string;
                    return <OpenTableTabButton database={viewName} table={viewName} />;
                  },
                },
                view_target: {
                  format: (value: unknown) => {
                    const target = value as string;
                    const [database, table] = target.split(".");
                    return <OpenTableTabButton database={database} table={table} />;
                  },
                },
              },
              gridPos: { w: 24, h: 18 },
            } as TableDescriptor,
          ],
        } as DashboardGroup,
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
      chartSelectionFilterName="type"
    />
  );
};

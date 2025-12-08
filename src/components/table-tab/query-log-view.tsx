import type { Dashboard, DashboardGroup, FieldOption, TableDescriptor } from "@/components/dashboard/dashboard-model";
import DashboardPanels, { type DashboardPanelsRef } from "@/components/dashboard/dashboard-panels";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { BUILT_IN_TIME_SPAN_LIST } from "@/components/dashboard/timespan-selector";
import { TabManager } from "@/components/tab-manager";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { ExternalLink } from "lucide-react";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { RefreshableTabViewRef } from "./table-tab";

export interface QueryLogViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

// Shared format function for query log links (initial_query_id and query_id)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatQueryLogLink = (queryId: any, _params?: any[], context?: Record<string, unknown>): React.ReactNode => {
  if (!queryId || typeof queryId !== "string") {
    return String(queryId ?? "");
  }
  // Truncate to first 4 and last 4 characters if longer than 8
  const displayValue =
    queryId.length > 8 ? `${queryId.substring(0, 4)}...${queryId.substring(queryId.length - 4)}` : queryId;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();

        const eventDate = context?.event_date as string;
        TabManager.openQueryLogTab(queryId, eventDate);
      }}
      className="text-primary hover:underline cursor-pointer flex items-center gap-1"
      title={queryId} // Show full value on hover
    >
      <span>{displayValue}</span>
      <ExternalLink className="h-3 w-3" />
    </button>
  );
};

const QueryLogViewComponent = forwardRef<RefreshableTabViewRef, QueryLogViewProps>(({ database, table }, ref) => {
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | undefined>(undefined);
  const dashboardPanelsRef = useRef<DashboardPanelsRef>(null);
  const defaultTimeSpan = useMemo(() => BUILT_IN_TIME_SPAN_LIST[3].getTimeSpan(), []);

  // Calculate current time span (use selected if available, otherwise default)
  const currentTimeSpan = selectedTimeSpan ?? defaultTimeSpan;

  useImperativeHandle(
    ref,
    () => ({
      refresh: (timeSpan?: TimeSpan) => {
        if (timeSpan) {
          // Update state - prop change will trigger automatic refresh in DashboardPanels
          setSelectedTimeSpan(timeSpan);
        } else {
          // No timeSpan provided - explicitly refresh with current time span
          // This handles the case when clicking refresh without changing the time range
          setTimeout(() => {
            dashboardPanelsRef.current?.refresh(currentTimeSpan);
          }, 10);
        }
      },
      supportsTimeSpanSelector: true,
    }),
    [currentTimeSpan]
  );

  // Create table descriptor
  const tableDescriptor = useMemo<TableDescriptor>(() => {
    // Calculate start time - use selected timespan if available, otherwise default to start of today
    let eventTimeStart: string;
    let eventTimeEnd: string | undefined;
    let eventDateFilter: string;

    if (selectedTimeSpan?.startISO8601) {
      const startDate = new Date(selectedTimeSpan.startISO8601);
      eventTimeStart = DateTimeExtension.toYYYYMMddHHmmss(startDate);

      if (selectedTimeSpan.endISO8601) {
        const endDate = new Date(selectedTimeSpan.endISO8601);
        eventTimeEnd = DateTimeExtension.toYYYYMMddHHmmss(endDate);
      }

      // Use toDate() to get the date part for event_date filter
      // For timespan, we might need to check multiple dates, but for simplicity, use the start date
      const startDateOnly = new Date(startDate);
      startDateOnly.setHours(0, 0, 0, 0);
      const dateStr = DateTimeExtension.formatDateTime(startDateOnly, "yyyy-MM-dd") || "";
      eventDateFilter = `event_date >= '${dateStr}'`;
    } else {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      eventTimeStart = DateTimeExtension.toYYYYMMddHHmmss(startOfToday);
      eventDateFilter = `event_date = today()`;
    }

    const columns: FieldOption[] = [
      // {
      //   name: "normalized_query_hash",
      //   title: "Query Hash",
      //   sortable: true,
      //   align: "left",
      // },
      {
        name: "query_kind",
        title: "Query Kind",
        sortable: false,
        align: "center",
      },
      {
        name: "last_execution_time",
        title: "Last Execution Time",
        sortable: false,
        align: "center",
        format: "MMddHHmmssSSS",
      },
      {
        name: "OSCPUVirtualTimeMicroseconds",
        title: "CPU Time (μs)",
        sortable: true,
        align: "right",
        format: "comma_number",
      },
      {
        name: "read_rows",
        title: "Read Rows",
        sortable: true,
        align: "right",
        format: "comma_number",
      },
      {
        name: "written_rows",
        title: "Written Rows",
        sortable: true,
        align: "right",
        format: "comma_number",
      },
      {
        name: "query_count",
        title: "Query Count",
        sortable: true,
        align: "right",
        format: "comma_number",
      },
      {
        name: "query",
        title: "Query",
        sortable: false,
        align: "left",
        format: "sql",
      },
    ];

    const timeFilter = eventTimeEnd
      ? `event_time >= '${eventTimeStart}' AND event_time <= '${eventTimeEnd}'`
      : `event_time >= '${eventTimeStart}'`;

    const sql = `
SELECT
    -- pick the most recent query text for this hash
    max(event_time) AS last_execution_time,
    argMax(query, event_time) AS query,
    argMax(query_kind, event_time) as query_kind,
    sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) AS OSCPUVirtualTimeMicroseconds,
    sum(read_rows) AS read_rows,
    sum(written_rows) AS written_rows,
    count() query_count
FROM system.query_log
WHERE ${eventDateFilter}
  AND ${timeFilter}
  AND type <> 'QueryStart'
  AND has(databases, '${database}')
  AND has(tables, '${database}.${table}')
GROUP BY normalized_query_hash
ORDER BY OSCPUVirtualTimeMicroseconds DESC
LIMIT 10`;

    return {
      type: "table",
      id: `query-log-${database}-${table}`,
      titleOption: {
        title: "Top 10 Queries by CPU Time",
        align: "left",
      },
      collapsed: false,
      width: 24,
      query: {
        sql: sql,
        headers: {
          "Content-Type": "text/plain",
        },
        params: {
          default_format: "JSON",
        },
      },
      columns: columns,
      initialSort: {
        column: "OSCPUVirtualTimeMicroseconds",
        direction: "desc",
      },
      serverSideSorting: true,
    };
  }, [database, table, selectedTimeSpan]);

  // Create dashboard with the table descriptor
  const dashboard = useMemo<Dashboard>(() => {
    return {
      name: `query-log-${database}-${table}`,
      folder: "",
      title: "Query Log",
      version: 2,
      filter: {
        showTimeSpanSelector: false,
        showRefresh: false,
        showAutoRefresh: false,
      },
      charts: [
        {
          type: "line",
          id: "query-numbers",
          titleOption: {
            title: "Query Numbers",
            align: "center",
          },
          collapsed: false,
          width: 12,
          query: {
            sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    query_kind, 
    count()
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type = 'QueryStart'
GROUP BY t, query_kind
ORDER BY t`,
          },
        },

        {
          type: "line",
          id: "error-queries",
          titleOption: {
            title: "Error Queries",
            align: "left",
          },
          collapsed: false,
          width: 12,
          query: {
            sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    query_kind, 
    count()
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
GROUP BY t, query_kind
ORDER BY t`,
          },
        },

        {
          title: "IO",
          collapsed: true,
          charts: [
            {
              type: "line",
              id: "read-rows-queries",
              titleOption: {
                title: "Read Rows",
                align: "left",
              },
              collapsed: false,
              width: 6,
              query: {
                sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(read_rows)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
              },
            },

            {
              type: "line",
              id: "read-bytes-queries",
              titleOption: {
                title: "Read Bytes",
                align: "left",
              },
              collapsed: false,
              width: 6,
              query: {
                sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(read_bytes)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
              },
            },

            {
              type: "line",
              id: "read-bytes-queries",
              titleOption: {
                title: "Written Rows",
                align: "left",
              },
              collapsed: false,
              width: 6,
              query: {
                sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(written_rows)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
              },
            },

            {
              type: "line",
              id: "written-bytes-queries",
              titleOption: {
                title: "Written Bytes",
                align: "left",
              },
              collapsed: false,
              width: 6,
              query: {
                sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(written_bytes)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
              },
            },

            {
              type: "line",
              id: "result-rows-queries",
              titleOption: {
                title: "Result Rows",
                align: "left",
              },
              collapsed: false,
              width: 12,
              query: {
                sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(result_rows)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
              },
            },

            {
              type: "line",
              id: "result-bytes-queries",
              titleOption: {
                title: "Result Bytes",
                align: "left",
              },
              collapsed: false,
              width: 12,
              query: {
                sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(result_bytes)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
              },
            },
          ],
        } as DashboardGroup,

        {
          type: "line",
          id: "CPU Time",
          titleOption: {
            title: "CPU Time",
            align: "left",
          },
          collapsed: false,
          width: 24,
          query: {
            sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
    query_kind,
    sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) as OSCPUVirtualTimeMicroseconds
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('QueryFinish')
GROUP BY t, query_kind
ORDER BY t`,
          },
          drilldown: {
            cpu: {
              type: "table",
              id: "query-kind",
              width: 24,
              titleOption: {
                title: "Top 100 Queries by CPU Time",
              },
              sortOption: {
                initialSort: {
                  column: "OSCPUVirtualTimeMicroseconds",
                  direction: "desc",
                },
              },
              fieldOptions: {
                OSCPUVirtualTimeMicroseconds: {
                  title: "CPU Time",
                  format: "microsecond",
                  sortable: true,
                },
                initial_query_id: {
                  title: "Initial Query ID",
                  position: 2,
                  format: formatQueryLogLink,
                },
                query_id: {
                  title: "Query ID",
                  position: 3,
                  format: formatQueryLogLink,
                },
              },
              query: {
                sql: `
SELECT 
ProfileEvents['OSCPUVirtualTimeMicroseconds'] as OSCPUVirtualTimeMicroseconds,
    *
FROM system.query_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND has(databases, '${database}')
    AND has(tables, '${database}.${table}')
    AND type in ('QueryFinish')
ORDER BY OSCPUVirtualTimeMicroseconds DESC
LIMIT 50
                `,
              },
            } as TableDescriptor,
          },
        },

        tableDescriptor,
      ],
    };
  }, [tableDescriptor, database, table]);

  return <DashboardPanels ref={dashboardPanelsRef} dashboard={dashboard} selectedTimeSpan={currentTimeSpan} />;
});

QueryLogViewComponent.displayName = "QueryLogView";

export const QueryLogView = memo(QueryLogViewComponent);

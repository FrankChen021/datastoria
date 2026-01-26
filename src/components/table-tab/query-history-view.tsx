import type {
  Dashboard,
  DashboardGroup,
  FieldOption,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPanelContainer, {
  type DashboardPanelContainerRef,
} from "@/components/shared/dashboard/dashboard-panel-container";
import {
  BUILT_IN_TIME_SPAN_LIST,
  type TimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import { TabManager } from "@/components/tab-manager";
import { escapeSqlString } from "@/lib/string-utils";
import { ExternalLink } from "lucide-react";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface QueryHistoryViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

// Shared format function for query log links (initial_query_id and query_id)
const formatQueryLogLink = (
  queryId: unknown,
  _params?: unknown[],
  context?: Record<string, unknown>
): React.ReactNode => {
  if (!queryId || typeof queryId !== "string") {
    return String(queryId ?? "");
  }
  // Truncate to first 4 and last 4 characters if longer than 8
  const displayValue =
    queryId.length > 8
      ? `${queryId.substring(0, 4)}...${queryId.substring(queryId.length - 4)}`
      : queryId;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();

        const eventDate = context?.event_date as string;
        TabManager.openTab({
          id: `Query Log: ${queryId}`,
          type: "query-log",
          queryId,
          eventDate,
        });
      }}
      className="text-primary hover:underline cursor-pointer flex items-center gap-1"
      title={queryId} // Show full value on hover
    >
      <span>{displayValue}</span>
      <ExternalLink className="h-3 w-3" />
    </button>
  );
};

export const QueryHistoryView = memo(
  forwardRef<RefreshableTabViewRef, QueryHistoryViewProps>(({ database, table }, ref) => {
    const dashboardPanelsRef = useRef<DashboardPanelContainerRef>(null);
    const defaultTimeSpan = useMemo(() => BUILT_IN_TIME_SPAN_LIST[3].getTimeSpan(), []);

    useImperativeHandle(
      ref,
      () => ({
        refresh: (timeSpan?: TimeSpan) => {
          requestAnimationFrame(() => {
            dashboardPanelsRef.current?.refresh(timeSpan ?? defaultTimeSpan);
          });
        },
        supportsTimeSpanSelector: true,
      }),
      [defaultTimeSpan]
    );

    // Create table descriptor
    const tableDescriptor = useMemo<TableDescriptor>(() => {
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
WHERE event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
  AND type <> 'QueryStart'
  AND has(databases, '${escapeSqlString(database)}')
  AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
GROUP BY normalized_query_hash
ORDER BY OSCPUVirtualTimeMicroseconds DESC
LIMIT 10`;

      return {
        type: "table",
        id: `query-history-${database}-${table}`,
        titleOption: {
          title: "Top 10 Queries by CPU Time",
          align: "left",
        },
        collapsed: false,
        gridPos: { w: 24, h: 10 },
        datasource: {
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
    }, [database, table]);

    // Create dashboard with the table descriptor
    const dashboard = useMemo<Dashboard>(() => {
      return {
        name: `query-history-${database}-${table}`,
        folder: "",
        title: "Query History",
        version: 3,
        filter: {
          showTimeSpanSelector: false,
          showRefresh: false,
          showAutoRefresh: false,
        },
        charts: [
          {
            type: "line",
            titleOption: {
              title: "Query Numbers",
              align: "center",
            },
            collapsed: false,
            gridPos: { w: 12, h: 6 },
            datasource: {
              sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    query_kind, 
    count()
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
    AND type = 'QueryStart'
GROUP BY t, query_kind
ORDER BY t`,
            },
          },

          {
            type: "line",
            titleOption: {
              title: "Error Queries",
              align: "left",
            },
            collapsed: false,
            gridPos: { w: 12, h: 6 },
            datasource: {
              sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    query_kind, 
    count()
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
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
                titleOption: {
                  title: "Read Rows",
                  align: "left",
                },
                collapsed: false,
                gridPos: { w: 6, h: 6 },
                datasource: {
                  sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(read_rows)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
                },
              },

              {
                type: "line",
                titleOption: {
                  title: "Read Bytes",
                  align: "left",
                },
                collapsed: false,
                gridPos: { w: 6, h: 6 },
                datasource: {
                  sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(read_bytes)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
                },
              },

              {
                type: "line",
                titleOption: {
                  title: "Written Rows",
                  align: "left",
                },
                collapsed: false,
                gridPos: { w: 6, h: 6 },
                datasource: {
                  sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(written_rows)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
                },
              },

              {
                type: "line",
                titleOption: {
                  title: "Written Bytes",
                  align: "left",
                },
                collapsed: false,
                gridPos: { w: 6, h: 6 },
                datasource: {
                  sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(written_bytes)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
                },
              },

              {
                type: "line",
                titleOption: {
                  title: "Result Rows",
                  align: "left",
                },
                collapsed: false,
                gridPos: { w: 12, h: 6 },
                datasource: {
                  sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(result_rows)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
                },
              },

              {
                type: "line",
                titleOption: {
                  title: "Result Bytes",
                  align: "left",
                },
                collapsed: false,
                gridPos: { w: 12, h: 6 },
                datasource: {
                  sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t, 
    sum(result_bytes)
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
    AND type in ('QueryFinish')
GROUP BY t
ORDER BY t`,
                },
              },
            ],
          } as DashboardGroup,

          {
            type: "line",
            titleOption: {
              title: "CPU Time",
              align: "left",
            },
            collapsed: false,
            gridPos: { w: 24, h: 6 },
            datasource: {
              sql: `
SELECT 
    toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
    query_kind,
    sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) as OSCPUVirtualTimeMicroseconds
-- old version like 22 has problem with merge('system', '^query_log') function
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
    AND type in ('QueryFinish')
GROUP BY t, query_kind
ORDER BY t`,
            },
            drilldown: {
              cpu: {
                type: "table",
                gridPos: { w: 24, h: 12 },
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
                datasource: {
                  sql: `
SELECT 
ProfileEvents['OSCPUVirtualTimeMicroseconds'] as OSCPUVirtualTimeMicroseconds,
    *
FROM system.query_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND has(databases, '${escapeSqlString(database)}')
    AND has(tables, '${escapeSqlString(`${database}.${table}`)}')
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

    return (
      <DashboardPanelContainer
        ref={dashboardPanelsRef}
        dashboard={dashboard}
        initialTimeSpan={defaultTimeSpan}
      />
    );
  })
);

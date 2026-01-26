"use client";

import { useConnection } from "@/components/connection/connection-context";
import { formatQueryLogType } from "@/components/query-log-inspector/query-log-inspector-table-view";
import type {
  ActionColumn,
  Dashboard,
  DateTimeFilterSpec,
  FilterSpec,
  SelectorFilterSpec,
  TableDescriptor,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPage from "@/components/shared/dashboard/dashboard-page";
import { QueryIdLink } from "@/components/shared/query-id-link";
import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import { qualifyTableNames } from "@/lib/query-utils";
import { AlertCircle, Sparkle, Wand2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useChatPanel } from "../chat/view/use-chat-panel";
import { Button } from "../ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";

interface QueryLogProps {
  database: string;
  table: string;
}

const QueryLog = ({ database: _database, table: _table }: QueryLogProps) => {
  const { connection } = useConnection();

  // NOTE: keep the {cluster} replacement, it will be processed by the underlying connection object
  const DISTRIBUTION_QUERY = useMemo(
    () => `
SELECT
    toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
    type,
    count(1) as count
FROM 
${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_log)` : "system.query_log"}
WHERE 
  {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, type
ORDER BY t, type
`,
    []
  );

  const TABLE_QUERY = useMemo(
    () => `
SELECT ${connection!.metadata.query_log_table_has_hostname_column ? "" : "FQDN(), "} * FROM
${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_log)` : "system.query_log"}
WHERE 
  {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
AND event_time < {to:String}
ORDER BY event_time DESC
`,
    []
  );

  const filterSpecs = useMemo<FilterSpec[]>(() => {
    const hostname = connection!.metadata.query_log_table_has_hostname_column
      ? "hostname"
      : "FQDN()";
    return [
      {
        filterType: "date_time",
        alias: "_interval",
        displayText: "time",
        timeColumn: "event_time",
        defaultTimeSpan: "Last 15 Mins",
      } as DateTimeFilterSpec,

      // Will be removed in the code below if it's NOT cluster mode
      {
        filterType: "select",
        name: hostname,
        displayText: hostname,
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `select distinct host_name from system.clusters WHERE cluster = '${connection!.cluster}' order by FQDN()`,
        },

        defaultPattern: {
          comparator: "=",
          values: [connection!.metadata.remoteHostName],
        },
      } as SelectorFilterSpec,
      {
        filterType: "select",
        name: "type",
        displayText: "type",
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
        name: "query_kind",
        displayText: "query_kind",
        onPreviousFilters: true,
        defaultPattern: {
          comparator: "!=",
          values: ["Insert"],
        },
        datasource: {
          type: "sql",
          sql: `SELECT DISTINCT query_kind
FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_log)` : "system.query_log"}
WHERE ({filterExpression:String})
    AND event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND query_kind <> ''
ORDER BY query_kind
LIMIT 100`,
        },
      } as SelectorFilterSpec,
      {
        filterType: "select",
        name: "databases",
        displayText: "databases",
        onPreviousFilters: true,
        expressionTemplate: {
          "=": "has({name}, {value})",
          "!=": "NOT has({name}, {value})",
          in: "hasAny({name}, {valuesArray})",
          "not in": "NOT hasAny({name}, {valuesArray})",
        },
        datasource: {
          type: "sql",
          sql: `SELECT DISTINCT arrayJoin(databases) as database FROM (
SELECT DISTINCT databases
FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_log)` : "system.query_log"}
WHERE ({filterExpression:String})
    AND event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
LIMIT 100)
ORDER BY database
`,
        },
      } as SelectorFilterSpec,
      {
        filterType: "select",
        name: "tables",
        displayText: "tables",
        onPreviousFilters: true,
        supportedComparators: ["=", "!=", "in", "not in"],
        expressionTemplate: {
          "=": "has({name}, {value})",
          "!=": "NOT has({name}, {value})",
          in: "hasAny({name}, {valuesArray})",
          "not in": "NOT hasAny({name}, {valuesArray})",
        },
        datasource: {
          type: "sql",
          sql: `SELECT DISTINCT arrayJoin(tables) as table FROM (
SELECT DISTINCT tables
FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_log)` : "system.query_log"}
WHERE ({filterExpression:String})
    AND event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
LIMIT 100)
ORDER BY table
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
      {
        filterType: "select",
        name: "initial_user",
        displayText: "initial_user",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          // NOTE: don't use ORDER BY 1, some old release does not support this well
          sql: `
SELECT DISTINCT initial_user
FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.query_log)` : "system.query_log"}
WHERE ({filterExpression:String})
    AND event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND initial_user <> ''
ORDER BY initial_user
LIMIT 100
`,
        },
      } as SelectorFilterSpec,
    ].filter((spec) => {
      const hasCluster = connection?.cluster && connection?.cluster.length > 0;
      if (hasCluster) {
        return spec;
      } else if (spec.filterType === "select" && spec.name === hostname) {
        // NOT in the cluster mode, remove the FQDN filter
        return false;
      }
      return true;
    });
  }, []);

  // Build Dashboard configuration with chart and table
  const dashboard = useMemo<Dashboard>(() => {
    return {
      version: 3,
      filter: {},
      charts: [
        {
          type: "bar",
          titleOption: { title: `Query Count Distribution`, showTitle: true, align: "left" },
          datasource: {
            sql: DISTRIBUTION_QUERY,
          },
          legendOption: {
            placement: "inside",
          },
          fieldOptions: {
            t: { name: "t", type: "datetime" },
            count: { name: "count", type: "number" },
            type: { name: "type", type: "string" },
          },
          stacked: true,
          height: 150,
          gridPos: { w: 24, h: 4 },
        } as TimeseriesDescriptor,
        {
          type: "table",
          titleOption: { title: `Query Log Records`, showTitle: true, align: "left" },
          datasource: {
            sql: TABLE_QUERY,
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
            type: { format: formatQueryLogType },
            initial_query_id: {
              width: 250,
              position: 1,
              format: (value: unknown, _params?: unknown[], context?: Record<string, unknown>) => {
                if (!value) return "-";
                const queryId = typeof value === "string" ? value : String(value);
                const eventDate =
                  typeof context?.event_date === "string" ? context.event_date : undefined;
                return (
                  <QueryIdLink displayQueryId={queryId} queryId={queryId} eventDate={eventDate} />
                );
              },
            },
            query_id: {
              width: 250,
              position: 2,
              format: (value: unknown, _params?: unknown[], row?: Record<string, unknown>) => {
                const queryId = typeof value === "string" ? value : String(value);
                const eventDate = typeof row?.event_date === "string" ? row.event_date : undefined;
                const initialQueryId =
                  typeof row?.initial_query_id === "string" ? row.initial_query_id : queryId;
                return (
                  <QueryIdLink
                    displayQueryId={queryId}
                    queryId={initialQueryId}
                    eventDate={eventDate}
                  />
                );
              },
            },
            memory_usage: { format: "binary_size" },
            query: { format: "sql" },
          },
          gridPos: { w: 24, h: 18 },
          actions: [
            {
              title: "Action",
              position: 1,
              renderAction: (row: Record<string, unknown>, _rowIndex: number) => {
                const hasException = row.exception !== null && row.exception !== "";

                return (
                  <HoverCard openDelay={100} closeDelay={100}>
                    <HoverCardTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <Sparkle className="!h-3 !w-3" />
                      </Button>
                    </HoverCardTrigger>
                    <HoverCardContent className="max-w-[220px] p-1" align="start" side="right">
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="justify-start h-8 px-2"
                          onClick={() => handleAskForOptimization(row)}
                        >
                          <Wand2 className="mr-2 h-4 w-4" />
                          Ask AI for Optimization
                        </Button>
                        {hasException && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start h-8 px-2"
                            onClick={() => handleExplainError(row)}
                          >
                            <AlertCircle className="mr-2 h-4 w-4" />
                            Explain Error
                          </Button>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              },
            } as ActionColumn,
          ],
        } as TableDescriptor,
      ],
    };
  }, [DISTRIBUTION_QUERY, TABLE_QUERY]);

  const { postMessage } = useChatPanel();

  const handleAskForOptimization = useCallback(async (row: Record<string, unknown>) => {
    let query = row.formatted_query as string;
    if (query === undefined || query === null || query === "") {
      query = row.query as string;

      // Try to format it for better readability
      if (connection?.metadata.has_format_query_function) {
        const response = connection.query(`SELECT formatQuery('${query.replaceAll("'", "''")}')`, {
          default_format: "JSONCompact",
        }).response;
        try {
          const data = (await response).data.json<JSONCompactFormatResponse>();
          query = data.data[0][0] as string;
        } catch {
          // Ignore error
        }
      }
    }

    // Qualify table names using the tables array from query_log
    const tables = row.tables as string[] | undefined;
    if (tables && tables.length > 0) {
      query = qualifyTableNames(query, tables);
    }

    postMessage(
      `Please analyze the following SQL query and see if we can optimize it.
### SQL
\`\`\`sql
${query.trim()}
\`\`\`
`,
      { forceNewChat: true }
    );
  }, []);

  const handleExplainError = useCallback(async (row: Record<string, unknown>) => {
    let query = row.formatted_query as string;
    if (query === undefined || query === null || query === "") {
      query = row.query as string;

      // Try to format it for better readability
      if (connection?.metadata.has_format_query_function) {
        const response = connection.query(`SELECT formatQuery('${query.replaceAll("'", "''")}')`, {
          default_format: "JSONCompact",
        }).response;
        try {
          const data = (await response).data.json<JSONCompactFormatResponse>();
          query = data.data[0][0] as string;
        } catch {
          // Ignore error
        }
      }
    }
    // Qualify table names using the tables array from query_log
    const tables = row.tables as string[] | undefined;
    if (tables && tables.length > 0) {
      query = qualifyTableNames(query, tables);
    }

    postMessage(
      `The following SQL query has errors, please explain what went wrong in short and analyze the its performance and provide a fix.
### SQL
\`\`\`sql
${query.trim()}
\`\`\`

### Error Message
${row.exception as string}
`,
      { forceNewChat: true }
    );
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

export default QueryLog;

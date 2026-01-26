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
import { QueryIdLink } from "@/components/shared/query-id-link";
import { useMemo } from "react";

interface PartLogProps {
  database: string;
  table: string;
}

const PartLog = ({ database: _database, table: _table }: PartLogProps) => {
  const { connection } = useConnection();

  // NOTE: keep the {cluster} replacement, it will be processed by the underlying connection object
  const DISTRIBUTION_QUERY = useMemo(
    () => `
SELECT
    toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
    event_type,
    count(1) as count
FROM 
${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
WHERE 
  {filterExpression:String}
  AND event_date >= toDate({from:String}) 
  AND event_date >= toDate({to:String})
  AND event_time >= {from:String} 
  AND event_time < {to:String}
GROUP BY t, event_type
ORDER BY t, event_type
`,
    []
  );

  const TABLE_QUERY = useMemo(
    () => `
SELECT ${connection!.metadata.part_log_table_has_node_name_column ? "" : "FQDN(), "} * FROM
${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
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
    const hostname = connection!.metadata.part_log_table_has_node_name_column
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
        name: "event_type",
        displayText: "event_type",
        onPreviousFilters: true,
        defaultPattern: {
          comparator: "!=",
          values: ["RemovePart"],
        },
        datasource: {
          type: "inline",
          values: [
            { label: "NewPart", value: "NewPart" },
            { label: "MergeParts", value: "MergeParts" },
            { label: "DownloadPart", value: "DownloadPart" },
            { label: "RemovePart", value: "RemovePart" },
            { label: "MutatePart", value: "MutatePart" },
            { label: "MovePart", value: "MovePart" },
          ],
        },
      } as SelectorFilterSpec,
      {
        filterType: "select" as const,
        name: "database",
        displayText: "database",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `SELECT DISTINCT database
    FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
    WHERE ({filterExpression:String})
        AND event_date >= toDate({from:String}) 
        AND event_date >= toDate({to:String})
        AND event_time >= {from:String}
        AND event_time < {to:String}
        AND database <> ''
    ORDER BY database
    LIMIT 100`,
        },
      } as SelectorFilterSpec,
      {
        filterType: "select" as const,
        name: "table",
        displayText: "table",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `
    SELECT DISTINCT table
    FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
    WHERE ({filterExpression:String})
        AND event_date >= toDate({from:String}) 
        AND event_date >= toDate({to:String})
        AND event_time >= {from:String}
        AND event_time < {to:String}`,
        },
      } as SelectorFilterSpec,
      {
        filterType: "select" as const,
        name: "part_type",
        displayText: "part_type",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `
    SELECT DISTINCT part_type
    FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
    WHERE ({filterExpression:String})
        AND event_date >= toDate({from:String})
        AND event_date >= toDate({to:String})
        AND event_time >= {from:String}
        AND event_time < {to:String}
    ORDER BY part_type
    `,
        },
      } as SelectorFilterSpec,
      {
        filterType: "select" as const,
        name: "error",
        displayText: "error",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `
    SELECT DISTINCT error
    FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
    WHERE ({filterExpression:String})
        AND event_date >= toDate({from:String}) 
        AND event_date >= toDate({to:String})
        AND event_time >= {from:String}
        AND event_time < {to:String}
    ORDER BY error
    LIMIT 100
    `,
        },
      } as SelectorFilterSpec,
    ].filter((spec) => {
      const hasCluster = connection?.cluster && connection?.cluster.length > 0;
      if (hasCluster) {
        return true;
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
          titleOption: { title: `Part Log Distribution`, showTitle: true, align: "left" },
          datasource: {
            sql: DISTRIBUTION_QUERY,
          },
          legendOption: {
            placement: "inside",
          },
          fieldOptions: {
            t: { name: "t", type: "datetime" },
            count: { name: "count", type: "number" },
            event_type: { name: "event_type", type: "string" },
          },
          stacked: true,
          height: 150,
          gridPos: { w: 24, h: 4 },
        } as TimeseriesDescriptor,
        {
          type: "table",
          titleOption: { title: `Part Log Records`, showTitle: true, align: "left" },
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
        } as TableDescriptor,
      ],
    };
  }, [DISTRIBUTION_QUERY, TABLE_QUERY]);

  return (
    <DashboardPage
      panels={dashboard}
      filterSpecs={filterSpecs}
      showInputFilter={true}
      timezone={connection?.metadata.timezone ?? "UTC"}
      showTimeSpanSelector={true}
      showRefresh={true}
      showAutoRefresh={false}
      chartSelectionFilterName="event_type"
    />
  );
};

export default PartLog;

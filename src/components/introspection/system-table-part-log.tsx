"use client";

import { useConnection } from "@/components/connection/connection-context";
import DashboardFilterComponent, {
  type SelectedFilter,
} from "@/components/shared/dashboard/dashboard-filter";
import type {
  DateTimeFilterSpec,
  FilterSpec,
  SelectorFilterSpec,
  SQLQuery,
  TableDescriptor,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import type { DashboardVisualizationComponent } from "@/components/shared/dashboard/dashboard-visualization-layout";
import { DashboardVisualizationPanel } from "@/components/shared/dashboard/dashboard-visualization-panel";
import type { TimeSpan } from "@/components/shared/dashboard/timespan-selector";
import { QueryIdLink } from "@/components/shared/query-id-link";
import { Input } from "@/components/ui/input";
import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import { cn } from "@/lib/utils";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

interface SystemTablePartLogProps {
  database: string;
  table: string;
}

const SystemTablePartLog = ({ database: _database, table: _table }: SystemTablePartLogProps) => {
  const { connection } = useConnection();

  // Refs
  const inputFilterRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<DashboardFilterComponent>(null);
  const chartRef = useRef<DashboardVisualizationComponent | null>(null);
  const tableRef = useRef<DashboardVisualizationComponent | null>(null);

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
  AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
  AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
  AND event_time >= {from:String} 
  AND event_time <= {to:String}
GROUP BY t, event_type
ORDER BY t, event_type
`,
    []
  );

  const TABLE_QUERY = useMemo(
    () => `
SELECT ${connection!.metadata.part_log_table_has_node_name_column ? "hostname(), " : ""} * FROM
${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
WHERE 
  {filterExpression:String}
  AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
  AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
  AND event_time >= {from:String} 
AND event_time <= {to:String}
ORDER BY event_time DESC
`,
    []
  );

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
        name: "hostname()",
        displayText: "hostname()",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `select distinct host_name from system.clusters WHERE cluster = '${connection!.cluster}' order by host_name`,
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
        filterType: "select",
        name: "database",
        displayText: "database",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `SELECT DISTINCT database
    FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
    WHERE ({filterExpression:String})
        AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
        AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
        AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
        AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
        AND database <> ''
    ORDER BY database
    LIMIT 100`,
        },
      } as SelectorFilterSpec,
      {
        filterType: "select",
        name: "table",
        displayText: "table",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `
    SELECT DISTINCT table
    FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
    WHERE ({filterExpression:String})
        AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
        AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
        AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
        AND event_time < fromUnixTimestamp({endTimestamp:UInt32})`,
        },
      } as SelectorFilterSpec,
      {
        filterType: "select",
        name: "part_type",
        displayText: "part_type",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `
    SELECT DISTINCT part_type
    FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
    WHERE ({filterExpression:String})
        AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32}))
        AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
        AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
        AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    ORDER BY part_type
    `,
        },
      } as SelectorFilterSpec,
      {
        filterType: "select",
        name: "error",
        displayText: "error",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `
    SELECT DISTINCT error
    FROM ${connection!.cluster ? `clusterAllReplicas('{cluster}', system.part_log)` : "system.part_log"}
    WHERE ({filterExpression:String})
        AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
        AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
        AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
        AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    ORDER BY error
    LIMIT 100
    `,
        },
      } as SelectorFilterSpec,
    ].filter((spec) => {
      const hasCluster = connection?.cluster && connection?.cluster.length > 0;
      if (hasCluster) {
        return spec;
      } else if (spec.filterType === "select" && spec.name === "hostname()") {
        // NOT in the cluster mode, remove the hostname filter
        return false;
      }
      return true;
    });
  }, []);

  // Chart Descriptor
  const chartDescriptor = useMemo<TimeseriesDescriptor>(() => {
    return {
      type: "bar",
      titleOption: { title: `Part Log Distribution`, showTitle: true, align: "left" },
      query: {
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
    } as TimeseriesDescriptor;
  }, []);

  const tableDescriptor = useMemo<TableDescriptor>(() => {
    return {
      type: "table",
      titleOption: { title: `Part Log Records`, showTitle: true, align: "left" },
      query: {
        sql: TABLE_QUERY,
      },
      sortOption: {
        serverSideSorting: true,
        initialSort: { column: "event_time", direction: "desc" },
      },
      pagination: { mode: "server", pageSize: 100 },
      headOption: { isSticky: true },
      miscOption: { enableIndexColumn: true, enableShowRowDetail: true, enableCompactMode: true },
      fieldOptions: {
        initial_query_id: {
          width: 250,
          position: 1,
          format: (value: unknown, _params?: unknown[], context?: Record<string, unknown>) => {
            if (!value) return "-";
            const queryId = typeof value === "string" ? value : String(value);
            const eventDate =
              typeof context?.event_date === "string" ? context.event_date : undefined;
            return <QueryIdLink displayQueryId={queryId} queryId={queryId} eventDate={eventDate} />;
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
    };
  }, [TABLE_QUERY]);

  // Helper function to update SQLs and refresh panels
  const updateAndRefresh = useCallback(
    (timeSpan: TimeSpan, filter: SelectedFilter | undefined, inputFilterValue?: string) => {
      const parts: string[] = [];
      if (filter?.expr) {
        parts.push(filter.expr);
      }
      if (inputFilterValue !== undefined) {
        const value = inputFilterValue || inputFilterRef.current?.value || "";
        if (value) {
          parts.push(value);
        }
      } else {
        const value = inputFilterRef.current?.value || "";
        if (value) {
          parts.push(value);
        }
      }

      const filterExpression = parts.length > 0 ? parts.join(" AND ") : "1=1";
      tableDescriptor.query.sql = TABLE_QUERY.replace(
        "{filterExpression:String}",
        filterExpression
      );
      chartDescriptor.query.sql = DISTRIBUTION_QUERY.replace(
        "{filterExpression:String}",
        filterExpression
      );

      // Trigger refresh
      chartRef.current?.refresh({
        selectedTimeSpan: timeSpan,
        inputFilter: `filter_${Date.now()}`,
      });
      tableRef.current?.refresh({
        selectedTimeSpan: timeSpan,
        inputFilter: `filter_${Date.now()}`,
      });
    },
    // We intentionally don't include chartDescriptor and tableDescriptor in deps because:
    // 1. They're created with useMemo and are stable references
    // 2. We mutate their query.sql property directly, which doesn't change the reference
    // 3. We only want to trigger refreshes when filters change, not when descriptors are recreated
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    updateAndRefresh(
      filterRef.current!.getSelectedTimeSpan(),
      filterRef.current!.getSelectedFilter(),
      ""
    );
  }, [updateAndRefresh]);

  // Handlers - directly refresh panels when filter component state changes
  const handleSelectionFilterChange = useCallback(
    (filter: SelectedFilter) => {
      // Get current time span from filter component
      const timeSpan = filterRef.current?.getSelectedTimeSpan();
      if (!timeSpan) {
        return;
      }
      updateAndRefresh(timeSpan, filter);
    },
    [updateAndRefresh]
  );

  const handleTimeSpanChange = useCallback(
    (timeSpan: TimeSpan) => {
      // Get current filter from filter component
      const filter = filterRef.current?.getSelectedFilter();
      updateAndRefresh(timeSpan, filter);
    },
    [updateAndRefresh]
  );

  const handleChartSelection = useCallback(
    (timeSpan: TimeSpan, { name, series }: { name: string; series: string; value: number }) => {
      // Sync the filter UI - the callbacks will handle refreshing the panels
      filterRef.current?.setSelectedTimeSpan(timeSpan);
      filterRef.current?.setFilter(name, series);
    },
    []
  );

  const handleInputFilterKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        const inputFilterValue = inputFilterRef.current?.value || "";
        // Get current state from filter component
        const timeSpan = filterRef.current?.getSelectedTimeSpan();
        const filter = filterRef.current?.getSelectedFilter();
        if (timeSpan) {
          updateAndRefresh(timeSpan, filter, inputFilterValue);
        }
      }
    },
    [updateAndRefresh]
  );

  const handleLoadFilterData = useCallback(
    async (query: SQLQuery) => {
      if (!connection) return [];
      try {
        const { response } = connection.queryOnNode(query.sql, {
          default_format: "JSONCompact",
          ...query.params,
        });
        const apiResponse = await response;
        return apiResponse.data
          .json<JSONCompactFormatResponse>()
          .data.map((row: unknown[]) => String(row[0]));
      } catch (caught) {
        console.error(caught);
        return [];
      }
    },
    [connection]
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden p-2 gap-2">
      {/* Filter Section */}
      <DashboardFilterComponent
        ref={filterRef}
        filterSpecs={filterSpecs}
        onFilterChange={handleSelectionFilterChange}
        onTimeSpanChange={handleTimeSpanChange}
        onLoadSourceData={handleLoadFilterData}
        timezone={connection?.metadata.timezone ?? "UTC"}
        showTimeSpanSelector={true}
        showRefresh={true}
        showAutoRefresh={false}
      />

      {/* Input Filter */}
      <div className="relative">
        <Input
          ref={inputFilterRef}
          className="rounded-l rounded-r pl-2 h-8"
          placeholder="Input filter expression, press ENTER to apply"
          onKeyDown={handleInputFilterKeyDown}
        />
      </div>

      {/* Chart Section */}
      <div className="shrink-0 overflow-hidden">
        <DashboardVisualizationPanel
          ref={(r) => {
            if (chartRef.current !== r) {
              chartRef.current = r;
            }
          }}
          descriptor={chartDescriptor}
          selectedTimeSpan={filterRef.current?.getSelectedTimeSpan()}
          onChartSelection={handleChartSelection}
          className="h-full w-full"
        />
      </div>

      {/* Table Section */}
      <div className={cn("min-h-0 overflow-hidden")}>
        <DashboardVisualizationPanel
          ref={(r) => {
            if (tableRef.current !== r) {
              tableRef.current = r;
            }
          }}
          descriptor={tableDescriptor}
          selectedTimeSpan={filterRef.current?.getSelectedTimeSpan()}
        />
      </div>
    </div>
  );
};

export default SystemTablePartLog;

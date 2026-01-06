"use client";

import { formatQueryLogType } from "@/components/query-log-tab/query-log-table-view";
import DashboardFilterComponent, { type SelectedFilter } from "@/components/shared/dashboard/dashboard-filter";
import type {
  DateTimeFilterSpec,
  FilterSpec,
  SelectorFilterSpec,
  SQLQuery,
  TableDescriptor,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import type { DashboardPanelComponent } from "@/components/shared/dashboard/dashboard-panel-layout";
import DashboardPanelTable from "@/components/shared/dashboard/dashboard-panel-table";
import DashboardPanelTimeseries from "@/components/shared/dashboard/dashboard-panel-timeseries";
import type { TimeSpan } from "@/components/shared/dashboard/timespan-selector";
import { TabManager } from "@/components/tab-manager";
import { CopyButton } from "@/components/ui/copy-button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import { useConnection } from "@/lib/connection/connection-context";
import { cn } from "@/lib/utils";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface QueryIdLinkProps {
  displayQueryId: string;
  queryId: string;
  eventDate?: string;
}

const QueryIdLink = React.memo<QueryIdLinkProps>(({ displayQueryId, queryId, eventDate: event_date }) => {
  const truncatedId = displayQueryId.length > 12 ? displayQueryId.slice(0, 6) + "..." + displayQueryId.slice(-6) : displayQueryId;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    TabManager.openQueryLogTab(queryId, event_date);
  };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="font-monotext-xs text-blue-500 hover:underline cursor-pointer" onClick={handleClick}>
          {truncatedId}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="p-2 max-w-[400px]">
        <div className="flex items-center gap-2">
          <div className="font-mono text-xs break-all">{displayQueryId}</div>
          <CopyButton value={displayQueryId} className="!static !top-auto !right-auto shrink-0" />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
QueryIdLink.displayName = "QueryIdLink";

interface SystemTableQueryLogProps {
  database: string;
  table: string;
}

const FILTER_SPECS: FilterSpec[] = [
  {
    filterType: "date_time",
    alias: "_interval",
    displayText: "time",
    timeColumn: "event_time",
    defaultTimeSpan: "Last 15 Mins",
  } as DateTimeFilterSpec,
  {
    filterType: "select",
    name: "type",
    displayText: "type",
    defaultValue: "",
    width: 100,
    onPreviousFilters: true,
    datasource: {
      type: "inline",
      values: [
        { label: "QueryStart", value: "QueryStart" },
        { label: "QueryFinish", value: "QueryFinish" },
        { label: "ExceptionBeforeStart", value: "ExceptionBeforeStart" },
        { label: "ExceptionWhileProcessing", value: "ExceptionWhileProcessing" },
      ],
    },
  },
  {
    filterType: "select",
    name: "query_kind",
    displayText: "query_kind",
    defaultValue: "",
    width: 200,
    onPreviousFilters: true,
    datasource: {
      type: "sql",
      sql: `SELECT DISTINCT query_kind
FROM system.query_log
WHERE ({filterExpression:String})
    AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND query_kind <> ''
ORDER BY query_kind
LIMIT 100`,
    },
  },
  {
    filterType: "select",
    name: "databases",
    displayText: "databases",
    defaultValue: "",
    width: 200,
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
FROM system.query_log
WHERE ({filterExpression:String})
    AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
LIMIT 100)
ORDER BY database
`,
    },
  } as SelectorFilterSpec,
  {
    filterType: "select",
    name: "tables",
    displayText: "tables",
    defaultValue: "",
    width: 200,
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
FROM system.query_log
WHERE ({filterExpression:String})
    AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
LIMIT 100)
ORDER BY table
`,
    },
  } as SelectorFilterSpec,
  {
    filterType: "select",
    name: "exception_code",
    displayText: "exception_code",
    defaultValue: "",
    width: 200,
    onPreviousFilters: true,
    datasource: {
      type: "sql",
      sql: `
SELECT DISTINCT exception_code
FROM system.query_log
WHERE ({filterExpression:String})
    AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
ORDER BY exception_code
LIMIT 100
`,
    },
  } as SelectorFilterSpec,
  {
    filterType: "select",
    name: "initial_user",
    displayText: "initial_user",
    defaultValue: "",
    width: 150,
    onPreviousFilters: true,
    datasource: {
      type: "sql",
      // NOTE: don't use ORDER BY 1, some old release does not support this well
      sql: `
SELECT DISTINCT initial_user
FROM system.query_log
WHERE ({filterExpression:String})
    AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND initial_user <> ''
ORDER BY initial_user
LIMIT 100
`,
    },
  } as SelectorFilterSpec,
];

const DISTRIBUTION_QUERY = `
SELECT
    toStartOfInterval(event_time, interval {rounding:UInt32} second) as t,
    count(1) as count
FROM system.query_log
WHERE 
  {filterExpression:String}
  AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
  AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
  AND event_time >= {from:String} 
  AND event_time <= {to:String}
GROUP BY t
ORDER BY t`;

const TABLE_QUERY = `
SELECT * FROM system.query_log 
WHERE 
  {filterExpression:String}
  AND event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
  AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
  AND event_time >= {from:String} 
AND event_time <= {to:String}
ORDER BY event_time DESC`;

const SystemTableQueryLog = ({ database: _database, table: _table }: SystemTableQueryLogProps) => {
  const { connection } = useConnection();

  // State
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | undefined>(undefined);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilter | undefined>(undefined);
  const [inputFilter, setInputFilter] = useState<string>("");

  // Refs
  const inputFilterRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<DashboardFilterComponent>(null);
  const chartRef = useRef<DashboardPanelComponent | null>(null);
  const tableRef = useRef<DashboardPanelComponent | null>(null);
  const selectedTimeSpanRef = useRef<TimeSpan | undefined>(undefined);

  useEffect(() => {
    selectedTimeSpanRef.current = selectedTimeSpan;
  }, [selectedTimeSpan]);

  // Chart Descriptor
  const chartDescriptor = useMemo<TimeseriesDescriptor>(() => {
    return {
      type: "bar",
      titleOption: { title: `Query Count Distribution`, showTitle: true },
      query: {
        sql: DISTRIBUTION_QUERY,
      },
      legendOption: {
        placement: "none",
        values: [],
      },
      fieldOptions: {
        t: { name: "t", type: "datetime" },
        count: { name: "count", type: "number" },
      },
      height: 150,
    };
  }, []);

  const tableDescriptor = useMemo<TableDescriptor>(() => {
    return {
      type: "table",
      titleOption: { title: `Query Log Details`, showTitle: true },
      query: {
        sql: TABLE_QUERY,
      },
      sortOption: { serverSideSorting: true, initialSort: { column: "event_time", direction: "desc" } },
      pagination: { mode: "server", pageSize: 100 },
      headOption: { isSticky: true },
      miscOption: { enableIndexColumn: true, enableShowRowDetail: true, enableCompactMode: true },
      fieldOptions: {
        type: { format: formatQueryLogType },
        initial_query_id: {
          width: 250,
          position: 1,
          format: (value: unknown, _params?: unknown[], context?: Record<string, unknown>) => {
            if (!value) return "-";
            const queryId = typeof value === "string" ? value : String(value);
            const eventDate = typeof context?.event_date === "string" ? context.event_date : undefined;
            return <QueryIdLink displayQueryId={queryId} queryId={queryId} eventDate={eventDate} />;
          },
        },
        query_id: {
          width: 250,
          position: 2,
          format: (value: unknown, _params?: unknown[], row?: Record<string, unknown>) => {
            const queryId = typeof value === "string" ? value : String(value);
            const eventDate = typeof row?.event_date === "string" ? row.event_date : undefined;
            const initialQueryId = typeof row?.initial_query_id === "string" ? row.initial_query_id : queryId;
            return <QueryIdLink displayQueryId={queryId} queryId={initialQueryId} eventDate={eventDate} />;
          },
        },
        memory_usage: { format: "binary_size" },
        query: { format: "sql" },
      },
    };
  }, []);

  // Update SQLs
  useEffect(() => {
    const parts: string[] = [];
    if (selectedFilters?.expr) {
      parts.push(selectedFilters.expr);
    }
    if (inputFilter) {
      parts.push(inputFilter);
    }
    const filterExpression = parts.length > 0 ? parts.join(" AND ") : "1=1";
    tableDescriptor.query.sql = TABLE_QUERY.replace("{filterExpression:String}", filterExpression);
    chartDescriptor.query.sql = DISTRIBUTION_QUERY.replace("{filterExpression:String}", filterExpression);

    const currentTimeSpan = selectedTimeSpanRef.current;
    if (!currentTimeSpan) {
      return;
    }
    chartRef.current?.refresh({ selectedTimeSpan: currentTimeSpan, inputFilter: `filter_${Date.now()}` });
    tableRef.current?.refresh({ selectedTimeSpan: currentTimeSpan, inputFilter: `filter_${Date.now()}` });
  }, [selectedFilters, inputFilter, tableDescriptor, chartDescriptor]);

  // Handlers
  const handleSelectionFilterChange = useCallback((filter: SelectedFilter) => {
    setSelectedFilters(filter);
  }, []);

  const handleTimeSpanChange = useCallback((timeSpan: TimeSpan) => {
    setSelectedTimeSpan(timeSpan);
  }, []);

  const handleChartTimeSpanSelect = useCallback((timeSpan: TimeSpan) => {
    // Sync both the local state and the filter UI so subsequent loads use the new window.
    filterRef.current?.setSelectedTimeSpan(timeSpan);
    setSelectedTimeSpan(timeSpan);
  }, []);

  const handleInputFilterKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      setInputFilter(inputFilterRef.current?.value || "");
    }
  }, []);

  const handleLoadFilterData = useCallback(
    async (query: SQLQuery) => {
      if (!connection) return [];
      try {
        const { response } = connection.queryOnNode(query.sql, { default_format: "JSONCompact", ...query.params });
        const apiResponse = await response;
        return apiResponse.data.json<JSONCompactFormatResponse>().data.map((row: unknown[]) => String(row[0]));
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
        filterSpecs={FILTER_SPECS}
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
        {selectedTimeSpan && (
          <DashboardPanelTimeseries
            ref={chartRef}
            descriptor={chartDescriptor}
            selectedTimeSpan={selectedTimeSpan}
            onTimeSpanSelect={handleChartTimeSpanSelect}
            className="h-full w-full"
          />
        )}
      </div>

      {/* Table Section */}
      <div className={cn("min-h-0 overflow-hidden")}>
        <DashboardPanelTable
          ref={tableRef}
          descriptor={tableDescriptor}
          selectedTimeSpan={selectedTimeSpan}
          className="w-full h-full"
        />
      </div>
    </div>
  );
};

export default SystemTableQueryLog;

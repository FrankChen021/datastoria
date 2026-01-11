"use client";

import { useConnection } from "@/components/connection/connection-context";
import { formatQueryLogType } from "@/components/query-log-inspector/query-log-inspector-table-view";
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
import { DashboardPanel } from "@/components/shared/dashboard/dashboard-panel";
import type { DashboardVisualizationComponent } from "@/components/shared/dashboard/dashboard-visualization-layout";
import {
  getDisplayTimeSpanByLabel,
  type TimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import { TabManager } from "@/components/tab-manager";
import { CopyButton } from "@/components/ui/copy-button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import { cn } from "@/lib/utils";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface QueryIdLinkProps {
  displayQueryId: string;
  queryId: string;
  eventDate?: string;
}

const QueryIdLink = React.memo<QueryIdLinkProps>(
  ({ displayQueryId, queryId, eventDate: event_date }) => {
    const truncatedId =
      displayQueryId.length > 12
        ? displayQueryId.slice(0, 6) + "..." + displayQueryId.slice(-6)
        : displayQueryId;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      TabManager.openQueryLogTab(queryId, event_date);
    };

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <span
            className="font-monotext-xs text-blue-500 hover:underline cursor-pointer"
            onClick={handleClick}
          >
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
  }
);
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
  },
  {
    filterType: "select",
    name: "query_kind",
    displayText: "query_kind",
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

  // Calculate initial time span the same way the filter component does
  // This prevents double-fetching: panels will mount with selectedTimeSpan already set,
  // so they'll trigger one refresh on mount. When filter component calls onTimeSpanChange
  // with the same value, it won't trigger another refresh.
  const initialTimeSpan = useMemo(() => {
    const defaultTimeSpanLabel =
      FILTER_SPECS.find((f): f is DateTimeFilterSpec => f.filterType === "date_time")
        ?.defaultTimeSpan || "Last 15 Mins";
    const displayTimeSpan = getDisplayTimeSpanByLabel(defaultTimeSpanLabel);
    return displayTimeSpan.getTimeSpan();
  }, []);

  // State - initialize with the same value filter component will use
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | undefined>(initialTimeSpan);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilter | undefined>(undefined);
  const [inputFilter, setInputFilter] = useState<string>("");

  // Refs
  const inputFilterRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<DashboardFilterComponent>(null);
  const chartRef = useRef<DashboardVisualizationComponent | null>(null);
  const tableRef = useRef<DashboardVisualizationComponent | null>(null);
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
      titleOption: { title: `Query Log Records`, showTitle: true },
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
        type: { format: formatQueryLogType },
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
  }, []);

  // Update SQLs when filters change
  // Note: We don't trigger refresh on initial mount when time span is first set - that's handled by useRefreshable
  // We only trigger refresh here when filters actually change after initial setup
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
    chartDescriptor.query.sql = DISTRIBUTION_QUERY.replace(
      "{filterExpression:String}",
      filterExpression
    );

    const currentTimeSpan = selectedTimeSpanRef.current;
    if (!currentTimeSpan) {
      return;
    }

    // Trigger refresh with a filter change indicator to force refresh even if time span hasn't changed
    // This ensures that when filters change, the data is refreshed
    // Note: We don't need to skip on initial setup anymore because selectedTimeSpan is initialized
    // with the same value the filter component uses, so panels will refresh once on mount via useRefreshable,
    // and when filter component calls onTimeSpanChange with the same value, it won't trigger another refresh.
    chartRef.current?.refresh({
      selectedTimeSpan: currentTimeSpan,
      inputFilter: `filter_${Date.now()}`,
    });
    tableRef.current?.refresh({
      selectedTimeSpan: currentTimeSpan,
      inputFilter: `filter_${Date.now()}`,
    });
    // We intentionally don't include chartDescriptor and tableDescriptor in deps because:
    // 1. They're created with useMemo and are stable references
    // 2. We mutate their query.sql property directly, which doesn't change the reference
    // 3. We only want to trigger refreshes when filters change, not when descriptors are recreated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilters, inputFilter]);

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
          <DashboardPanel
            onRef={(r) => {
              if (chartRef.current !== r) {
                chartRef.current = r;
              }
            }}
            descriptor={chartDescriptor}
            selectedTimeSpan={selectedTimeSpan}
            onTimeSpanSelect={handleChartTimeSpanSelect}
            className="h-full w-full"
          />
        )}
      </div>

      {/* Table Section */}
      <div className={cn("min-h-0 overflow-hidden")}>
        {selectedTimeSpan && (
          <DashboardPanel
            onRef={(r) => {
              if (tableRef.current !== r) {
                tableRef.current = r;
              }
            }}
            descriptor={tableDescriptor}
            selectedTimeSpan={selectedTimeSpan}
          />
        )}
      </div>
    </div>
  );
};

export default SystemTableQueryLog;

import { useConnection } from "@/components/connection/connection-context";
import { SQLQueryBuilder } from "@/components/shared/dashboard/sql-query-builder";
import TimeSpanSelector, {
  BUILT_IN_TIME_SPAN_LIST,
  DisplayTimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import FloatingProgressBar from "@/components/shared/floating-progress-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type JSONFormatResponse, type QueryError } from "@/lib/connection/connection";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { toastManager } from "@/lib/toast";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { Maximize2, RotateCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryResponseErrorView } from "../query-tab/query-response/query-response-error-view";
import { QueryLogInspectorTableView } from "./query-log-inspector-table-view";
import { transformQueryLogsToTree } from "./query-log-inspector-timeline-types";
import QueryLogInspectorTimelineView from "./query-log-inspector-timeline-view";
import { QueryLogInspectorTopoView, type GraphControlsRef } from "./query-log-inspector-topo-view";

// Sub-component: Unified Header
interface HeaderControlsProps {
  initialQueryId?: string;
  onSearch: (queryId: string, timeSpan: DisplayTimeSpan) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

const HeaderControls = memo(function HeaderControls({
  initialQueryId,
  onSearch,
  isLoading,
  onRefresh,
}: HeaderControlsProps) {
  // Local state for the search input
  const [searchQueryId, setSearchQueryId] = useState<string>(initialQueryId || "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Local state for the time span
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(() => {
    return BUILT_IN_TIME_SPAN_LIST[12]; // Default to "Today"
  });

  // Update local state when initialQueryId changes
  useEffect(() => {
    setSearchQueryId(initialQueryId || "");
  }, [initialQueryId]);

  // Auto-focus the input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Default time span - always use "Today" as default
  const defaultTimeSpan = BUILT_IN_TIME_SPAN_LIST[12]; // Default to "Today"

  // Handle search action - calls onSearch with both queryId and timeSpan
  const handleSearch = useCallback(() => {
    const trimmedId = searchQueryId.trim();
    if (trimmedId) {
      onSearch(trimmedId, selectedTimeSpan);
    }
  }, [searchQueryId, selectedTimeSpan, onSearch]);

  // Handle time span change - update local state and trigger search if queryId exists
  const handleTimeSpanChange = useCallback(
    (timeSpan: DisplayTimeSpan) => {
      setSelectedTimeSpan(timeSpan);
      const trimmedId = searchQueryId.trim();
      if (trimmedId) {
        onSearch(trimmedId, timeSpan);
      }
    },
    [searchQueryId, onSearch]
  );

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <div className="relative flex-shrink-0 flex items-center px-2 py-2 bg-background">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Enter Query ID to search..."
          value={searchQueryId}
          onChange={(e) => setSearchQueryId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-8 h-9 rounded-sm w-full rounded-r-none"
        />
      </div>

      <div className="flex items-center">
        <TimeSpanSelector
          key="default"
          defaultTimeSpan={defaultTimeSpan}
          showTimeSpanSelector={true}
          showRefresh={false}
          showAutoRefresh={false}
          size="sm"
          onSelectedSpanChanged={handleTimeSpanChange}
          buttonClassName="rounded-none border-l-0 border-r-0 h-9"
        />
        <Button
          disabled={isLoading}
          variant="outline"
          size="icon"
          onClick={onRefresh}
          className="h-9 w-9 hover:bg-muted rounded-l-none"
        >
          <RotateCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
});

// Helper function to create a DisplayTimeSpan for a specific date
function createTimeSpanForDate(eventDate: string): DisplayTimeSpan {
  try {
    // Try to parse the eventDate - it might be in various formats
    let date: Date;
    if (eventDate.includes("T") || eventDate.includes(" ")) {
      // ISO format or date-time format
      date = parseISO(eventDate);
    } else {
      // Date only format (YYYY-MM-DD)
      date = parseISO(eventDate + "T00:00:00");
    }

    if (isNaN(date.getTime())) {
      // If parsing fails, fall back to default
      return BUILT_IN_TIME_SPAN_LIST[12]; // "Today"
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    const startISO = DateTimeExtension.formatISO8601(start) || "";
    const endISO = DateTimeExtension.formatISO8601(end) || "";
    const label = DateTimeExtension.toYYYYMMddHHmmss(start).split(" ")[0]; // Just the date part

    return new DisplayTimeSpan(label, "user", "unit", true, startISO, endISO);
  } catch {
    // If any error occurs, fall back to default
    return BUILT_IN_TIME_SPAN_LIST[12]; // "Today"
  }
}

interface QueryLogInspectorTabProps {
  initialQueryId?: string;
  initialEventDate?: string;
}

export function QueryLogInspectorTab({
  initialQueryId,
  initialEventDate,
}: QueryLogInspectorTabProps) {
  // Internal State
  const { connection } = useConnection();
  const [isLoading, setLoading] = useState(false);
  const [queryLogs, setQueryLogs] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ name: string; type?: string }[]>([]);
  const [queryText, setQueryText] = useState<string>("");
  const [loadError, setQueryLogLoadError] = useState<QueryError | null>(null);
  const graphControlsRef = useRef<GraphControlsRef | null>(null);

  // Tab state - default to Timeline
  const [activeTab, setActiveTab] = useState<string>("timeline");

  // Fit view when switching to topology tab
  useEffect(() => {
    if (activeTab === "topo") {
      // Small delay to ensure the container is visible and has dimensions
      requestAnimationFrame(() => {
        setTimeout(() => {
          graphControlsRef.current?.fitView();
        }, 100);
      });
    }
  }, [activeTab]);

  // Timeline data transformation
  const timelineData = useMemo(() => {
    if (!queryLogs || queryLogs.length === 0) {
      return { tree: [], flatList: [], stats: { totalNodes: 0, minTimestamp: 0, maxTimestamp: 0 } };
    }
    return transformQueryLogsToTree(queryLogs);
  }, [queryLogs]);

  // Active query ID state
  const [activeQueryId, setActiveQueryId] = useState<string | undefined>(initialQueryId);

  // Create initial time span based on eventDate if provided, otherwise use prop or default to "Today"
  const initialTimeSpanValue = useMemo(() => {
    if (initialEventDate) {
      return createTimeSpanForDate(initialEventDate);
    }
    return BUILT_IN_TIME_SPAN_LIST[12]; // Default to "Today"
  }, [initialEventDate]);

  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(initialTimeSpanValue);

  // Update activeQueryId when initialQueryId changes
  useEffect(() => {
    if (initialQueryId !== undefined) {
      setActiveQueryId(initialQueryId);
    }
  }, [initialQueryId]);

  // Update time span when initialEventDate changes
  useEffect(() => {
    if (initialEventDate) {
      const newTimeSpan = createTimeSpanForDate(initialEventDate);
      setSelectedTimeSpan(newTimeSpan);
    }
  }, [initialEventDate]);

  // Handle search - called when user wants to search for a query ID with a time span
  const handleSearch = useCallback((queryId: string, timeSpan: DisplayTimeSpan) => {
    setActiveQueryId(queryId);
    setSelectedTimeSpan(timeSpan);
  }, []);

  // Load query log data
  const loadQueryLog = useCallback(async () => {
    if (activeQueryId === null || activeQueryId === undefined) {
      return;
    }

    if (connection === null || connection === undefined) {
      toastManager.show(
        "No connection selected. Please select a connection to view query logs.",
        "error"
      );
      return;
    }

    setLoading(true);

    try {
      const timezone = connection.metadata.timezone;
      const queryText = new SQLQueryBuilder(
        `
SELECT
  FQDN() as host, 
  toUnixTimestamp64Micro(query_start_time_microseconds) as start_time_microseconds, 
  * 
FROM {clusterAllReplicas:system.query_log}
WHERE initial_query_id = '{initialQueryId}'
AND event_date >= toDate({from:String}) 
AND event_date >= toDate({to:String})
AND event_time >= {from:String} 
AND event_time < {to:String}
AND type <> 'QueryStart'
ORDER BY start_time_microseconds
`
      )
        .timeSpan(selectedTimeSpan.getTimeSpan(), timezone)
        .replace("initialQueryId", activeQueryId)
        .build();

      setQueryText(queryText);

      const { response } = connection.query(queryText, {
        default_format: "JSON",
        output_format_json_quote_64bit_integers: 0,
      });

      const apiResponse = await response;

      const responseData = apiResponse.data.json<JSONFormatResponse>();
      const queryLogsData = responseData?.data || [];
      const metaData = responseData?.meta || [];
      setQueryLogs(queryLogsData);
      setMeta(metaData);
      setQueryLogLoadError(null);
    } catch (error) {
      setQueryLogs([]);
      // Only set error if not cancelled
      if (!(error instanceof String && error.toString().includes("canceled"))) {
        setQueryLogLoadError(error as QueryError);
      }
    } finally {
      setLoading(false);
    }
  }, [activeQueryId, connection, selectedTimeSpan]);

  useEffect(() => {
    loadQueryLog();
  }, [loadQueryLog]);

  return (
    <div className="h-full w-full bg-background flex flex-col">
      <FloatingProgressBar show={isLoading} />
      {/* Unified Header */}
      <HeaderControls
        initialQueryId={initialQueryId}
        onSearch={handleSearch}
        isLoading={isLoading}
        onRefresh={loadQueryLog}
      />

      {loadError ? (
        <div className="px-2">
          <QueryResponseErrorView
            sql={queryText}
            error={{
              message: loadError.message,
              data: loadError.data,
              exceptionCode: loadError.errorCode,
            }}
          />
        </div>
      ) : !activeQueryId ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className="text-sm text-muted-foreground">Enter a Query ID to search query logs</div>
        </div>
      ) : queryLogs.length === 0 ? (
        isLoading ? null : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <div className="text-sm text-muted-foreground">No query log data available</div>
            <div className="text-sm text-muted-foreground">
              If the query was submitted just now, please wait for a few seconds to refresh.
            </div>
          </div>
        )
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex justify-between items-center ml-2 mr-2">
            <TabsList>
              <TabsTrigger value="timeline" id="tab-timeline">
                Timeline View
              </TabsTrigger>
              <TabsTrigger value="table" id="tab-table">
                Table View
              </TabsTrigger>
              <TabsTrigger value="topo" id="tab-topo">
                Topology View
              </TabsTrigger>
            </TabsList>
            {activeTab === "topo" && graphControlsRef.current && queryLogs.length > 0 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => graphControlsRef.current?.zoomIn()}
                  className="h-8 w-8"
                  title="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => graphControlsRef.current?.zoomOut()}
                  className="h-8 w-8"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => graphControlsRef.current?.fitView()}
                  className="h-8 w-8"
                  title="Fit View"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 relative overflow-hidden">
            <div
              className={`absolute inset-0 overflow-auto px-2 ${activeTab === "timeline" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-labelledby="tab-timeline"
              aria-hidden={activeTab !== "timeline"}
            >
              <QueryLogInspectorTimelineView
                inputNodeTree={timelineData.tree}
                inputNodeList={timelineData.flatList}
                timelineStats={timelineData.stats}
                isActive={activeTab === "timeline"}
              />
            </div>
            <div
              className={`absolute inset-0 overflow-auto px-2 ${activeTab === "table" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-labelledby="tab-table"
              aria-hidden={activeTab !== "table"}
            >
              <QueryLogInspectorTableView queryLogs={queryLogs} meta={meta} />
            </div>
            <div
              className={`absolute inset-0 overflow-auto px-2 ${activeTab === "topo" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-labelledby="tab-topo"
              aria-hidden={activeTab !== "topo"}
            >
              <QueryLogInspectorTopoView ref={graphControlsRef} queryLogs={queryLogs} />
            </div>
          </div>
        </Tabs>
      )}
    </div>
  );
}

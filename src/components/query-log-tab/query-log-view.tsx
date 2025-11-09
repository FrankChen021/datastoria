import TimeSpanSelector, { BUILT_IN_TIME_SPAN_LIST, DisplayTimeSpan } from "@/components/dashboard/timespan-selector";
import FloatingProgressBar from "@/components/floating-progress-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Api, type ApiErrorResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { toastManager } from "@/lib/toast";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { ArrowLeft, Maximize2, RotateCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ApiErrorView } from "../query-tab/query-response-view";
import { QueryLogDetailPane } from "./query-log-detail-pane";
import { QueryLogGraph, type GraphControlsRef } from "./query-log-graph";

interface QueryLogViewProps {
  queryId?: string;
  onClose?: () => void;
  embedded?: boolean;
  onQueryIdChange?: (queryId: string | undefined) => void;
  initialTimeSpan?: DisplayTimeSpan;
  onTimeSpanChange?: (timeSpan: DisplayTimeSpan) => void;
  initialEventDate?: string;
}


// Sub-component: Header Controls for Search Mode
interface HeaderControlsSearchModeProps {
  initialQueryId?: string;
  onSearch: (queryId: string, timeSpan: DisplayTimeSpan) => void;
  graphControlsRef: React.RefObject<GraphControlsRef | null>;
  showGraphControl: boolean;
}

const HeaderControlsSearchMode = memo(function HeaderControlsSearchMode({
  initialQueryId,
  onSearch,
  graphControlsRef,
  showGraphControl,
}: HeaderControlsSearchModeProps) {
  // Local state for the search input
  const [searchQueryId, setSearchQueryId] = useState<string>(initialQueryId || "");

  // Local state for the time span
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(() => {
    return BUILT_IN_TIME_SPAN_LIST[12]; // Default to "Today"
  });

  // Update local state when initialQueryId changes
  useEffect(() => {
    setSearchQueryId(initialQueryId || "");
  }, [initialQueryId]);

  // Default time span - always use "Today" as default
  const defaultTimeSpan = useMemo(() => {
    return BUILT_IN_TIME_SPAN_LIST[12]; // Default to "Today"
  }, []);

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
    <div className="relative flex-shrink-0 flex items-center px-1 py-1 border-b bg-background">
      <div className="relative flex-1 max-w-md ml-2">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Enter Query ID to search..."
          value={searchQueryId}
          onChange={(e) => setSearchQueryId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-9 h-8"
        />
      </div>
      {graphControlsRef.current && showGraphControl && (
        <>
          <div className="w-px h-6 bg-border ml-2" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => graphControlsRef.current?.zoomIn()}
            className="ml-1 h-8 w-8"
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
        </>
      )}
      <div className="flex items-center ml-auto">
        <TimeSpanSelector
          key="default"
          defaultTimeSpan={defaultTimeSpan}
          showTimeSpanSelector={true}
          showRefresh={false}
          showAutoRefresh={false}
          size="sm"
          onSelectedSpanChanged={handleTimeSpanChange}
        />
      </div>
    </div>
  );
});

// Sub-component: Header Controls for Full-Screen Mode
interface HeaderControlsFullScreenModeProps {
  onClose?: () => void;
  isLoading: boolean;
  graphControlsRef: React.RefObject<GraphControlsRef | null>;
  showGraphControl: boolean;
  onRefresh: () => void;
}

const HeaderControlsFullScreenMode = memo(function HeaderControlsFullScreenMode({
  onClose,
  isLoading,
  graphControlsRef,
  showGraphControl,
  onRefresh,
}: HeaderControlsFullScreenModeProps) {
  return (
    <div className="relative flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b bg-background h-10">
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
      <Button
        disabled={isLoading}
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        className="h-8 w-8"
      >
        <RotateCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
      </Button>
      {graphControlsRef.current && showGraphControl && (
        <>
          <div className="w-px h-6 bg-border mx-1" />
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
        </>
      )}
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

export function QueryLogView({
  queryId: initialQueryId,
  onClose,
  embedded = false,
  onQueryIdChange,
  initialTimeSpan,
  onTimeSpanChange,
  initialEventDate,
}: QueryLogViewProps) {
  // Derive showSearch from embedded (they are exclusive)
  const showSearch = embedded;

  // Internal State
  const { selectedConnection } = useConnection();
  const [isLoading, setLoading] = useState(false);
  const [queryLogs, setQueryLogs] = useState<any[]>([]);
  const [loadError, setQueryLogLoadError] = useState<ApiErrorResponse | null>(null);
  const [selectedQueryLog, setSelectedQueryLog] = useState<any>(undefined);
  const [sourceNode, setSourceNode] = useState<string | undefined>(undefined);
  const [targetNode, setTargetNode] = useState<string | undefined>(undefined);
  const graphControlsRef = useRef<GraphControlsRef>(null);

  // Active query ID state
  const [activeQueryId, setActiveQueryId] = useState<string | undefined>(initialQueryId);

  // Create initial time span based on eventDate if provided, otherwise use prop or default to "Today"
  const initialTimeSpanValue = useMemo(() => {
    if (initialEventDate) {
      return createTimeSpanForDate(initialEventDate);
    }
    if (initialTimeSpan) {
      return initialTimeSpan;
    }
    return BUILT_IN_TIME_SPAN_LIST[12]; // Default to "Today"
  }, [initialEventDate, initialTimeSpan]);

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
  const handleSearch = useCallback(
    (queryId: string, timeSpan: DisplayTimeSpan) => {
      setActiveQueryId(queryId);
      setSelectedTimeSpan(timeSpan);
      onQueryIdChange?.(queryId);
      onTimeSpanChange?.(timeSpan);
    },
    [onQueryIdChange, onTimeSpanChange]
  );

  // Handle query log selection from GraphContent
  const handleQueryLogSelected = useCallback((queryLog: any, sourceNode?: string, targetNode?: string) => {
    setSelectedQueryLog(queryLog);
    setSourceNode(sourceNode);
    setTargetNode(targetNode);
  }, []);

  const loadQueryLog = useCallback(async () => {
    if (activeQueryId === null || activeQueryId === undefined) {
      return;
    }

    const connection = selectedConnection;
    if (connection === null) {
      toastManager.show("No connection selected.", "error");
      return;
    }

    const queryTable =
      connection.cluster.length > 0
        ? `clusterAllReplicas('${connection.cluster}', system, query_log)`
        : "system.query_log";

    setLoading(true);

    const api = Api.create(connection);
    try {
      // Build WHERE clause with timespan if available
      let whereClause = `initial_query_id = '${activeQueryId}'`;

      if (selectedTimeSpan) {
        const timeSpan = selectedTimeSpan.getTimeSpan();
        if (timeSpan.startISO8601 && timeSpan.endISO8601) {
          // Parse ISO8601 to ClickHouse date format
          const startDate = timeSpan.startISO8601.split("T")[0];
          const endDate = timeSpan.endISO8601.split("T")[0];
          whereClause += ` AND event_date >= '${startDate}' AND event_date <= '${endDate}'`;
        }
      } else {
        // Default to yesterday if no timespan selector
        whereClause += ` AND event_date > yesterday()`;
      }

      const response = await api.executeAsync({
        // Sort the result properly so that the finish event will overwrite the start event in the later event processing
        sql: `SELECT FQDN() as host, * 
          FROM ${queryTable} 
          WHERE ${whereClause} ORDER BY host, event_time_microseconds`,
        params: {
          default_format: "JSON",
        },
      });

      const responseData = response.data as any;
      const queryLogsData = responseData?.data || [];
      setQueryLogs(queryLogsData);
      setQueryLogLoadError(null);
    } catch (error) {
      setQueryLogs([]);
      setQueryLogLoadError(error as ApiErrorResponse);
    } finally {
      setLoading(false);
    }
  }, [activeQueryId, selectedConnection, selectedTimeSpan]);

  useEffect(() => {
    loadQueryLog();
  }, [loadQueryLog]);

  const handleCloseQueryLog = useCallback(() => {
    setSelectedQueryLog(undefined);
    setSourceNode(undefined);
    setTargetNode(undefined);
  }, []);

  // Fit view after detail pane is shown (layout has adjusted)
  useEffect(() => {
    if (selectedQueryLog && graphControlsRef.current) {
      // Use double requestAnimationFrame to ensure DOM layout has fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          graphControlsRef.current?.fitView();
        });
      });
    }
  }, [selectedQueryLog]);

  // Handle ESC key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (onClose) {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const containerClassName = useMemo(
    () =>
      embedded
        ? "h-full w-full bg-background flex flex-col"
        : "fixed inset-0 z-[9999] bg-background flex flex-col",
    [embedded]
  );

  return (
    <div className={containerClassName}>
      <FloatingProgressBar show={isLoading} />
      {showSearch ? (
        // Search mode: Top/Bottom layout
        <>
          {/* Top: Header Controls */}
          <HeaderControlsSearchMode
            initialQueryId={activeQueryId}
            onSearch={handleSearch}
            graphControlsRef={graphControlsRef}
            showGraphControl={queryLogs.length > 0}
          />

          {/* Bottom: Graph and Query Log Details (Horizontal Split) */}
          <PanelGroup direction="horizontal" className="flex-1 min-h-0">
            {/* Left Panel: Graph View */}
            <Panel
              defaultSize={selectedQueryLog ? 60 : 100}
              minSize={selectedQueryLog ? 30 : 0}
              className="bg-background flex flex-col"
            >
              {loadError ? (
                <div className="p-4">
                  <ApiErrorView error={loadError} />
                </div>
              ) : !isLoading && !activeQueryId && showSearch ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <div className="text-sm text-muted-foreground">Enter a Query ID to search query logs</div>
                </div>
              ) : !isLoading && activeQueryId && queryLogs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <div className="text-sm text-muted-foreground">No query log data available</div>
                  <div className="text-sm text-muted-foreground">
                    If the query was submitted just now, please wait for a few seconds to refresh.
                  </div>
                </div>
              ) : (
                <QueryLogGraph
                  ref={graphControlsRef}
                  queryLogs={queryLogs}
                  onQueryLogSelected={handleQueryLogSelected}
                />
              )}
            </Panel>

            {/* Splitter */}
            {selectedQueryLog && (
              <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors cursor-col-resize" />
            )}

            {/* Right Panel: Query Log Details */}
            <QueryLogDetailPane
              selectedQueryLog={selectedQueryLog}
              onClose={handleCloseQueryLog}
              sourceNode={sourceNode}
              targetNode={targetNode}
            />
          </PanelGroup>
        </>
      ) : (
        // Full-screen mode: Left/Right layout
        <PanelGroup direction="horizontal" className="flex-1 min-h-0">
          {/* Left Panel: Header Controls + Graph View */}
          <Panel
            defaultSize={selectedQueryLog ? 60 : 100}
            minSize={selectedQueryLog ? 30 : 0}
            className="bg-background flex flex-col"
          >
            <HeaderControlsFullScreenMode
              onClose={onClose}
              isLoading={isLoading}
              graphControlsRef={graphControlsRef}
              showGraphControl={queryLogs.length > 0}
              onRefresh={loadQueryLog}
            />
            {loadError ? (
              <div className="p-4">
                <ApiErrorView error={loadError} />
              </div>
            ) : !isLoading && activeQueryId && queryLogs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <div className="text-sm text-muted-foreground">No query log data available</div>
                <div className="text-sm text-muted-foreground">
                  If the query was submitted just now, please wait for a few seconds to refresh.
                </div>
              </div>
            ) : (
              <QueryLogGraph
                ref={graphControlsRef}
                queryLogs={queryLogs}
                onQueryLogSelected={handleQueryLogSelected}
              />
            )}
          </Panel>

          {/* Splitter */}
          {selectedQueryLog && (
            <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors cursor-col-resize" />
          )}

          {/* Right Panel: Query Log Details */}
          <QueryLogDetailPane
            selectedQueryLog={selectedQueryLog}
            onClose={handleCloseQueryLog}
            sourceNode={sourceNode}
            targetNode={targetNode}
          />
        </PanelGroup>
      )}
    </div>
  );
}

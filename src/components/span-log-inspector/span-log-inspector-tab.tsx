import { useConnection } from "@/components/connection/connection-context";
import { SQLQueryBuilder } from "@/components/shared/dashboard/sql-query-builder";
import TimeSpanSelector, {
  BUILT_IN_TIME_SPAN_LIST,
  DisplayTimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import FloatingProgressBar from "@/components/shared/floating-progress-bar";
import SharedTimelineView from "@/components/shared/timeline/timeline-view";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { QueryError } from "@/lib/connection/connection";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter } from "@/lib/formatter";
import { HttpResponseLineReader } from "@/lib/http-response-line-reader";
import { toastManager } from "@/lib/toast";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { RotateCw, Search } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryResponseErrorView } from "../query-tab/query-response/query-response-error-view";
import { SpanLogInspectorTableView } from "./span-log-inspector-table-view";
import { renderSpanLogTimelineDetailPane } from "./span-log-inspector-timeline-detail";
import { spanLogTimelineTooltip } from "./span-log-inspector-timeline-tooltip";
import {
  transformSpanRowsToTimelineTree,
  type SpanLogElement,
} from "./span-log-inspector-timeline-types";
import { SpanLogInspectorTopoView } from "./span-log-inspector-topo-view";
import { parseAttributes } from "./span-log-utils";

const numberFormatter = (() => {
  const formatter = Formatter.getInstance().getFormatter("comma_number");
  if (typeof formatter === "function") {
    return (value: number) => String(formatter(value));
  }
  return (value: number) => new Intl.NumberFormat().format(value);
})();
const binarySizeFormatter = (() => {
  const formatter = Formatter.getInstance().getFormatter("binary_size");
  if (typeof formatter === "function") {
    return (value: number) => String(formatter(value));
  }
  return (value: number) => String(value);
})();

interface HeaderControlsProps {
  initialTraceId?: string;
  onSearch: (traceId: string, timeSpan: DisplayTimeSpan) => void;
  isLoading: boolean;
  onRefresh: () => void;
  className?: string;
}

const HeaderControls = memo(function HeaderControls({
  initialTraceId,
  onSearch,
  isLoading,
  onRefresh,
  className,
}: HeaderControlsProps) {
  const [searchTraceId, setSearchTraceId] = useState<string>(initialTraceId || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(() => {
    return BUILT_IN_TIME_SPAN_LIST[12];
  });

  useEffect(() => {
    setSearchTraceId(initialTraceId || "");
  }, [initialTraceId]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const defaultTimeSpan = BUILT_IN_TIME_SPAN_LIST[12];

  const handleSearch = useCallback(() => {
    const trimmedId = searchTraceId.trim();
    if (trimmedId) {
      onSearch(trimmedId, selectedTimeSpan);
    }
  }, [searchTraceId, selectedTimeSpan, onSearch]);

  const handleTimeSpanChange = useCallback(
    (timeSpan: DisplayTimeSpan) => {
      setSelectedTimeSpan(timeSpan);
      const trimmedId = searchTraceId.trim();
      if (trimmedId) {
        onSearch(trimmedId, timeSpan);
      }
    },
    [searchTraceId, onSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <div className={`relative flex items-center min-w-0 w-full ${className ?? ""}`}>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Enter Trace ID to search..."
          value={searchTraceId}
          onChange={(e) => setSearchTraceId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-8 h-9 rounded-r-none min-w-0 w-full rounded-l-sm"
        />
      </div>
      <div className="flex items-center shrink-0">
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

function createTimeSpanForDate(eventDate: string): DisplayTimeSpan {
  try {
    const date =
      eventDate.includes("T") || eventDate.includes(" ")
        ? parseISO(eventDate)
        : parseISO(eventDate + "T00:00:00");

    if (isNaN(date.getTime())) {
      return BUILT_IN_TIME_SPAN_LIST[12];
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    const startISO = DateTimeExtension.formatISO8601(start) || "";
    const endISO = DateTimeExtension.formatISO8601(end) || "";
    const label = DateTimeExtension.toYYYYMMddHHmmss(start).split(" ")[0];
    return new DisplayTimeSpan(label, "user", "unit", true, startISO, endISO);
  } catch {
    return BUILT_IN_TIME_SPAN_LIST[12];
  }
}

interface SpanLogInspectorTabProps {
  initialTraceId?: string;
  initialEventDate?: string;
}

interface StreamProgressState {
  readRows: number;
  readBytes: number;
  totalRowsToRead: number;
  elapsedMs: number;
  receivedRows: number;
}

function normalizeSpanLogAttributes(traceLog: SpanLogElement): SpanLogElement {
  const attributes = parseAttributes(traceLog.attribute);
  if (!attributes) {
    return traceLog;
  }

  const normalizedAttributes: Record<string, string> = {};
  const clickhouseSettings: Record<string, unknown> = {};
  const prefixes = ["clickhouse.setting.", "clickhouse.settings."];

  const toAttributeString = (value: unknown): string => {
    if (typeof value === "string") {
      return value;
    }
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  };

  for (const [key, value] of Object.entries(attributes)) {
    const prefix = prefixes.find((item) => key.startsWith(item));
    if (!prefix) {
      normalizedAttributes[key] = toAttributeString(value);
      continue;
    }

    const settingKey = key.slice(prefix.length);
    if (settingKey !== "") {
      clickhouseSettings[settingKey] = value;
    }
  }

  if (Object.keys(clickhouseSettings).length > 0) {
    normalizedAttributes["clickhouse.settings"] = JSON.stringify(clickhouseSettings);
  }

  return {
    ...traceLog,
    attribute: normalizedAttributes,
  };
}

export function SpanLogInspectorTab({
  initialTraceId,
  initialEventDate,
}: SpanLogInspectorTabProps) {
  const { connection } = useConnection();
  const [isLoading, setLoading] = useState(false);
  const [spanLogs, setSpanLogs] = useState<SpanLogElement[]>([]);
  const [queryText, setQueryText] = useState<string>("");
  const [loadError, setLoadError] = useState<QueryError | null>(null);
  const [activeTab, setActiveTab] = useState<string>("timeline");
  const [activeTraceId, setActiveTraceId] = useState<string | undefined>(initialTraceId);
  const [streamProgress, setStreamProgress] = useState<StreamProgressState>({
    readRows: 0,
    readBytes: 0,
    totalRowsToRead: 0,
    elapsedMs: 0,
    receivedRows: 0,
  });
  const [timelineData, setTimelineData] = useState(() => transformSpanRowsToTimelineTree([]));

  const initialTimeSpanValue = useMemo(() => {
    if (initialEventDate) {
      return createTimeSpanForDate(initialEventDate);
    }
    return BUILT_IN_TIME_SPAN_LIST[12];
  }, [initialEventDate]);

  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(initialTimeSpanValue);
  useEffect(() => {
    if (initialTraceId !== undefined) {
      setActiveTraceId(initialTraceId);
    }
  }, [initialTraceId]);

  useEffect(() => {
    if (initialEventDate) {
      setSelectedTimeSpan(createTimeSpanForDate(initialEventDate));
    }
  }, [initialEventDate]);

  const handleSearch = useCallback((traceId: string, timeSpan: DisplayTimeSpan) => {
    setActiveTraceId(traceId);
    setSelectedTimeSpan(timeSpan);
  }, []);

  const toSafeNumber = useCallback((value: unknown): number => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }, []);

  const elapsedSeconds = useMemo(() => streamProgress.elapsedMs, [streamProgress.elapsedMs]);

  const loadSpanLogs = useCallback(() => {
    if (!activeTraceId) {
      return;
    }
    if (!connection) {
      toastManager.show(
        "No connection selected. Please select a connection to view tracing logs.",
        "error"
      );
      return;
    }

    setLoading(true);
    setStreamProgress({
      readRows: 0,
      readBytes: 0,
      totalRowsToRead: 0,
      elapsedMs: 0,
      receivedRows: 0,
    });

    const timezone = connection.metadata.timezone;
    const sql = new SQLQueryBuilder(
      `
SELECT ${connection.metadata.span_log_table_has_hostname_column ? "" : "FQDN() as hostname, "}*
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE trace_id = '{traceId}'
  AND finish_date >= toDate({from:String}) 
  AND finish_date <= toDate({to:String})
  AND finish_time_us >= {startTimestampUs:UInt64}
  AND finish_time_us < {endTimestampUs:UInt64}
`
    )
      .timeSpan(selectedTimeSpan.getTimeSpan(), timezone)
      .replace("traceId", activeTraceId)
      .build();

    setQueryText(sql);
    const { response } = connection.queryRawResponse(sql, {
      default_format: "JSONEachRowWithProgress",
      output_format_json_quote_64bit_integers: 0,
    });

    const now = Date.now();

    response
      .then((rawResponse) => {
        const reader = rawResponse.body?.getReader();
        if (!reader) {
          throw new Error("Empty stream response");
        }
        const logs: SpanLogElement[] = [];
        return HttpResponseLineReader.read(reader, (line) => {
          const row = JSON.parse(line) as Record<string, unknown>;
          const progress = row.progress;
          if (progress && typeof progress === "object" && !Array.isArray(progress)) {
            const progressData = progress as Record<string, unknown>;
            setStreamProgress((prev) => ({
              ...prev,
              readRows: toSafeNumber(progressData.read_rows),
              readBytes: toSafeNumber(progressData.read_bytes),
              totalRowsToRead: toSafeNumber(progressData.total_rows_to_read),
              elapsedMs: Date.now() - now,
            }));
          }

          if (row.row) {
            const e = row.row as SpanLogElement;
            if (e.hostname.includes("209")) {
              e.hostname = "192.168.1.200";
            } else {
              e.hostname = "192.168.1.100";
            }
            logs.push(normalizeSpanLogAttributes(row.row as SpanLogElement));
            if (logs.length % 10 === 0) {
              setStreamProgress((prev) => ({
                ...prev,
                receivedRows: logs.length,
              }));
            }
          }
        }).then(() => logs);
      })
      .then((logs) => {
        setStreamProgress((prev) => ({
          ...prev,
          receivedRows: logs.length,
          elapsedMs: Date.now() - now,
        }));
        setSpanLogs(logs);
        setTimelineData(transformSpanRowsToTimelineTree(logs));
        setLoadError(null);
      })
      .catch((error) => {
        setSpanLogs([]);
        setTimelineData(transformSpanRowsToTimelineTree([]));
        if (!(error instanceof String && error.toString().includes("canceled"))) {
          setLoadError(error as QueryError);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeTraceId, connection, selectedTimeSpan, toSafeNumber]);

  useEffect(() => {
    loadSpanLogs();
  }, [loadSpanLogs]);

  return (
    <div className="h-full w-full bg-background flex flex-col">
      <FloatingProgressBar show={isLoading} />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-2 px-2 py-2">
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
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className="text-xs ml-1 text-muted-foreground flex flex-shrink-0 items-end gap-x-4 cursor-default rounded px-1 -mx-1 border border-transparent hover:border-border">
                <div className="flex flex-col items-center gap-0.5 text-left">
                  <span>Read Rows</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {numberFormatter(streamProgress.readRows)}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5 text-left">
                  <span>Result Rows</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {numberFormatter(streamProgress.receivedRows)}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5 text-left">
                  <span>Elapsed</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {Formatter.getInstance().getFormatter("millisecond")(streamProgress.elapsedMs)}
                  </span>
                </div>
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" align="start" className="w-auto p-3">
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-2">
                <div className="flex flex-col items-center gap-0.5 text-left">
                  <span>Read Rows</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {numberFormatter(streamProgress.readRows)}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5 text-left">
                  <span>Total Rows to Read</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {numberFormatter(streamProgress.totalRowsToRead)}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5 text-left">
                  <span>Read Bytes</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {binarySizeFormatter(streamProgress.readBytes)}
                  </span>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
          <div className="ml-auto flex-1 flex items-center gap-2 min-w-0 pl-6">
            <HeaderControls
              initialTraceId={initialTraceId}
              onSearch={handleSearch}
              isLoading={isLoading}
              onRefresh={loadSpanLogs}
              className="w-full max-w-4xl"
            />
          </div>
        </div>
        <div className="flex-1 relative overflow-hidden">
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
          ) : !activeTraceId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <div className="text-sm text-muted-foreground">
                Enter a Trace ID to search tracing logs
              </div>
            </div>
          ) : spanLogs.length === 0 ? (
            isLoading ? null : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <div className="text-sm text-muted-foreground">No tracing log data available</div>
                <div className="text-sm text-muted-foreground">
                  If the traced request was generated just now, wait a few seconds and refresh.
                </div>
              </div>
            )
          ) : (
            <>
              <div
                className={`absolute inset-0 overflow-auto ${activeTab === "timeline" ? "block" : "hidden"}`}
                role="tabpanel"
                aria-labelledby="tab-timeline"
                aria-hidden={activeTab !== "timeline"}
              >
                <SharedTimelineView
                  inputNodeTree={timelineData.tree}
                  inputNodeList={timelineData.flatList}
                  timelineStats={timelineData.stats}
                  isActive={activeTab === "timeline"}
                  searchPlaceholderSuffix="spans"
                  inactiveMessage="Switch to Timeline tab to view tracing spans"
                  processingMessage="Processing tracing timeline data..."
                  noDataMessage="No spans found"
                  renderDetailPane={renderSpanLogTimelineDetailPane}
                  renderTooltipContent={spanLogTimelineTooltip}
                />
              </div>
              <div
                className={`absolute inset-0 overflow-auto ${activeTab === "table" ? "block" : "hidden"}`}
                role="tabpanel"
                aria-labelledby="tab-table"
                aria-hidden={activeTab !== "table"}
              >
                <SpanLogInspectorTableView spanLogs={spanLogs} />
              </div>
              <div
                className={`absolute inset-0 overflow-auto ${activeTab === "topo" ? "block" : "hidden"}`}
                role="tabpanel"
                aria-labelledby="tab-topo"
                aria-hidden={activeTab !== "topo"}
              >
                <SpanLogInspectorTopoView spanTree={timelineData.tree} />
              </div>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}

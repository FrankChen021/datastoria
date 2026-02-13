import { useConnection } from "@/components/connection/connection-context";
import { SQLQueryBuilder } from "@/components/shared/dashboard/sql-query-builder";
import TimeSpanSelector, {
  BUILT_IN_TIME_SPAN_LIST,
  DisplayTimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import FloatingProgressBar from "@/components/shared/floating-progress-bar";
import type { TimelineNode } from "@/components/shared/timeline/timeline-types";
import SharedTimelineView from "@/components/shared/timeline/timeline-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { QueryError } from "@/lib/connection/connection";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter } from "@/lib/formatter";
import { HttpResponseLineReader } from "@/lib/http-response-line-reader";
import { toastManager } from "@/lib/toast";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { Maximize2, RotateCw, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryResponseErrorView } from "../query-tab/query-response/query-response-error-view";
import { getSpanAttributeRenderOrDefault } from "./span-log-attribute-render-manager";
import { SpanLogInspectorTableView } from "./span-log-inspector-table-view";
import { transformSpanRowsToTimelineTree } from "./span-log-inspector-timeline-types";
import { SpanLogInspectorTopoView, type GraphControlsRef } from "./span-log-inspector-topo-view";

interface HeaderControlsProps {
  initialTraceId?: string;
  onSearch: (traceId: string, timeSpan: DisplayTimeSpan) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

const HeaderControls = memo(function HeaderControls({
  initialTraceId,
  onSearch,
  isLoading,
  onRefresh,
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
    <div className="relative flex-shrink-0 flex items-center px-2 py-2 bg-background">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Enter Trace ID to search..."
          value={searchTraceId}
          onChange={(e) => setSearchTraceId(e.target.value)}
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
  elapsedNs: number;
  receivedRows: number;
}

function parseAttributes(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { value };
    }
    return { value };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function normalizeSpanLogAttributes(traceLog: Record<string, unknown>): Record<string, unknown> {
  const attributes = parseAttributes(traceLog.attribute ?? traceLog.attributes);
  if (!attributes) {
    return traceLog;
  }

  const normalizedAttributes: Record<string, unknown> = {};
  const clickhouseSettings: Record<string, unknown> = {};
  const prefixes = ["clickhouse.setting.", "clickhouse.settings."];

  for (const [key, value] of Object.entries(attributes)) {
    const prefix = prefixes.find((item) => key.startsWith(item));
    if (!prefix) {
      normalizedAttributes[key] = value;
      continue;
    }

    const settingKey = key.slice(prefix.length);
    if (settingKey !== "") {
      clickhouseSettings[settingKey] = value;
    }
  }

  if (Object.keys(clickhouseSettings).length > 0) {
    normalizedAttributes["clickhouse.settings"] = clickhouseSettings;
  }

  return {
    ...traceLog,
    attribute: normalizedAttributes,
    attributes: normalizedAttributes,
  };
}

export function SpanLogInspectorTab({
  initialTraceId,
  initialEventDate,
}: SpanLogInspectorTabProps) {
  const { connection } = useConnection();
  const [isLoading, setLoading] = useState(false);
  const [traceLogs, setTraceLogs] = useState<Record<string, unknown>[]>([]);
  const [queryText, setQueryText] = useState<string>("");
  const [loadError, setLoadError] = useState<QueryError | null>(null);
  const graphControlsRef = useRef<GraphControlsRef | null>(null);
  const [activeTab, setActiveTab] = useState<string>("timeline");
  const [activeTraceId, setActiveTraceId] = useState<string | undefined>(initialTraceId);
  const [streamProgress, setStreamProgress] = useState<StreamProgressState>({
    readRows: 0,
    readBytes: 0,
    totalRowsToRead: 0,
    elapsedNs: 0,
    receivedRows: 0,
  });

  const initialTimeSpanValue = useMemo(() => {
    if (initialEventDate) {
      return createTimeSpanForDate(initialEventDate);
    }
    return BUILT_IN_TIME_SPAN_LIST[12];
  }, [initialEventDate]);

  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(initialTimeSpanValue);
  const numberFormatter = useMemo(() => {
    const formatter = Formatter.getInstance().getFormatter("comma_number");
    if (typeof formatter === "function") {
      return (value: number) => String(formatter(value));
    }
    return (value: number) => new Intl.NumberFormat().format(value);
  }, []);
  const binarySizeFormatter = useMemo(() => {
    const formatter = Formatter.getInstance().getFormatter("binary_size");
    if (typeof formatter === "function") {
      return (value: number) => String(formatter(value));
    }
    return (value: number) => String(value);
  }, []);

  useEffect(() => {
    if (activeTab === "topo") {
      requestAnimationFrame(() => {
        setTimeout(() => graphControlsRef.current?.fitView(), 100);
      });
    }
  }, [activeTab]);

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

  const timelineData = useMemo(() => {
    return transformSpanRowsToTimelineTree(traceLogs);
  }, [traceLogs]);

  const renderTraceTooltipContent = useCallback((node: TimelineNode) => {
    const log = node.queryLog;
    const serviceName = typeof log.service_name === "string" ? log.service_name : "-";
    const operationName = typeof log.operation_name === "string" ? log.operation_name : "-";
    const spanId = String(log.span_id);
    const parentSpanId = String(log.parent_span_id);
    const traceId = typeof log.trace_id === "string" ? log.trace_id : "-";
    const spanKind = String(log.kind);
    const startTimeUs = Number(log.start_time_us);
    const startTime =
      Number.isFinite(startTimeUs) && startTimeUs > 0
        ? DateTimeExtension.toYYYYMMddHHmmss(new Date(Math.floor(startTimeUs / 1000)))
        : "-";
    const costTime = Number(log.finish_time_us) - Number(log.start_time_us);

    return (
      <div className="flex flex-col gap-1">
        <Separator />
        <div className="text-sm overflow-x-auto max-w-[440px]">
          <div className="min-w-max space-y-1">
            <div className="flex">
              <span className="font-bold w-32">Trace ID:</span>
              <span className="text-muted-foreground break-all flex-1">{traceId}</span>
            </div>
            <div className="flex">
              <span className="font-bold w-32">Span ID:</span>
              <span className="text-muted-foreground break-all flex-1">{spanId}</span>
            </div>
            <div className="flex">
              <span className="font-bold w-32">Parent Span ID:</span>
              <span className="text-muted-foreground break-all flex-1">{parentSpanId}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex">
              <span className="font-bold w-32">Service:</span>
              <span className="text-muted-foreground flex-1">{serviceName}</span>
            </div>
            <div className="flex">
              <span className="font-bold w-32">Operation:</span>
              <span className="text-muted-foreground flex-1">{operationName}</span>
            </div>
            <div className="flex">
              <span className="font-bold w-32">Span Kind:</span>
              <span className="text-muted-foreground flex-1">{spanKind}</span>
            </div>
            <div className="flex">
              <span className="font-bold w-32">Start Time:</span>
              <span className="text-muted-foreground flex-1">{startTime}</span>
            </div>
            <div className="flex">
              <span className="font-bold w-32">Duration:</span>
              <span className="text-muted-foreground flex-1">
                {Formatter.getInstance().getFormatter("microsecond")(costTime)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }, []);

  const renderTraceDetailPane = useCallback((selectedNode: TimelineNode, onClose: () => void) => {
    const attributes = parseAttributes(
      selectedNode.queryLog.attribute ?? selectedNode.queryLog.attributes
    );
    const attributeEntries = attributes ? Object.entries(attributes) : [];

    return (
      <div className="h-full min-h-0 flex flex-col border rounded-r-sm border-l-0">
        <div className="px-1 border-b bg-muted/20 flex items-center justify-between">
          <div className="text-sm font-medium">Span Attributes</div>
          <Button variant={"link"} size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {attributeEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No attributes found for this span.</div>
          ) : (
            <div className="space-y-2">
              {attributeEntries.map(([key, value]) => {
                const renderer = getSpanAttributeRenderOrDefault(key);
                return (
                  <div key={key} className="text-sm">
                    <div className="font-medium break-all">{key}</div>
                    <div className="mt-1">{renderer(value)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
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

  const elapsedSeconds = useMemo(
    () => streamProgress.elapsedNs / 1_000_000_000,
    [streamProgress.elapsedNs]
  );

  const loadTraceLog = useCallback(async () => {
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
      elapsedNs: 0,
      receivedRows: 0,
    });
    try {
      const timezone = connection.metadata.timezone;
      const sql = new SQLQueryBuilder(
        `
SELECT FQDN() as service_name, *
FROM {clusterAllReplicas:system.opentelemetry_span_log}
WHERE trace_id = '{traceId}'
  AND finish_date >= toDate({from:String}) 
  AND finish_date <= toDate({to:String})
  AND fromUnixTimestamp64Micro(finish_time_us) >= {from:String}
  AND fromUnixTimestamp64Micro(finish_time_us) < {to:String}
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

      const rawResponse = await response;
      const reader = rawResponse.body?.getReader();
      if (!reader) {
        throw new Error("Empty stream response");
      }

      const rows: Record<string, unknown>[] = [];
      await HttpResponseLineReader.read(reader, (line) => {
        const row = JSON.parse(line) as Record<string, unknown>;
        const progress = row.progress;
        if (progress && typeof progress === "object" && !Array.isArray(progress)) {
          const progressData = progress as Record<string, unknown>;
          setStreamProgress((prev) => ({
            ...prev,
            readRows: toSafeNumber(progressData.read_rows),
            readBytes: toSafeNumber(progressData.read_bytes),
            totalRowsToRead: toSafeNumber(progressData.total_rows_to_read),
            elapsedNs: toSafeNumber(progressData.elapsed_ns),
          }));
        }

        if (row.row) {
          rows.push(normalizeSpanLogAttributes(row.row as Record<string, unknown>));
          if (rows.length % 100 === 0) {
            setStreamProgress((prev) => ({
              ...prev,
              receivedRows: rows.length,
            }));
          }
        }
      });

      setStreamProgress((prev) => ({
        ...prev,
        receivedRows: rows.length,
      }));
      setTraceLogs(rows);
      setLoadError(null);
    } catch (error) {
      setTraceLogs([]);
      if (!(error instanceof String && error.toString().includes("canceled"))) {
        setLoadError(error as QueryError);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTraceId, connection, selectedTimeSpan, toSafeNumber]);

  useEffect(() => {
    loadTraceLog();
  }, [loadTraceLog]);

  return (
    <div className="h-full w-full bg-background flex flex-col">
      <FloatingProgressBar show={isLoading} />
      <HeaderControls
        initialTraceId={initialTraceId}
        onSearch={handleSearch}
        isLoading={isLoading}
        onRefresh={loadTraceLog}
      />
      {isLoading && (
        <div className="px-3 py-2 border-y bg-muted/20">
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{`Received: ${numberFormatter(streamProgress.receivedRows)} rows`}</span>
            <span>{`Read: ${numberFormatter(streamProgress.readRows)} rows`}</span>
            <span>{`Total: ${numberFormatter(streamProgress.totalRowsToRead)} rows`}</span>
            <span>{`Bytes: ${binarySizeFormatter(streamProgress.readBytes)}`}</span>
            <span>{`Elapsed: ${elapsedSeconds.toFixed(2)}s`}</span>
          </div>
        </div>
      )}
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
      ) : traceLogs.length === 0 ? (
        isLoading ? null : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <div className="text-sm text-muted-foreground">No tracing log data available</div>
            <div className="text-sm text-muted-foreground">
              If the traced request was generated just now, wait a few seconds and refresh.
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
            {activeTab === "topo" && graphControlsRef.current && traceLogs.length > 0 && (
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
              <SharedTimelineView
                inputNodeTree={timelineData.tree}
                inputNodeList={timelineData.flatList}
                timelineStats={timelineData.stats}
                isActive={activeTab === "timeline"}
                searchPlaceholderSuffix="spans"
                inactiveMessage="Switch to Timeline tab to view tracing spans"
                processingMessage="Processing tracing timeline data..."
                noDataMessage="No spans found"
                renderDetailPane={renderTraceDetailPane}
                renderTooltipContent={renderTraceTooltipContent}
              />
            </div>
            <div
              className={`absolute inset-0 overflow-auto px-2 ${activeTab === "table" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-labelledby="tab-table"
              aria-hidden={activeTab !== "table"}
            >
              <SpanLogInspectorTableView traceLogs={traceLogs} />
            </div>
            <div
              className={`absolute inset-0 overflow-auto px-2 ${activeTab === "topo" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-labelledby="tab-topo"
              aria-hidden={activeTab !== "topo"}
            >
              <SpanLogInspectorTopoView ref={graphControlsRef} traceLogs={traceLogs} />
            </div>
          </div>
        </Tabs>
      )}
    </div>
  );
}

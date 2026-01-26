import { useConnection } from "@/components/connection/connection-context";
import type {
  Dashboard,
  FieldOption,
  FilterSpec,
  SelectorFilterSpec,
  TimeseriesDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPage from "@/components/shared/dashboard/dashboard-page";
import { useDashboardRefresh } from "@/components/shared/dashboard/dashboard-panel-container";
import { DataTable } from "@/components/shared/dashboard/data-table";
import { replaceTimeSpanParams } from "@/components/shared/dashboard/sql-time-utils";
import type { TimeSpan } from "@/components/shared/dashboard/timespan-selector";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hostNameManager } from "@/lib/host-name-manager";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Clock, PlayCircle, X, XCircle } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

interface DDLRecord {
  entry: string;
  entry_version: number;
  initiator_host: string;
  initiator_port: number;
  cluster: string;
  query: string;
  settings: string;
  query_create_time: string;
  host: string;
  port: number;
  status: string;
  exception_code: number;
  exception_text: string;
  query_finish_time: string;
  query_duration_ms: number;
}

interface GroupedDDLEntry {
  entry: string;
  entry_version: number;
  initiator_host: string;
  initiator_port: number;
  cluster: string;
  query: string;
  statusCounts: Record<string, number>;
  records: DDLRecord[];
  hosts_count: number;
  query_create_time: string;
}

const StatusIcon = ({ status, className }: { status: string; className?: string }) => {
  switch (status) {
    case "Finished":
      return <CheckCircle2 className={cn("h-4 w-4 text-green-500", className)} />;
    case "Active":
      return <PlayCircle className={cn("h-4 w-4 text-blue-500", className)} />;
    case "Queued":
      return <Clock className={cn("h-4 w-4 text-amber-500", className)} />;
    case "Failed":
      return <XCircle className={cn("h-4 w-4 text-red-500", className)} />;
    default:
      return <AlertCircle className={cn("h-4 w-4 text-muted-foreground", className)} />;
  }
};

const StatusSummary = memo(
  ({ statusCounts, total }: { statusCounts: Record<string, number>; total: number }) => {
    if (total === 0) return <span className="text-xs text-muted-foreground">-</span>;

    // Sort all status keys by count descending
    const sortedStats = Object.entries(statusCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    const parts = sortedStats.map(([status, count]) => {
      const pct = Math.round((count / total) * 100);
      return `${pct}% ${status}`;
    });

    return (
      <div className="flex items-center gap-2 overflow-hidden">
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium truncate tabular-nums">
            {parts.join(", ") || "0%"}
          </span>
        </div>
      </div>
    );
  }
);

const truncateQuery = (text: string, maxLength: number = 80) => {
  if (!text || text.length <= maxLength) return text;
  const half = Math.floor((maxLength - 3) / 2);
  return text.slice(0, half) + "..." + text.slice(-half);
};

interface HoverSqlProps {
  sql: string;
  maxLength?: number;
  triggerClassName?: string;
}

const HoverSql = memo(({ sql, maxLength = 80, triggerClassName }: HoverSqlProps) => {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className={cn("truncate text-xs opacity-80", triggerClassName)}>
          {truncateQuery(sql, maxLength)}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-[600px] p-0 shadow-2xl border-2 bg-popover">
        <div className="max-h-[300px] overflow-auto bg-muted/30">
          <ThemedSyntaxHighlighter
            language="sql"
            customStyle={{
              margin: 0,
              padding: "0.75rem",
              fontSize: "10px",
              backgroundColor: "transparent",
            }}
            showLineNumbers={false}
            wrapLongLines={false}
          >
            {sql}
          </ThemedSyntaxHighlighter>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});

interface DDLDistributedQueueHostLogTableProps {
  records: DDLRecord[];
}

const DDLDistributedQueueHostLogTable = memo(
  ({ records }: DDLDistributedQueueHostLogTableProps) => {
    const tableMeta = useMemo(
      () => [
        { name: "host", type: "String" },
        { name: "status", type: "String" },
        { name: "query_create_time", type: "String" },
        { name: "query_duration_ms", type: "Int64" },
      ],
      []
    );

    const fieldOptions: FieldOption[] = useMemo(
      () => [
        {
          name: "status",
          format: (val, _, context) => {
            const row = context as unknown as DDLRecord;
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={String(val)} className="h-3 w-3" />
                      <span className="text-[11px]">{String(val)}</span>
                    </div>
                  </TooltipTrigger>
                  {row?.exception_code !== 0 && (
                    <TooltipContent className="max-w-[400px] p-3 border-red-500/20 shadow-lg">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-bold uppercase tracking-wider text-red-500">
                            Exception Code {row.exception_code}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono leading-relaxed break-words whitespace-pre-wrap text-foreground">
                          {String(row.exception_text)}
                        </div>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          },
        },
        {
          name: "query_duration_ms",
          format: "millisecond",
        },
      ],
      []
    );

    return (
      <div className="bg-background border rounded-md overflow-hidden shadow-sm h-[400px]">
        <DataTable
          enableCompactMode
          data={records as any}
          meta={tableMeta}
          fieldOptions={fieldOptions}
          enableIndexColumn
          stickyHeader
        />
      </div>
    );
  }
);

interface DDLDistributedQueueDetailPaneProps {
  selectedEntry: GroupedDDLEntry;
  onClose: () => void;
}

const DDLDistributedQueueDetailPane = memo(
  ({ selectedEntry, onClose }: DDLDistributedQueueDetailPaneProps) => {
    return (
      <div className="bg-muted/5 flex flex-col h-full border-l">
        <div className="flex items-center justify-between pl-4 pr-2 h-10 border-b bg-background/50 flex-shrink-0">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="text-[14px]">{selectedEntry.entry}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 pt-3 pl-2 pr-3 pb-10">
            {/* Metadata Transposed Table */}
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-bold text-muted-foreground">Entry Details</div>
              <div className="bg-background border rounded-md overflow-hidden shadow-sm">
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-3 py-2 bg-muted/20 w-32 font-medium text-muted-foreground">
                        Cluster
                      </td>
                      <td className="px-3 py-2">{selectedEntry.cluster}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 bg-muted/20 w-32 font-medium text-muted-foreground">
                        Create Time
                      </td>
                      <td className="px-3 py-2">
                        {selectedEntry.records[0]?.query_create_time || "-"}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 bg-muted/20 w-32 font-medium text-muted-foreground">
                        Entry Version
                      </td>
                      <td className="px-3 py-2">{selectedEntry.entry_version}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 bg-muted/20 w-32 font-medium text-muted-foreground">
                        Initiator Host
                      </td>
                      <td className="px-3 py-2 break-all leading-tight">
                        {selectedEntry.initiator_host}:{selectedEntry.initiator_port}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 min-w-0 gap-2">
              <div className="text-[10px] font-bold text-muted-foreground">
                Distributed DDL Query
              </div>
              <div className="border rounded-md bg-background overflow-hidden min-w-0">
                <div className="overflow-x-auto min-w-0">
                  <ThemedSyntaxHighlighter
                    language="sql"
                    wrapLongLines
                    customStyle={{
                      margin: 0,
                      padding: "0.5rem",
                      fontSize: "11px",
                      backgroundColor: "transparent",
                      whiteSpace: "pre",
                      width: "100%",
                    }}
                  >
                    {selectedEntry.query}
                  </ThemedSyntaxHighlighter>
                </div>
              </div>
            </div>

            {/* Host Log Table */}
            <div className="flex flex-col gap-3">
              <div className="text-[10px] font-bold text-muted-foreground">Per-Host DDL Log</div>
              <DDLDistributedQueueHostLogTable records={selectedEntry.records} />
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }
);

interface DistributedDDLQueueAggregateViewProps {
  records: DDLRecord[];
  isLoading: boolean;
}

const DistributedDDLQueueAggregateView = memo(
  ({ records, isLoading }: DistributedDDLQueueAggregateViewProps) => {
    const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

    const data = useMemo(() => {
      const grouped: GroupedDDLEntry[] = [];
      let currentEntry: GroupedDDLEntry | null = null;

      records.forEach((row) => {
        if (!currentEntry || currentEntry.entry !== row.entry) {
          currentEntry = {
            entry: row.entry,
            entry_version: row.entry_version,
            initiator_host: row.initiator_host,
            initiator_port: row.initiator_port,
            cluster: row.cluster,
            query: row.query,
            query_create_time: row.query_create_time,
            statusCounts: {},
            records: [],
            hosts_count: 0,
          };
          grouped.push(currentEntry);
        }
        currentEntry.records.push(row);
        currentEntry.hosts_count++;
        currentEntry.statusCounts[row.status] = (currentEntry.statusCounts[row.status] || 0) + 1;
      });
      return grouped;
    }, [records]);

    const selectedEntry = useMemo(() => {
      if (!selectedEntryId) return null;
      return data.find((g) => g.entry === selectedEntryId) || null;
    }, [data, selectedEntryId]);

    const tableMeta = useMemo(
      () => [
        { name: "entry", type: "String" },
        { name: "query_create_time", type: "DateTime" },
        { name: "cluster", type: "String" },
        { name: "query", type: "String" },
        { name: "statusCounts", type: "Object" },
        { name: "hosts_count", type: "UInt64" },
      ],
      []
    );

    const fieldOptions: FieldOption[] = useMemo(
      () => [
        {
          name: "query",
          format: (val) => <HoverSql sql={String(val)} />,
        },
        {
          name: "statusCounts",
          title: "Status",
          width: 140,
          format: (val) => {
            const counts = val as Record<string, number>;
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            return <StatusSummary statusCounts={counts} total={total} />;
          },
        },
        {
          name: "hosts_count",
          title: "Hosts",
          width: 60,
          align: "right",
          format: (val) => (
            <span className="font-bold tabular-nums text-xs text-muted-foreground">
              {String(val)}
            </span>
          ),
        },
      ],
      []
    );

    return (
      <PanelGroup direction="horizontal" className="h-full">
        {/* Left Panel: Table */}
        <Panel
          defaultSize={selectedEntry ? 55 : 100}
          minSize={30}
          className="flex flex-col overflow-hidden"
        >
          <DataTable
            data={data as any}
            meta={tableMeta}
            defaultSort={{
              column: "query_create_time",
              direction: "desc",
            }}
            fieldOptions={fieldOptions}
            enableIndexColumn
            isLoading={isLoading}
            onRowClick={(row) => setSelectedEntryId(row.entry as string)}
            selectedRowId={selectedEntryId}
            idField="entry"
            stickyHeader
            className="flex-1"
          />
        </Panel>

        {selectedEntry && (
          <>
            <PanelResizeHandle className="w-[1px] bg-border hover:bg-primary/50 transition-colors cursor-col-resize active:bg-primary" />
            <Panel
              defaultSize={45}
              minSize={25}
              className="flex flex-col overflow-hidden text-clip"
            >
              <DDLDistributedQueueDetailPane
                selectedEntry={selectedEntry}
                onClose={() => setSelectedEntryId(null)}
              />
            </Panel>
          </>
        )}
      </PanelGroup>
    );
  }
);

interface DistributedDDLQueueRawViewProps {
  data: DDLRecord[];
  isLoading: boolean;
}

const DistributedDDLQueueRawView = memo(({ data, isLoading }: DistributedDDLQueueRawViewProps) => {
  const tableMeta = useMemo(
    () => [
      { name: "entry", type: "String" },
      { name: "query_create_time", type: "DateTime" },
      { name: "host", type: "String" },
      { name: "status", type: "String" },
      { name: "query", type: "String" },
      { name: "query_duration_ms", type: "UInt64" },
    ],
    []
  );

  const fieldOptions: FieldOption[] = useMemo(
    () => [
      {
        name: "status",
        title: "Status",
        width: 100,
        format: (val) => (
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <StatusIcon status={String(val)} />
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {String(val)}
            </span>
          </div>
        ),
      },
      {
        name: "query",
        format: (val) => <HoverSql sql={String(val)} />,
      },
      {
        name: "query_duration_ms",
        format: "millisecond",
      },
    ],
    []
  );

  return (
    <DataTable
      data={data as any}
      meta={tableMeta}
      fieldOptions={fieldOptions}
      enableIndexColumn
      isLoading={isLoading}
      stickyHeader
      className="flex-1"
    />
  );
});

const DDLDistributedQueueLogView = memo(() => {
  const { connection } = useConnection();
  const [rawRows, setRawRows] = useState<DDLRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentTimeSpanRef = useRef<TimeSpan | undefined>(undefined);

  const fetchData = useCallback(
    async (timeSpan?: TimeSpan, filterExpression?: string) => {
      if (!connection) return;

      const effectiveTimeSpan = timeSpan ?? currentTimeSpanRef.current;
      if (!effectiveTimeSpan) return;

      currentTimeSpanRef.current = effectiveTimeSpan;

      setIsLoading(true);
      setError(null);
      try {
        let sql = `
SELECT *
FROM system.distributed_ddl_queue 
WHERE
{filterExpression:String}
AND query_create_time >= {from:String} 
AND query_create_time < {to:String}
ORDER BY entry, host`;
        sql = replaceTimeSpanParams(sql, effectiveTimeSpan, connection.metadata.timezone || "UTC");
        sql = sql.replace(/{filterExpression:String}/g, filterExpression || "true");
        const response = await connection.query(sql, { default_format: "JSON" }).response;
        const fetchedRawRows = response.data.json<{ data: DDLRecord[] }>().data;

        const rows = fetchedRawRows.map((row) => ({
          ...row,
          host: hostNameManager.getShortHostname(row.host),
          initiator_host: hostNameManager.getShortHostname(row.initiator_host),
        }));

        setRawRows(rows);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch data";
        console.error("Error fetching DDL queue data:", err);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [connection]
  );

  // Register for dashboard refresh - this will be called when the dashboard refreshes
  useDashboardRefresh(fetchData);

  if (error) {
    return (
      <div className="p-4 text-red-500 text-center flex-1 flex items-center justify-center">
        Error: {error}
      </div>
    );
  }

  return (
    <Tabs defaultValue="aggregate" className="flex flex-col h-full">
      <div className="flex-shrink-0 px-2 py-0 border-b">
        <TabsList className="bg-transparent h-8 p-0 gap-4">
          <TabsTrigger
            value="aggregate"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 pb-1 h-8 text-xs font-semibold"
          >
            Aggregated Entries
          </TabsTrigger>
          <TabsTrigger
            value="raw"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 pb-1 h-8 text-xs font-semibold"
          >
            Raw Entries
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex-1 min-h-0">
        <TabsContent value="aggregate" className="h-full m-0 p-0 focus-visible:outline-none">
          <DistributedDDLQueueAggregateView records={rawRows} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="raw" className="h-full m-0 p-0 focus-visible:outline-none">
          <DistributedDDLQueueRawView data={rawRows} isLoading={isLoading} />
        </TabsContent>
      </div>
    </Tabs>
  );
});

const ddlQueueDashboard: Dashboard = {
  version: 3,
  filter: {},
  charts: [
    {
      type: "bar",
      stacked: true,
      titleOption: {
        title: "DDL Queue Entries By Host",
        align: "center",
      },
      gridPos: { w: 24, h: 8 },
      legendOption: {
        placement: "bottom",
        values: ["sum"],
      },
      datasource: {
        sql: `
SELECT 
    toStartOfInterval(query_create_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
    count() AS query_count
FROM system.distributed_ddl_queue
WHERE
{filterExpression:String}
AND query_create_time >= {from:String} 
AND query_create_time < {to:String}
GROUP BY t, host
ORDER BY t
`,
      },
    } as TimeseriesDescriptor,
  ],
};

const DistributedDDLQueue = () => {
  const { connection } = useConnection();
  const filterSpecs = useMemo<FilterSpec[]>(() => {
    return [
      {
        filterType: "select",
        name: "host",
        displayText: "host",
        onPreviousFilters: true,
        datasource: {
          type: "sql",
          sql: `SELECT DISTINCT 
          host 
FROM system.ddl_distributed_queue 
WHERE cluster = '${connection!.cluster}'
ORDER BY host`,
        },
      } as SelectorFilterSpec,
    ];
  }, [connection]);
  return (
    <DashboardPage
      filterSpecs={filterSpecs}
      panels={ddlQueueDashboard}
      chartSelectionFilterName="host"
    >
      <DDLDistributedQueueLogView />
    </DashboardPage>
  );
};

export default memo(DistributedDDLQueue);

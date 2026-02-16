import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import { Formatter } from "@/lib/formatter";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { Panel } from "react-resizable-panels";
import type { NodeDetails } from "./query-log-inspector-topo-view";

// Reusable table component for edges
interface EdgeTableProps {
  edges: Array<{
    source?: string;
    sourceLabel?: string;
    target?: string;
    targetLabel?: string;
    queryLog: any;
  }>;
  type: "incoming" | "outgoing";
  emptyMessage?: string;
}

function EdgeTable({ edges, type, emptyMessage = "No query available" }: EdgeTableProps) {
  const milliFormatter = useMemo(() => Formatter.getInstance().getFormatter("millisecond"), []);
  const commaNumberFormatter = useMemo(
    () => Formatter.getInstance().getFormatter("comma_number"),
    []
  );
  const sqlFormatter = Formatter.getInstance().getFormatter("sql");

  const [sort, setSort] = useState<{ column: string | null; direction: "asc" | "desc" | null }>({
    column: null,
    direction: null,
  });

  // 1. Collect all unique ProfileEvents keys
  const profileEventKeys = useMemo(() => {
    const keys = new Set<string>();
    edges.forEach((edge) => {
      if (edge.queryLog.ProfileEvents) {
        Object.keys(edge.queryLog.ProfileEvents).forEach((key) => keys.add(key));
      }
    });
    return Array.from(keys).sort();
  }, [edges]);

  // 2. Prepare data with flattened structure for easier sorting
  const tableData = useMemo(() => {
    return edges.map((edge) => {
      const flatData: any = {
        ...edge,
        event_time: edge.queryLog.event_time_microseconds,
        duration: edge.queryLog.query_duration_ms,
        rows: edge.queryLog.result_rows,
        type: edge.queryLog.type,
        query: edge.queryLog.query || "",
      };

      // Flatten ProfileEvents
      if (edge.queryLog.ProfileEvents) {
        Object.entries(edge.queryLog.ProfileEvents).forEach(([key, value]) => {
          flatData[`pe_${key}`] = value;
        });
      }

      return flatData;
    });
  }, [edges]);

  // 3. Sort data
  const sortedData = useMemo(() => {
    if (!sort.column || !sort.direction) {
      return tableData;
    }

    return [...tableData].sort((a, b) => {
      let aValue = a[sort.column!];
      let bValue = b[sort.column!];

      // Handle ProfileEvents special case (keys prefixed with pe_)
      if (sort.column!.startsWith("pe_")) {
        aValue = a[sort.column!] || 0; // Default to 0 if missing
        bValue = b[sort.column!] || 0;
      }

      if (aValue === bValue) return 0;

      // Handle null/undefined
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const comparison = aValue > bValue ? 1 : -1;
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [tableData, sort]);

  const handleSort = useCallback((column: string) => {
    setSort((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === "asc" ? "desc" : prev.direction === "desc" ? null : "asc",
        };
      }
      return { column, direction: "asc" };
    });
  }, []);

  const getSortIcon = useCallback(
    (column: string) => {
      if (sort.column !== column) {
        return <ArrowUpDown className="inline-block w-3 h-3 ml-1 opacity-30" />;
      }
      return sort.direction === "asc" ? (
        <ArrowUp className="inline-block w-3 h-3 ml-1" />
      ) : sort.direction === "desc" ? (
        <ArrowDown className="inline-block w-3 h-3 ml-1" />
      ) : (
        <ArrowUpDown className="inline-block w-3 h-3 ml-1 opacity-30" />
      );
    },
    [sort]
  );

  if (edges.length === 0) {
    return <div className="text-sm pl-4 text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className="max-h-[800px] overflow-auto border rounded-md">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background shadow-sm">
          <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
            <th className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 bg-background w-[50px]">
              #
            </th>
            <th
              className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 bg-background cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort(type === "incoming" ? "sourceLabel" : "targetLabel")}
            >
              {type === "incoming" ? "Source" : "Target"}
              {getSortIcon(type === "incoming" ? "sourceLabel" : "targetLabel")}
            </th>
            <th
              className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 bg-background cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort("event_time")}
            >
              Event Time
              {getSortIcon("event_time")}
            </th>
            <th
              className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 bg-background cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort("duration")}
            >
              Duration
              {getSortIcon("duration")}
            </th>
            <th
              className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 bg-background cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort("rows")}
            >
              Rows
              {getSortIcon("rows")}
            </th>
            <th
              className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 bg-background cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort("type")}
            >
              Type
              {getSortIcon("type")}
            </th>
            <th className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 bg-background">
              Query
            </th>
            {/* Dynamic ProfileEvents Columns */}
            {profileEventKeys.map((key) => (
              <th
                key={key}
                className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 bg-background cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort(`pe_${key}`)}
              >
                {key}
                {getSortIcon(`pe_${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {sortedData.map((row, index) => (
            <tr
              key={
                row.queryLog?.query_id ||
                `${row.source || ""}-${row.target || ""}-${row.event_time || index}`
              }
              className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
            >
              <td className="p-4 align-middle font-medium !p-2 whitespace-nowrap text-muted-foreground">
                {index + 1}
              </td>
              <td className="p-4 align-middle font-medium !p-2 whitespace-nowrap">
                {type === "incoming" ? row.sourceLabel : row.targetLabel}
              </td>
              <td className="p-4 align-middle !p-2 whitespace-nowrap">{row.event_time}</td>
              <td className="p-4 align-middle !p-2 whitespace-nowrap">
                {milliFormatter(row.duration)}
              </td>
              <td className="p-4 align-middle !p-2 whitespace-nowrap">
                {commaNumberFormatter(row.rows)}
              </td>
              <td className="p-4 align-middle !p-2 whitespace-nowrap">
                {row.type === "QueryStart"
                  ? "Started"
                  : row.type === "QueryFinish"
                    ? "Finished"
                    : "Exception"}
              </td>
              <td className="p-4 align-middle !p-2 whitespace-nowrap">
                {sqlFormatter(row.query, [80])}
              </td>
              {/* Dynamic ProfileEvents Cells */}
              {profileEventKeys.map((key) => (
                <td key={key} className="p-4 align-middle !p-2 whitespace-nowrap">
                  {row[`pe_${key}`] !== undefined ? commaNumberFormatter(row[`pe_${key}`]) : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface QueryLogInspectorTopoNodePaneProps {
  selectedNode: NodeDetails;
  onClose: () => void;
}

export const QueryLogInspectorTopoNodePane = memo(function QueryLogInspectorTopoNodePane({
  selectedNode,
  onClose,
}: QueryLogInspectorTopoNodePaneProps) {
  if (!selectedNode) return null;

  return (
    <Panel
      defaultSize={40}
      minSize={5}
      maxSize={70}
      className="bg-background border-l shadow-lg flex flex-col border-t border-r rounded-sm"
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0 h-10">
        <h4 className="truncate font-semibold text-sm">Node: {selectedNode.label}</h4>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto space-y-2 pb-16">
        {/* Incoming Edges Section — only shown when there are incoming queries */}
        {selectedNode.incomingEdges.length > 0 && (
          <CollapsibleSection
            title="Incoming Queries"
            className="border-0 rounded-none"
            defaultOpen={true}
          >
            <div className="px-3 py-1">
              <EdgeTable edges={selectedNode.incomingEdges} type="incoming" />
            </div>
          </CollapsibleSection>
        )}

        {/* Outgoing Edges Section — only shown when there are outgoing queries */}
        {selectedNode.outgoingEdges.length > 0 && (
          <CollapsibleSection
            title="Outgoing Queries"
            className="border-0 rounded-none"
            defaultOpen={true}
          >
            <div className="px-3 py-1">
              <EdgeTable edges={selectedNode.outgoingEdges} type="outgoing" />
            </div>
          </CollapsibleSection>
        )}
      </div>
    </Panel>
  );
});

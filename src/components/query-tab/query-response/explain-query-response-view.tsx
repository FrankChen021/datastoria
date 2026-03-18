import { useConnection } from "@/components/connection/connection-context";
import type { DependencyGraphNode } from "@/components/dependency-view/dependency-builder";
import { TablePanel } from "@/components/dependency-view/table-panel";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { TopologyGraphFlow } from "@/components/shared/topology/topology-graph-flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { SqlUtils } from "@/lib/sql-utils";
import { cn } from "@/lib/utils";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { ChevronRight, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { QueryResponseViewProps } from "../query-view-model";
import {
  getDefaultExpandedNodeIds,
  getExplainPlanAncestorIds,
  getExplainPlanEdgeLabel,
  getExplainPlanInitialEdgeLabel,
  getExplainPlanNodeMetricLabel,
  getExplainPlanSummaryBadges,
  parseExplainPlanResponse,
  type ExplainPlanAggregate,
  type ExplainPlanExpressionAction,
  type ExplainPlanExpressionItem,
  type ExplainPlanIndex,
  type ExplainPlanNode,
} from "./explain-plan-utils";
import { QueryResponseErrorView } from "./query-response-error-view";
import { QueryResponseHttpHeaderView } from "./query-response-http-header-view";

type PlanTabValue = "result" | "graph" | "text" | "raw" | "headers";
type ExplainPlanSelection = { kind: "plan"; id: string } | { kind: "table"; id: string };
const EXPLAIN_PLAN_GRAPH_NODE_HEIGHT = 60;

interface ExplainPlanFetchedTableNode {
  id: string;
  database: string;
  name: string;
  engine: string;
  tableQuery: string;
  metadataModificationTime: string;
}

function unquoteIdentifierPart(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const quote = trimmed[0];
  if ((quote !== "`" && quote !== '"') || trimmed[trimmed.length - 1] !== quote) {
    return trimmed;
  }
  const inner = trimmed.slice(1, -1);
  return quote === "`" ? inner.replaceAll("``", "`") : inner.replaceAll('""', '"');
}

function parseQualifiedTableName(
  qualifiedName: string | undefined
): { database: string; table: string } | undefined {
  if (!qualifiedName) {
    return undefined;
  }

  const input = qualifiedName.trim();
  let inBacktickQuote = false;
  let inDoubleQuote = false;
  let separatorIndex = -1;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "`" && !inDoubleQuote) {
      if (inBacktickQuote && input[index + 1] === "`") {
        index += 1;
      } else {
        inBacktickQuote = !inBacktickQuote;
      }
      continue;
    }
    if (char === '"' && !inBacktickQuote) {
      if (inDoubleQuote && input[index + 1] === '"') {
        index += 1;
      } else {
        inDoubleQuote = !inDoubleQuote;
      }
      continue;
    }
    if (char === "." && !inBacktickQuote && !inDoubleQuote) {
      separatorIndex = index;
      break;
    }
  }

  if (separatorIndex <= 0 || separatorIndex === input.length - 1) {
    return undefined;
  }

  const databasePart = input.slice(0, separatorIndex).trim();
  const tablePart = input.slice(separatorIndex + 1).trim();
  if (!databasePart || !tablePart) {
    return undefined;
  }

  return {
    database: unquoteIdentifierPart(databasePart),
    table: unquoteIdentifierPart(tablePart),
  };
}

function toDependencyGraphNode(
  qualifiedName: string | undefined,
  tableNode:
    | {
        database: string;
        name: string;
        engine: string;
        tableQuery: string;
        metadataModificationTime: string;
        id: string;
      }
    | undefined
): DependencyGraphNode | undefined {
  if (!qualifiedName || !tableNode) {
    return undefined;
  }
  return {
    id: tableNode.id || qualifiedName,
    type: "Internal",
    category: tableNode.engine,
    namespace: tableNode.database,
    name: tableNode.name,
    query: tableNode.tableQuery,
    targets: [],
    metadataModificationTime: tableNode.metadataModificationTime,
  };
}

function formatPrimitive(value: unknown): string {
  if (value === undefined) {
    return "-";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function isStructuredValue(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

const EXPLAIN_PLAN_DETAIL_EXCLUDED_RAW_KEYS = new Set([
  "Node Type",
  "Node Id",
  "Description",
  "Read Type",
  "Parts",
  "Granules",
  "Keys",
  "Aggregates",
  "Skip merging",
  "Indexes",
  "Expression",
  "Prewhere",
  "Prewhere info",
  "Prewhere Info",
  "Plans",
]);

function getExplainPlanAdditionalRawEntries(
  raw: Record<string, unknown>
): Array<[string, unknown]> {
  return Object.entries(raw)
    .filter(
      ([key, value]) => !EXPLAIN_PLAN_DETAIL_EXCLUDED_RAW_KEYS.has(key) && value !== undefined
    )
    .map(([key, value]) => [key, value]);
}

function getExplainPlanPrewhereEntries(
  raw: Record<string, unknown> | undefined
): Array<[string, unknown]> {
  if (!raw) {
    return [];
  }

  const entries: Array<[string, unknown]> = [];

  Object.entries(raw).forEach(([key, value]) => {
    if (
      key === "Plans" ||
      key === "Prewhere filter" ||
      key === "Filter" ||
      key === "Prewhere filter expression" ||
      value === undefined
    ) {
      return;
    }
    entries.push([key, value]);
  });

  const filterRecord =
    (typeof raw["Prewhere filter"] === "object" &&
      raw["Prewhere filter"] !== null &&
      !Array.isArray(raw["Prewhere filter"]) &&
      (raw["Prewhere filter"] as Record<string, unknown>)) ||
    (typeof raw["Filter"] === "object" &&
      raw["Filter"] !== null &&
      !Array.isArray(raw["Filter"]) &&
      (raw["Filter"] as Record<string, unknown>)) ||
    undefined;

  if (filterRecord) {
    Object.entries(filterRecord).forEach(([key, value]) => {
      if (
        key === "Plans" ||
        key === "Prewhere filter expression" ||
        key === "Expression" ||
        value === undefined
      ) {
        return;
      }
      entries.push([key, value]);
    });
  }

  return entries;
}

function ExplainPlanGraphNode({
  data,
  selected,
}: {
  data: {
    node: ExplainPlanNode;
    displayTitle?: string;
    displaySubtitle?: string;
    displaySummaryBadges?: string[];
    displayWidth?: number;
    selectKind?: ExplainPlanSelection["kind"];
    selectNodeId?: string;
    onSelect?: (selection: ExplainPlanSelection) => void;
  };
  selected?: boolean;
}) {
  const summaryBadges = data.displaySummaryBadges ?? getExplainPlanSummaryBadges(data.node);
  const title = data.displayTitle ?? data.node.title;
  const subtitle = Object.prototype.hasOwnProperty.call(data, "displaySubtitle")
    ? data.displaySubtitle
    : data.node.subtitle;
  const handleSelect = () => {
    data.onSelect?.({
      kind: data.selectKind ?? "plan",
      id: data.selectNodeId ?? data.node.id,
    });
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    handleSelect();
  };

  return (
    <div
      className={cn(
        `flex h-[${EXPLAIN_PLAN_GRAPH_NODE_HEIGHT}px] cursor-pointer flex-col justify-center rounded-lg border border-border bg-background px-3 py-2 shadow-sm transition-[box-shadow,colors] hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`,
        selected ? "ring-2 ring-primary/20 border-primary/50" : ""
      )}
      style={{ width: `${data.displayWidth ?? 240}px` }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Inspect ${title}`}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="truncate text-sm font-semibold text-foreground">{title}</div>
      {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      {summaryBadges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {summaryBadges.map((item) => (
            <Badge key={`${data.node.id}-${item}`} variant="outline" className="text-[10px]">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ExplainPlanGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerStart,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });
  const label = typeof data?.label === "string" ? data.label : "";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={typeof markerStart === "string" ? markerStart : undefined}
        style={{ strokeWidth: 1.5 }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan max-w-[160px] select-none truncate px-1 text-xs font-medium text-foreground/90"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            title={label}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const planNodeTypes: NodeTypes = {
  planNode: ExplainPlanGraphNode,
};

const planEdgeTypes: EdgeTypes = {
  planEdge: ExplainPlanGraphEdge,
};

function OverviewGrid({ entries }: { entries: Array<[string, unknown]> }) {
  const filteredEntries = entries.filter(([, value]) => value !== undefined && value !== "");
  if (filteredEntries.length === 0) {
    return <div className="px-3 py-2 text-sm text-muted-foreground">No data available.</div>;
  }

  return (
    <div className="grid min-w-max gap-x-6 gap-y-2 px-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
      {filteredEntries.map(([label, value]) => (
        <div key={label} className="contents">
          <div className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="min-w-0 text-sm text-foreground">
            {isStructuredValue(value) ? (
              <div className="min-w-[360px] max-w-[720px] overflow-x-auto rounded-md bg-background/40">
                <ThemedSyntaxHighlighter
                  language="json"
                  customStyle={{ margin: 0, padding: 0, background: "transparent" }}
                >
                  {JSON.stringify(value, null, 2)}
                </ThemedSyntaxHighlighter>
              </div>
            ) : (
              <div className="break-words">{formatPrimitive(value)}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSection({
  columns,
  rows,
  className,
  fullWidth,
}: {
  columns: string[];
  rows: string[][];
  className?: string;
  fullWidth?: boolean;
}) {
  if (rows.length === 0) {
    return <div className="px-3 py-2 text-sm text-muted-foreground">No data available.</div>;
  }

  return (
    <div className={cn("overflow-auto px-2 py-0", className)}>
      <table className={cn("border-collapse text-sm", fullWidth ? "w-full" : "min-w-max")}>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column, columnIndex) => (
              <th
                key={`${column}-${columnIndex}`}
                className="whitespace-nowrap px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row.join("|")}-${rowIndex}`} className="border-b border-border/50">
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  className="whitespace-nowrap px-2 py-2 align-top text-sm"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailPaneSection({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <CollapsibleSection title={title} defaultOpen={defaultOpen} className="border-0 rounded-none">
      <div className="px-3 py-1">{children}</div>
    </CollapsibleSection>
  );
}

function ExpressionSubsection({ items }: { items: ExplainPlanExpressionItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <TableSection
      className="max-h-[180px]"
      fullWidth={true}
      columns={["Name", "Type"]}
      rows={items.map((item) => [item.name || "-", item.type || "-"])}
    />
  );
}

function ExpressionActionsSection({ actions }: { actions: ExplainPlanExpressionAction[] }) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <TableSection
      className="max-h-[220px]"
      fullWidth={true}
      columns={["Type", "Result", "Type", "Arguments", "Removed", "Index"]}
      rows={actions.map((action) => [
        action.nodeType,
        action.resultName || "-",
        action.resultType || "-",
        action.arguments.length > 0 ? action.arguments.join(", ") : "-",
        action.removedArguments.length > 0 ? action.removedArguments.join(", ") : "-",
        action.result !== undefined ? String(action.result) : "-",
      ])}
    />
  );
}

function ExplainPlanDetailPane({ node, onClose }: { node: ExplainPlanNode; onClose: () => void }) {
  const readStatsEntries: Array<[string, unknown]> = [
    ["Read Type", node.stats.readType],
    ["Parts", node.stats.parts],
    ["Granules", node.stats.granules],
    ["Initial Parts", node.stats.initialParts],
    ["Selected Parts", node.stats.selectedParts],
    ["Initial Granules", node.stats.initialGranules],
    ["Selected Granules", node.stats.selectedGranules],
    ["Indexes", node.stats.indexCount > 0 ? node.stats.indexCount : undefined],
    ["Primary Key Condition", node.stats.primaryKeyCondition],
  ];
  const filteredReadStatsEntries = readStatsEntries.filter(
    ([, value]) => value !== undefined && value !== ""
  );
  const additionalRawEntries = getExplainPlanAdditionalRawEntries(node.raw);
  const prewhereEntries = getExplainPlanPrewhereEntries(node.prewhere?.raw);

  return (
    <Panel
      defaultSize={36}
      minSize={22}
      maxSize={60}
      className="border-l border-t border-b bg-background shadow-sm"
    >
      <div className="flex h-full flex-col min-h-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{node.title}</div>
            {node.subtitle && (
              <div className="truncate text-xs text-muted-foreground">{node.subtitle}</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Close plan details"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 p-2 pb-16">
          {additionalRawEntries.length > 0 && (
            <DetailPaneSection title="Properties">
              <div className="overflow-x-auto">
                <OverviewGrid entries={additionalRawEntries} />
              </div>
            </DetailPaneSection>
          )}

          {filteredReadStatsEntries.length > 0 && (
            <DetailPaneSection title="Read Stats">
              <div className="overflow-x-auto">
                <OverviewGrid entries={filteredReadStatsEntries} />
              </div>
            </DetailPaneSection>
          )}

          {node.indexes.length > 0 && (
            <DetailPaneSection title="Indexes">
              <div className="overflow-x-auto">
                <TableSection
                  columns={[
                    "Type",
                    "Condition",
                    "Initial Parts",
                    "Selected Parts",
                    "Initial Granules",
                    "Selected Granules",
                  ]}
                  rows={node.indexes.map((index: ExplainPlanIndex) => [
                    index.type,
                    index.condition || "-",
                    formatPrimitive(index.initialParts),
                    formatPrimitive(index.selectedParts),
                    formatPrimitive(index.initialGranules),
                    formatPrimitive(index.selectedGranules),
                  ])}
                />
              </div>
            </DetailPaneSection>
          )}

          {node.expression && node.expression.inputs.length > 0 && (
            <DetailPaneSection title={`Expression.Inputs (${node.expression.inputs.length})`}>
              <div className="overflow-x-auto">
                <ExpressionSubsection items={node.expression.inputs} />
              </div>
            </DetailPaneSection>
          )}

          {node.expression && node.expression.actions.length > 0 && (
            <DetailPaneSection title={`Expression.Actions (${node.expression.actions.length})`}>
              <div className="overflow-x-auto">
                <ExpressionActionsSection actions={node.expression.actions} />
              </div>
            </DetailPaneSection>
          )}

          {node.expression && node.expression.outputs.length > 0 && (
            <DetailPaneSection title={`Expression.Outputs (${node.expression.outputs.length})`}>
              <div className="overflow-x-auto">
                <ExpressionSubsection items={node.expression.outputs} />
              </div>
            </DetailPaneSection>
          )}

          {node.expression && node.expression.positions.length > 0 && (
            <DetailPaneSection title="Expression.Positions">
              <div className="overflow-x-auto">
                <OverviewGrid entries={[["Positions", node.expression.positions.join(", ")]]} />
              </div>
            </DetailPaneSection>
          )}

          {prewhereEntries.length > 0 && (
            <DetailPaneSection title="Prewhere">
              <div className="overflow-x-auto">
                <OverviewGrid entries={prewhereEntries} />
              </div>
            </DetailPaneSection>
          )}

          {node.prewhere?.filter && node.prewhere.filter.inputs.length > 0 && (
            <DetailPaneSection
              title={`Prewhere.Filter.Inputs (${node.prewhere.filter.inputs.length})`}
            >
              <div className="overflow-x-auto">
                <ExpressionSubsection items={node.prewhere.filter.inputs} />
              </div>
            </DetailPaneSection>
          )}

          {node.prewhere?.filter && node.prewhere.filter.actions.length > 0 && (
            <DetailPaneSection
              title={`Prewhere.Filter.Actions (${node.prewhere.filter.actions.length})`}
            >
              <div className="overflow-x-auto">
                <ExpressionActionsSection actions={node.prewhere.filter.actions} />
              </div>
            </DetailPaneSection>
          )}

          {node.prewhere?.filter && node.prewhere.filter.outputs.length > 0 && (
            <DetailPaneSection
              title={`Prewhere.Filter.Outputs (${node.prewhere.filter.outputs.length})`}
            >
              <div className="overflow-x-auto">
                <ExpressionSubsection items={node.prewhere.filter.outputs} />
              </div>
            </DetailPaneSection>
          )}

          {node.aggregates.length > 0 && (
            <DetailPaneSection title="Aggregation">
              <div className="overflow-x-auto">
                <TableSection
                  columns={["Name", "Function", "Arguments", "Argument Types", "Result Type"]}
                  rows={node.aggregates.map((aggregate: ExplainPlanAggregate) => [
                    aggregate.name || "-",
                    aggregate.functionName || "-",
                    aggregate.arguments.length > 0 ? aggregate.arguments.join(", ") : "-",
                    aggregate.argumentTypes.length > 0 ? aggregate.argumentTypes.join(", ") : "-",
                    aggregate.resultType || "-",
                  ])}
                />
              </div>
            </DetailPaneSection>
          )}

          <DetailPaneSection title="Raw JSON" defaultOpen={false}>
            <div className="overflow-x-auto">
              <div className="max-h-[420px] overflow-auto rounded-md bg-background/40">
                <ThemedSyntaxHighlighter
                  language="json"
                  customStyle={{ margin: 0, padding: 0, background: "transparent" }}
                >
                  {JSON.stringify(
                    node.raw,
                    (key, value) => (key === "Plans" ? undefined : value),
                    2
                  )}
                </ThemedSyntaxHighlighter>
              </div>
            </div>
          </DetailPaneSection>
        </div>
      </div>
    </Panel>
  );
}

function ExplainPlanTableDetailPane({
  tableNode,
  onClose,
}: {
  tableNode?: ExplainPlanNode;
  onClose: () => void;
}) {
  const { connection } = useConnection();
  const [fetchedTableNode, setFetchedTableNode] = useState<ExplainPlanFetchedTableNode | undefined>(
    undefined
  );
  const [errorMessage, setFetchError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!connection || !tableNode?.sourceName) {
      setFetchedTableNode(undefined);
      setFetchError(undefined);
      setIsLoading(false);
      return;
    }

    const parsedTableName = parseQualifiedTableName(tableNode.sourceName);
    if (!parsedTableName) {
      setFetchedTableNode(undefined);
      setFetchError("Unable to parse table name from the plan node.");
      setIsLoading(false);
      return;
    }

    const escapedDatabase = SqlUtils.escapeSqlString(parsedTableName.database);
    const escapedTable = SqlUtils.escapeSqlString(parsedTableName.table);
    const metadataSql = `
SELECT
  concat(database, '.', name) AS id,
  database,
  name,
  engine,
  ${connection.metadata.has_format_query_function ? "formatQuery(create_table_query)" : "create_table_query"} AS tableQuery,
  metadata_modification_time AS metadataModificationTime
FROM system.tables
WHERE database = '${escapedDatabase}' AND name = '${escapedTable}'
LIMIT 1
`;

    setIsLoading(true);
    setFetchedTableNode(undefined);
    setFetchError(undefined);

    const { response, abortController } = connection.queryOnNode(metadataSql, {
      default_format: "JSON",
      output_format_json_quote_64bit_integers: 0,
    });

    let cancelled = false;
    void response
      .then((queryResponse) => {
        if (cancelled) {
          return;
        }
        const payload = queryResponse.data.json<{ data?: ExplainPlanFetchedTableNode[] }>();
        const nextTableNode = payload?.data?.[0];
        if (!nextTableNode) {
          setFetchError("Table metadata was not found in system.tables.");
          return;
        }
        setFetchedTableNode(nextTableNode);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setFetchError(error instanceof Error ? error.message : "Failed to load table metadata.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [connection, tableNode?.sourceName]);

  const dependencyTableNode = toDependencyGraphNode(tableNode?.sourceName, fetchedTableNode);

  if (isLoading) {
    return (
      <Panel
        defaultSize={36}
        minSize={22}
        maxSize={60}
        className="border-l border-t border-b bg-background shadow-sm"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {tableNode?.sourceName || tableNode?.description || "Table"}
              </div>
              <div className="truncate text-xs text-muted-foreground">table</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              aria-label="Close table details"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-3 py-3 text-sm text-muted-foreground">Loading table metadata...</div>
        </div>
      </Panel>
    );
  }

  if (errorMessage || !dependencyTableNode) {
    return (
      <Panel
        defaultSize={36}
        minSize={22}
        maxSize={60}
        className="border-l border-t border-b bg-background shadow-sm"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {tableNode?.sourceName || tableNode?.description || "Table"}
              </div>
              <div className="truncate text-xs text-muted-foreground">table</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              aria-label="Close table details"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-3 py-3 text-sm text-muted-foreground">
            {errorMessage || "Unable to load table metadata."}
          </div>
        </div>
      </Panel>
    );
  }

  if (dependencyTableNode) {
    return (
      <Panel
        defaultSize={36}
        minSize={22}
        maxSize={60}
        className="border-l border-t border-b bg-background shadow-sm"
      >
        <div className="flex h-full min-h-0 flex-col overflow-y-auto">
          <div className="max-h-[560px]">
            <TablePanel tableNode={dependencyTableNode} onClose={onClose} />
          </div>
        </div>
      </Panel>
    );
  }
  return null;
}

function ExplainPlanSplitView({
  children,
  detailPane,
  isMobile,
}: {
  children: ReactNode;
  detailPane?: ReactNode;
  isMobile: boolean;
}) {
  const direction = isMobile ? "vertical" : "horizontal";
  return (
    <PanelGroup
      direction={direction}
      className={cn("h-[70vh] min-h-[520px]", isMobile && "h-[75vh] min-h-[420px]")}
    >
      <Panel defaultSize={detailPane ? (isMobile ? 58 : 64) : 100} minSize={isMobile ? 28 : 40}>
        {children}
      </Panel>
      {detailPane && (
        <>
          <PanelResizeHandle
            className={cn(
              "bg-border/60 transition-colors hover:bg-border",
              isMobile ? "h-[1px]" : "w-[1px]"
            )}
          />
          {detailPane}
        </>
      )}
    </PanelGroup>
  );
}

function ExplainPlanGraphView({ nodes }: { nodes: ExplainPlanNode[] }) {
  const isMobile = useIsMobile();
  const graphNodeWidth = isMobile ? 200 : 240;
  const [selectedSelection, setSelectedSelection] = useState<ExplainPlanSelection | undefined>(
    nodes[0] ? { kind: "plan", id: nodes[0].id } : undefined
  );
  const planContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedSelection(nodes[0] ? { kind: "plan", id: nodes[0].id } : undefined);
  }, [nodes]);

  const graphNodes = useMemo(() => {
    const result: Node[] = [];

    function visit(currentNodes: ExplainPlanNode[]) {
      currentNodes.forEach((node) => {
        const isReadSourceNode = node.nodeType === "ReadFromMergeTree";
        const hasReadSourceNode = isReadSourceNode && !!node.sourceName;
        const nodeMetricLabel = getExplainPlanNodeMetricLabel(node);
        const nodeSummaryBadges = isReadSourceNode
          ? getExplainPlanSummaryBadges(node).filter((item) => item !== nodeMetricLabel)
          : undefined;
        result.push({
          id: node.id,
          type: "planNode",
          position: { x: 0, y: 0 },
          data: {
            node,
            displaySubtitle: isReadSourceNode ? undefined : node.subtitle,
            displaySummaryBadges: nodeSummaryBadges,
            displayWidth: graphNodeWidth,
            selectKind: "plan",
            selectNodeId: node.id,
            onSelect: setSelectedSelection,
          },
          selected: selectedSelection?.kind === "plan" && selectedSelection.id === node.id,
        });
        if (hasReadSourceNode) {
          result.push({
            id: `${node.id}__table`,
            type: "planNode",
            position: { x: 0, y: 0 },
            data: {
              node,
              displayTitle: node.sourceName,
              displaySubtitle: "table",
              displaySummaryBadges: [],
              displayWidth: graphNodeWidth,
              selectKind: "table",
              selectNodeId: node.id,
              onSelect: setSelectedSelection,
            },
            selected: selectedSelection?.kind === "table" && selectedSelection.id === node.id,
          });
        }
        visit(node.children);
      });
    }

    visit(nodes);
    return result;
  }, [graphNodeWidth, nodes, selectedSelection]);

  const graphEdges = useMemo(() => {
    const result: Edge[] = [];

    function visit(currentNodes: ExplainPlanNode[]) {
      currentNodes.forEach((node) => {
        node.children.forEach((child) => {
          result.push({
            id: `${node.id}->${child.id}`,
            source: node.id,
            target: child.id,
            type: "planEdge",
            markerStart: { type: MarkerType.ArrowClosed },
            data: { label: getExplainPlanEdgeLabel(child) },
          });
        });
        if (node.nodeType === "ReadFromMergeTree" && node.sourceName) {
          result.push({
            id: `${node.id}->${node.id}__table`,
            source: node.id,
            target: `${node.id}__table`,
            type: "planEdge",
            markerStart: { type: MarkerType.ArrowClosed },
            data: { label: getExplainPlanInitialEdgeLabel(node) },
          });
        }
        visit(node.children);
      });
    }

    visit(nodes);
    return result;
  }, [nodes]);

  const selectedPlanNode =
    selectedSelection?.kind === "plan"
      ? findExplainPlanNodeById(nodes, selectedSelection.id)
      : undefined;
  const selectedTableNode =
    selectedSelection?.kind === "table"
      ? findExplainPlanNodeById(nodes, selectedSelection.id)
      : undefined;
  const detailPane = selectedPlanNode ? (
    <ExplainPlanDetailPane
      node={selectedPlanNode}
      onClose={() => setSelectedSelection(undefined)}
    />
  ) : selectedTableNode ? (
    <ExplainPlanTableDetailPane
      tableNode={selectedTableNode}
      onClose={() => setSelectedSelection(undefined)}
    />
  ) : undefined;

  return (
    <div ref={planContainerRef}>
      <ExplainPlanSplitView detailPane={detailPane} isMobile={isMobile}>
        <div className="relative h-full w-full">
          <TopologyGraphFlow
            initialNodes={graphNodes}
            initialEdges={graphEdges}
            nodeTypes={planNodeTypes}
            edgeTypes={planEdgeTypes}
            rankdir="TB"
            nodeWidth={graphNodeWidth}
            nodeHeight={EXPLAIN_PLAN_GRAPH_NODE_HEIGHT}
            ranksep={isMobile ? 28 : 40}
            nodesep={isMobile ? 48 : 70}
            hideHandles={true}
            fullscreenTargetRef={planContainerRef}
            className="h-full w-full bg-muted/20"
          />
          {graphNodes.length > 0 && (
            <div className="pointer-events-none absolute left-2 top-2 z-0 max-w-[min(30rem,calc(100%-1rem))] rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
              Select a node to inspect actions, indexes, and raw plan details.
            </div>
          )}
        </div>
      </ExplainPlanSplitView>
    </div>
  );
}

function ExplainPlanTreeRow({
  node,
  depth,
  expandedIds,
  selectedNodeId,
  onToggle,
  onSelect,
}: {
  node: ExplainPlanNode;
  depth: number;
  expandedIds: Set<string>;
  selectedNodeId?: string;
  onToggle: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
}) {
  const metricLabel = getExplainPlanNodeMetricLabel(node) || "-";
  const summary = getExplainPlanSummaryBadges(node);
  const secondarySummary = summary.filter((item) => item !== metricLabel);
  const subtitle = node.nodeType === "ReadFromMergeTree" ? undefined : node.subtitle;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div className={cn("text-sm", isSelected && "bg-primary/10")}>
        <div
          className="cursor-pointer px-3 py-1"
          style={{ paddingLeft: `${depth * 18 + 12}px` }}
          onClick={() => onSelect(node.id)}
        >
          <div className="flex items-start gap-1.5">
            <button
              type="button"
              className={cn(
                "mt-0.5 flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted",
                !hasChildren && "opacity-0"
              )}
              onClick={(event) => {
                event.stopPropagation();
                if (hasChildren) {
                  onToggle(node.id);
                }
              }}
              aria-label={isExpanded ? "Collapse node" : "Expand node"}
            >
              <ChevronRight
                className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")}
              />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{node.title}</span>
              </div>
              <div className="space-y-0">
                {subtitle && (
                  <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                )}
                {metricLabel !== "-" && (
                  <div className="text-xs text-muted-foreground">{metricLabel}</div>
                )}
                {secondarySummary.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {secondarySummary.map((item) => (
                      <span key={`${node.id}-${item}`}>{item}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <ExplainPlanTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              selectedNodeId={selectedNodeId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExplainPlanTextView({
  nodes,
  parentMap,
}: {
  nodes: ExplainPlanNode[];
  parentMap: Map<string, string | undefined>;
}) {
  const isMobile = useIsMobile();
  const initialExpandedIds = useMemo(() => getDefaultExpandedNodeIds(nodes), [nodes]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(nodes[0]?.id);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(initialExpandedIds));

  useEffect(() => {
    setSelectedNodeId(nodes[0]?.id);
  }, [nodes]);

  useEffect(() => {
    setExpandedIds(new Set(initialExpandedIds));
  }, [initialExpandedIds]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    const ancestorIds = getExplainPlanAncestorIds(selectedNodeId, parentMap);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      ancestorIds.forEach((ancestorId) => next.add(ancestorId));
      return next;
    });
  }, [parentMap, selectedNodeId]);

  const selectedNode = selectedNodeId ? findExplainPlanNodeById(nodes, selectedNodeId) : undefined;
  const detailPane = selectedNode ? (
    <ExplainPlanDetailPane node={selectedNode} onClose={() => setSelectedNodeId(undefined)} />
  ) : undefined;

  return (
    <ExplainPlanSplitView detailPane={detailPane} isMobile={isMobile}>
      <div className="h-full overflow-auto">
        {nodes.map((node) => (
          <ExplainPlanTreeRow
            key={node.id}
            node={node}
            depth={0}
            expandedIds={expandedIds}
            selectedNodeId={selectedNodeId}
            onToggle={(nodeId) =>
              setExpandedIds((prev) => {
                const next = new Set(prev);
                if (next.has(nodeId)) {
                  next.delete(nodeId);
                } else {
                  next.add(nodeId);
                }
                return next;
              })
            }
            onSelect={setSelectedNodeId}
          />
        ))}
      </div>
    </ExplainPlanSplitView>
  );
}

function findExplainPlanNodeById(
  nodes: ExplainPlanNode[],
  nodeId: string
): ExplainPlanNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const childMatch = findExplainPlanNodeById(node.children, nodeId);
    if (childMatch) {
      return childMatch;
    }
  }
  return undefined;
}

const ExplainQueryResponseViewComponent = ({
  queryRequest,
  queryResponse,
  error,
}: QueryResponseViewProps) => {
  const parsedPlan = useMemo(
    () => parseExplainPlanResponse(queryResponse.data),
    [queryResponse.data]
  );
  const hasParsedPlan = parsedPlan.rootNodes.length > 0 && !parsedPlan.parseError;
  const [selectedTab, setSelectedTab] = useState<PlanTabValue>(
    error ? "result" : hasParsedPlan ? "graph" : "raw"
  );

  useEffect(() => {
    setSelectedTab(error ? "result" : hasParsedPlan ? "graph" : "raw");
  }, [error, hasParsedPlan, parsedPlan.rawJsonText, parsedPlan.rootNodes]);

  return (
    <Tabs
      value={selectedTab}
      onValueChange={(value) => setSelectedTab(value as PlanTabValue)}
      className="mt-2"
    >
      <TabsList className="inline-flex min-w-full justify-start rounded-none border-0 h-auto p-0 bg-transparent flex-nowrap">
        {error && (
          <TabsTrigger
            value="result"
            className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            Result
          </TabsTrigger>
        )}
        {hasParsedPlan && (
          <>
            <TabsTrigger
              value="graph"
              className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Graph
            </TabsTrigger>
            <TabsTrigger
              value="text"
              className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Text
            </TabsTrigger>
          </>
        )}
        <TabsTrigger
          value="raw"
          className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
        >
          Raw JSON
        </TabsTrigger>
        {queryResponse.httpHeaders && (
          <TabsTrigger
            value="headers"
            className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            Response Headers
          </TabsTrigger>
        )}
      </TabsList>

      {!error && parsedPlan.parseError && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {parsedPlan.parseError}
        </div>
      )}

      {error && (
        <TabsContent value="result">
          <QueryResponseErrorView
            error={error}
            queryId={queryRequest.queryId}
            sql={queryRequest.sql}
          />
        </TabsContent>
      )}

      {hasParsedPlan && (
        <TabsContent value="graph" className="mt-0">
          <ExplainPlanGraphView nodes={parsedPlan.rootNodes} />
        </TabsContent>
      )}

      {hasParsedPlan && (
        <TabsContent value="text" className="mt-0">
          <ExplainPlanTextView nodes={parsedPlan.rootNodes} parentMap={parsedPlan.parentMap} />
        </TabsContent>
      )}

      <TabsContent value="raw" className="mt-0">
        <div className="relative bg-background px-3">
          <CopyButton value={parsedPlan.rawJsonText} className="left-3 top-3" />
          <div className="pr-10">
            <ThemedSyntaxHighlighter
              language="json"
              customStyle={{ margin: 0, padding: 0, background: "transparent" }}
            >
              {parsedPlan.rawJsonText || "No data returned."}
            </ThemedSyntaxHighlighter>
          </div>
        </div>
      </TabsContent>

      {queryResponse.httpHeaders && (
        <TabsContent value="headers" className="overflow-auto mt-0">
          <QueryResponseHttpHeaderView headers={queryResponse.httpHeaders} />
        </TabsContent>
      )}
    </Tabs>
  );
};

export const ExplainQueryResponseView = memo(ExplainQueryResponseViewComponent);

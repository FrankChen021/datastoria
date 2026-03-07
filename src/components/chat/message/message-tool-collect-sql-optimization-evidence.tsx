import type { AppUIMessage, ToolPart } from "@/lib/ai/chat-types";
import type {
  CollectSqlOptimizationEvidenceInput,
  EvidenceContext,
} from "@/lib/ai/tools/client/collect-sql-optimization-evidence";
import { useToolProgressStore } from "@/lib/ai/tools/client/tool-progress-store";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";
import { MessageMarkdownSql } from "./message-markdown-sql";
import { ToolProgressIndicator } from "./tool-progress-indicator";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatValue(value: unknown): string {
  if (value == null || value === "") {
    return "-";
  }
  if (typeof value === "number") {
    return numberFormatter.format(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function KeyValueGrid({ entries }: { entries: Array<{ label: string; value: unknown }> }) {
  if (entries.length === 0) {
    return <div className="text-[9px] text-muted-foreground/70">No details.</div>;
  }

  return (
    <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[9px]">
      {entries.map(({ label, value }) => (
        <div key={label} className="contents">
          <div className="font-medium text-foreground/80">{label}</div>
          <div className="break-all text-muted-foreground">{formatValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

function ColumnPreview({ columns }: { columns: Array<[string, string]> }) {
  if (columns.length === 0) {
    return <div className="text-[9px] text-muted-foreground/70">No columns captured.</div>;
  }

  const preview = columns.slice(0, 8);
  const remaining = columns.length - preview.length;

  return (
    <div className="text-[9px] text-muted-foreground">
      {preview.map(([name, type]) => (
        <div key={`${name}:${type}`} className="break-all">
          <span className="font-medium text-foreground/80">{name}</span>: {type}
        </div>
      ))}
      {remaining > 0 && <div className="text-muted-foreground/70">+{remaining} more columns</div>}
    </div>
  );
}

function ExplainSummary({
  title,
  summary,
  rawText,
}: {
  title: string;
  summary: string[];
  rawText?: string;
}) {
  return (
    <details>
      <summary className="cursor-pointer text-[9px] text-muted-foreground/70">{title} ✓</summary>
      <div className="mt-1 space-y-2 rounded border border-muted/20 bg-muted/30 p-2">
        <div className="space-y-1 text-[9px] text-muted-foreground">
          {summary.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        {rawText && (
          <details>
            <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
              Raw output
            </summary>
            <pre className="mt-1 overflow-x-auto rounded border border-muted/20 bg-background/60 p-2 text-[9px] leading-tight">
              {rawText}
            </pre>
          </details>
        )}
      </div>
    </details>
  );
}

function QueryLogSection({ queryLog }: { queryLog: NonNullable<EvidenceContext["query_log"]> }) {
  const coreEntries = Object.entries({
    duration_ms: queryLog.duration_ms,
    read_rows: queryLog.read_rows,
    read_bytes: queryLog.read_bytes,
    memory_usage: queryLog.memory_usage,
    result_rows: queryLog.result_rows,
    exception: queryLog.exception,
  })
    .filter(([, value]) => value != null)
    .map(([label, value]) => ({ label, value }));

  const resourceEntries = Object.entries(queryLog.resource_summary ?? {}).map(([label, value]) => ({
    label,
    value,
  }));

  return (
    <details>
      <summary className="cursor-pointer text-[9px] text-muted-foreground/70">Query Log ✓</summary>
      <div className="mt-1 space-y-2 rounded border border-muted/20 bg-muted/30 p-2">
        <KeyValueGrid entries={coreEntries} />
        {resourceEntries.length > 0 && (
          <div className="space-y-1">
            <div className="text-[9px] font-medium text-foreground/80">Resource summary</div>
            <KeyValueGrid entries={resourceEntries} />
          </div>
        )}
        {queryLog.profile_events && Object.keys(queryLog.profile_events).length > 0 && (
          <details>
            <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
              Full ProfileEvents
            </summary>
            <pre className="mt-1 overflow-x-auto rounded border border-muted/20 bg-background/60 p-2 text-[9px] leading-tight">
              {JSON.stringify(queryLog.profile_events, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </details>
  );
}

function TableSchemaSection({
  tableSchema,
  tableStats,
}: {
  tableSchema: NonNullable<EvidenceContext["table_schema"]>;
  tableStats?: EvidenceContext["table_stats"];
}) {
  return (
    <details>
      <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
        Table Schema ✓
      </summary>
      <div className="mt-1 space-y-2">
        {Object.entries(tableSchema).map(([tableName, schema]) => {
          const stats = tableStats?.[tableName];
          return (
            <div
              key={tableName}
              className="space-y-2 rounded border border-muted/20 bg-muted/30 p-2 text-[9px]"
            >
              <div className="font-medium text-foreground/90">{tableName}</div>
              <KeyValueGrid
                entries={[
                  { label: "Engine", value: schema.engine },
                  { label: "Partition key", value: schema.partition_key },
                  { label: "Primary key", value: schema.primary_key },
                  { label: "Sorting key", value: schema.sorting_key },
                  {
                    label: "Secondary indexes",
                    value:
                      schema.secondary_indexes && schema.secondary_indexes.length > 0
                        ? schema.secondary_indexes.join("; ")
                        : "None",
                  },
                  {
                    label: "Rows",
                    value: stats?.rows,
                  },
                  {
                    label: "Bytes",
                    value: stats?.bytes,
                  },
                ].filter((entry) => entry.value != null)}
              />
              <div className="space-y-1">
                <div className="text-[9px] font-medium text-foreground/80">Columns</div>
                <ColumnPreview columns={schema.columns} />
              </div>
              {schema.optimization_target && (
                <div className="space-y-2 rounded border border-dashed border-muted/30 bg-background/50 p-2">
                  <div className="text-[9px] font-medium text-foreground/80">
                    Optimization target: {schema.optimization_target.database}.
                    {schema.optimization_target.table}
                  </div>
                  <KeyValueGrid
                    entries={[
                      { label: "Engine", value: schema.optimization_target.engine },
                      { label: "Cluster", value: schema.optimization_target.cluster },
                      {
                        label: "Partition key",
                        value: schema.optimization_target.partition_key,
                      },
                      {
                        label: "Primary key",
                        value: schema.optimization_target.primary_key,
                      },
                      {
                        label: "Sorting key",
                        value: schema.optimization_target.sorting_key,
                      },
                      {
                        label: "Secondary indexes",
                        value:
                          schema.optimization_target.secondary_indexes &&
                          schema.optimization_target.secondary_indexes.length > 0
                            ? schema.optimization_target.secondary_indexes.join("; ")
                            : "None",
                      },
                      {
                        label: "Rows",
                        value: schema.optimization_target.stats?.rows,
                      },
                      {
                        label: "Bytes",
                        value: schema.optimization_target.stats?.bytes,
                      },
                    ].filter((entry) => entry.value != null)}
                  />
                  <div className="space-y-1">
                    <div className="text-[9px] font-medium text-foreground/80">Local columns</div>
                    <ColumnPreview columns={schema.optimization_target.columns} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

export const MessageToolCollectSqlOptimizationEvidence = memo(
  function MessageToolCollectSqlOptimizationEvidence({
    part,
    isRunning = true,
  }: {
    part: AppUIMessage["parts"][0];
    isRunning?: boolean;
  }) {
    const toolPart = part as ToolPart;
    const state = toolPart.state;
    const input = toolPart.input as CollectSqlOptimizationEvidenceInput | undefined;

    let toolCallId = "";
    if (part.type === "dynamic-tool") {
      toolCallId =
        (part as { toolCallId?: string }).toolCallId ||
        (part as { id?: string }).id ||
        (part as unknown as { toolCall?: { toolCallId?: string } }).toolCall?.toolCallId ||
        "";
    } else if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      toolCallId =
        (part as { toolCallId?: string }).toolCallId || (part as { id?: string }).id || "";
    }

    useToolProgressStore((state) => {
      return toolCallId ? state.progresses.get(toolCallId) : undefined;
    });

    const output =
      typeof toolPart.output === "object" && toolPart.output !== null
        ? (toolPart.output as EvidenceContext)
        : undefined;

    return (
      <CollapsiblePart
        toolName={"Collect SQL Optimization Evidence"}
        state={state}
        defaultExpanded={state !== "output-available"}
        isRunning={isRunning}
      >
        {input && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            {input.sql && (
              <>
                <div className="text-[10px] text-muted-foreground">input.sql:</div>
                <MessageMarkdownSql code={input.sql} showLineNumbers={true} />
              </>
            )}
            {input.query_id && (
              <div>
                <span className="font-medium">Query ID:</span> {input.query_id}
              </div>
            )}
            {input.goal && (
              <div>
                <span className="font-medium">input.goal:</span> {input.goal}
              </div>
            )}
            {input.mode && (
              <div>
                <span className="font-medium">Mode:</span> {input.mode}
              </div>
            )}
          </div>
        )}

        <ToolProgressIndicator toolCallId={toolCallId} />

        {output && (
          <div className="mt-1 max-h-[420px] space-y-1 overflow-auto text-[10px] text-muted-foreground">
            <div className="font-medium">output:</div>
            <div className="space-y-1 pl-4">
              {output.query_log && <QueryLogSection queryLog={output.query_log} />}
              {output.explain_index &&
                (typeof output.explain_index === "string" ? (
                  <details>
                    <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
                      Explain Index ✓
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded border border-muted/20 bg-muted/30 p-2 text-[9px] leading-tight">
                      {output.explain_index}
                    </pre>
                  </details>
                ) : (
                  <ExplainSummary
                    title="Explain Index"
                    summary={output.explain_index.summary}
                    rawText={output.explain_index.raw_text}
                  />
                ))}
              {output.explain_pipeline &&
                (typeof output.explain_pipeline === "string" ? (
                  <details>
                    <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
                      Explain Pipeline ✓
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded border border-muted/20 bg-muted/30 p-2 text-[9px] leading-tight">
                      {output.explain_pipeline}
                    </pre>
                  </details>
                ) : (
                  <ExplainSummary
                    title="Explain Pipeline"
                    summary={output.explain_pipeline.summary}
                    rawText={output.explain_pipeline.raw_text}
                  />
                ))}
              {output.table_schema && (
                <TableSchemaSection
                  tableSchema={output.table_schema}
                  tableStats={output.table_stats}
                />
              )}
            </div>
          </div>
        )}
      </CollapsiblePart>
    );
  }
);

import type { AppUIMessage } from "@/lib/ai/common-types";
import { useToolProgressStore } from "@/lib/ai/tools/client/tool-progress-store";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";
import { MessageMarkdownSql } from "./message-markdown-sql";
import { ToolProgressIndicator } from "./tool-progress-indicator";

export const MessageToolCollectSqlOptimizationEvidence = memo(
  function MessageToolCollectSqlOptimizationEvidence({ part }: { part: AppUIMessage["parts"][0] }) {
    const toolPart = part as ToolPart;
    const state = toolPart.state;
    const input = toolPart.input as { sql?: string; query_id?: string; goal?: string } | undefined;

    // Extract toolCallId from the part - handle different part structures
    let toolCallId = "";
    if (part.type === "dynamic-tool") {
      // For dynamic-tool parts, toolCallId might be in different locations
      toolCallId =
        (part as { toolCallId?: string }).toolCallId ||
        (part as { id?: string }).id ||
        (part as unknown as { toolCall?: { toolCallId?: string } }).toolCall?.toolCallId ||
        "";
    } else if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      // For tool-* parts, check common locations
      toolCallId =
        (part as { toolCallId?: string }).toolCallId || (part as { id?: string }).id || "";
    }

    // Get progress from store (currently unused but kept for potential future logic)
    useToolProgressStore((state) => {
      return toolCallId ? state.progresses.get(toolCallId) : undefined;
    });

    return (
      <CollapsiblePart
        toolName={"Collect SQL Optimization Evidence"}
        state={state}
        defaultExpanded={state !== "output-available"}
      >
        {/* Show input parameters */}
        {input && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            {input.sql && (
              <>
                <div className="text-[10px] text-muted-foreground">input.sql:</div>
                <MessageMarkdownSql code={input.sql} showLineNumbers={true}></MessageMarkdownSql>
              </>
            )}
            {input.query_id && (
              <div className="">
                <span className="font-medium">Query ID:</span> {input.query_id}
              </div>
            )}
            {input.goal && (
              <div className="">
                <span className="font-medium">input.goal:</span> {input.goal}
              </div>
            )}
          </div>
        )}

        {/* Show progress indicator when tool is running */}
        <ToolProgressIndicator toolCallId={toolCallId} />

        {/* Show output/evidence summary */}
        {toolPart.output != null && (
          <div className="mt-1 max-h-[400px] overflow-auto text-[10px] text-muted-foreground">
            <div className="font-medium">output:</div>
            <div className="pl-4">
              {typeof toolPart.output === "object" && toolPart.output !== null && (
                <div className="space-y-0">
                  {(() => {
                    const output = toolPart.output as {
                      query_log?: unknown;
                      explain_index?: string;
                      explain_pipeline?: string;
                      table_schema?: unknown;
                    };
                    return (
                      <>
                        {output.query_log && (
                          <details>
                            <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
                              Query Log ✓
                            </summary>
                            <pre className="bg-muted/30 rounded p-2 overflow-x-auto shadow-sm leading-tight border border-muted/20 mt-1 text-[9px]">
                              {JSON.stringify(output.query_log, null, 2)}
                            </pre>
                          </details>
                        )}
                        {output.explain_index && (
                          <details>
                            <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
                              Explain Index ✓
                            </summary>
                            <pre className="bg-muted/30 rounded p-2 overflow-x-auto shadow-sm leading-tight border border-muted/20 mt-1 text-[9px]">
                              {output.explain_index}
                            </pre>
                          </details>
                        )}
                        {output.explain_pipeline && (
                          <details>
                            <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
                              Explain Pipeline ✓
                            </summary>
                            <pre className="bg-muted/30 rounded p-2 overflow-x-auto shadow-sm leading-tight border border-muted/20 mt-1 text-[9px]">
                              {output.explain_pipeline}
                            </pre>
                          </details>
                        )}
                        {output.table_schema && (
                          <details>
                            <summary className="cursor-pointer text-[9px] text-muted-foreground/70">
                              Table Schema ✓
                            </summary>
                            <pre className="bg-muted/30 rounded p-2 overflow-x-auto shadow-sm leading-tight border border-muted/20 mt-1 text-[9px]">
                              {JSON.stringify(output.table_schema, null, 2)}
                            </pre>
                          </details>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </CollapsiblePart>
    );
  }
);

import { DataTable } from "@/components/shared/dashboard/data-table";
import type { AppUIMessage, ToolPart } from "@/lib/ai/chat-types";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";
import { MessageMarkdownSql } from "./message-markdown-sql";

type ExecuteSqlToolOutput = {
  columns: Array<{ name: string; type: string }>;
  rows?: Array<Record<string, unknown>>;
  rowCount: number;
  sampleRow?: Record<string, unknown>;
  error?: string;
};

export const MessageToolExecuteSql = memo(function ExecuteSqlPart({
  part,
  isRunning = true,
}: {
  part: AppUIMessage["parts"][0];
  isRunning?: boolean;
}) {
  const toolPart = part as ToolPart & {
    input?: { sql?: string };
    output?: ExecuteSqlToolOutput;
  };
  const input = toolPart.input;
  const output = toolPart.output;
  const state = toolPart.state;
  const rows = output?.rows ?? [];
  const isSuccess = output ? !output.error : undefined;

  return (
    <CollapsiblePart
      toolName={"Execute SQL"}
      state={state}
      success={isSuccess}
      isRunning={isRunning}
    >
      {input?.sql && (
        <>
          <div className="text-[10px] text-muted-foreground">input:</div>
          <MessageMarkdownSql
            code={input.sql}
            showExecuteButton={false}
            customStyle={{
              marginLeft: "0.5rem",
              paddingLeft: "0.5rem",
              paddingTop: "0rem",
              paddingBottom: "0rem",
              borderRadius: "0.375rem",
              fontSize: "10px",
            }}
          />
        </>
      )}
      {output && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          <div>output:</div>
          {output.error ? (
            <pre className="bg-muted/30 pl-2 leading-tight whitespace-pre-wrap break-words max-w-full max-h-[200px] overflow-auto text-destructive">
              {output.error}
            </pre>
          ) : rows.length > 0 ? (
            <div className="mt-1 ml-[0.5rem] h-[100px] overflow-hidden rounded-sm border bg-background">
              <DataTable
                data={rows}
                meta={output.columns}
                fieldOptions={[]}
                enableIndexColumn={true}
                enableCompactMode={true}
                className="h-full"
                pagination={{
                  pageSize: 10,
                  mode: "client",
                }}
              />
            </div>
          ) : (
            <div>success: no data returned</div>
          )}
        </div>
      )}
    </CollapsiblePart>
  );
});

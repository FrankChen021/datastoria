import { SERVER_TOOL_NAMES } from "@/lib/ai/server-tools";
import type { AppUIMessage, ToolPart } from "@/lib/ai/common-types";
import { memo } from "react";
import { MessageMarkdownSql } from "./message-markdown-sql";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolGenerateSql = memo(function GenerateSqlPart({ part }: { part: AppUIMessage["parts"][0] }) {
  const toolPart = part as ToolPart & { output?: { sql?: string; notes?: string } };
  const output = toolPart.output;
  const state = toolPart.state;

  return (
    <CollapsiblePart toolName={SERVER_TOOL_NAMES.GENERATE_SQL} state={state}>
      {output?.sql && (
        <MessageMarkdownSql
          code={output.sql}
          showExecuteButton={false}
          customStyle={{
            margin: 0,
            borderRadius: "0.375rem",
            fontSize: "10px",
          }}
        />
      )}
      {output?.notes && <div className="text-xs text-muted-foreground leading-relaxed px-1">{output.notes}</div>}
    </CollapsiblePart>
  );
});


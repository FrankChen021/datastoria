import { CLIENT_TOOL_NAMES } from "@/lib/ai/client-tools";
import type { AppUIMessage, ToolPart } from "@/lib/ai/common-types";
import { memo } from "react";
import { MessageMarkdownSql } from "./message-markdown-sql";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolExecuteSql = memo(function ExecuteSqlPart({ part }: { part: AppUIMessage["parts"][0] }) {
  const toolPart = part as ToolPart & { input?: { sql?: string } };
  const input = toolPart.input;
  const state = toolPart.state;

  return (
    <CollapsiblePart toolName={CLIENT_TOOL_NAMES.EXECUTE_SQL} state={state}>
      {input?.sql && (
        <>
          <div className="text-[10px] text-muted-foreground">input:</div>
          <MessageMarkdownSql
            code={input.sql}
            showExecuteButton={false}
            customStyle={{
              margin: 0,
              borderRadius: "0.375rem",
              fontSize: "10px",
            }}
          />
        </>
      )}
    </CollapsiblePart>
  );
});


import type { AppUIMessage } from "@/lib/ai/common-types";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";
import { MessageMarkdownSql } from "./message-markdown-sql";

export const MessageToolGenerateSql = memo(function GenerateSqlPart({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart & { output?: { sql?: string; notes?: string } };
  const output = toolPart.output;
  const state = toolPart.state;

  return (
    <CollapsiblePart toolName={"Generate SQL"} state={state}>
      {output?.sql && (
        <>
          <div className="text-[10px] text-muted-foreground">output:</div>
          <MessageMarkdownSql
            code={output.sql}
            showExecuteButton={false}
            customStyle={{
              marginLeft: "0.5rem",
              borderRadius: "0",
              fontSize: "10px",
            }}
          />
        </>
      )}
      {output?.notes && (
        <div className="text-xs text-muted-foreground leading-relaxed px-1">{output.notes}</div>
      )}
    </CollapsiblePart>
  );
});

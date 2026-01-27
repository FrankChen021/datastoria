import type { AppUIMessage } from "@/lib/ai/common-types";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";
import { MessageMarkdownSql } from "./message-markdown-sql";

export const MessageToolExecuteSql = memo(function ExecuteSqlPart({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart & { input?: { sql?: string } };
  const input = toolPart.input;
  const state = toolPart.state;

  return (
    <CollapsiblePart toolName={"Execute SQL"} state={state}>
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
    </CollapsiblePart>
  );
});

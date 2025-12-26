import {
    CLIENT_TOOL_NAMES,
    type ValidateSqlToolInput,
    type ValidateSqlToolOutput,
} from "@/lib/ai/client-tools";
import type { AppUIMessage, ToolPart } from "@/lib/ai/common-types";
import { memo } from "react";
import { MessageMarkdownSql } from "./message-markdown-sql";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolValidateSql = memo(function MessageToolValidateSql({ part }: { part: AppUIMessage["parts"][0] }) {
  const toolPart = part as ToolPart & {
    input?: ValidateSqlToolInput;
    output?: ValidateSqlToolOutput;
  };
  const input = toolPart.input;
  const output = toolPart.output;
  const state = toolPart.state;

  return (
    <CollapsiblePart toolName={CLIENT_TOOL_NAMES.VALIDATE_SQL} state={state}>
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
      {output && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          output: {output.success ? "success" : output.error}
        </div>
      )}
    </CollapsiblePart>
  );
});


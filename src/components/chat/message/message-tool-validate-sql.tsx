import type { AppUIMessage } from "@/lib/ai/common-types";
import {
  type ValidateSqlToolInput,
  type ValidateSqlToolOutput,
} from "@/lib/ai/tools/client/client-tools";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";
import { MessageMarkdownSql } from "./message-markdown-sql";

export const MessageToolValidateSql = memo(function MessageToolValidateSql({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart & {
    input?: ValidateSqlToolInput;
    output?: ValidateSqlToolOutput;
  };
  const input = toolPart.input;
  const output = toolPart.output;
  const state = toolPart.state;

  return (
    <CollapsiblePart toolName={"Validate SQL"} state={state} success={output?.success}>
      {input?.sql && (
        <>
          <div className="text-[10px] text-muted-foreground">input:</div>
          <MessageMarkdownSql
            code={input.sql}
            showExecuteButton={false}
            customStyle={{
              marginLeft: "0.5rem",
              paddingLeft: "0.5rem",
              paddingTop: "4px",
              paddingBottom: "4px",
              borderRadius: "0rem",
              fontSize: "10px",
            }}
          />
        </>
      )}
      {output && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          output:{" "}
          {output.success ? (
            "success"
          ) : (
            <pre className="bg-muted/30 pl-2 leading-tight whitespace-pre-wrap break-words max-w-full max-h-[200px] overflow-auto text-destructive">
              {output.error}
            </pre>
          )}
        </div>
      )}
    </CollapsiblePart>
  );
});

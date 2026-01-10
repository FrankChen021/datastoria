import type { AppUIMessage } from "@/lib/ai/common-types";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolGeneral = memo(function MessageToolGeneral({
  toolName,
  part,
}: {
  toolName: string;
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart;
  const state = toolPart.state;

  return (
    <CollapsiblePart toolName={toolName} state={state}>
      {toolPart.input != null && (
        <div className="mt-1 max-h-[300px] overflow-auto text-[10px] text-muted-foreground">
          <div className="mb-0.5">input:</div>
          <pre className="bg-muted/30 rounded p-2 overflow-x-auto shadow-sm leading-tight border border-muted/20">
            {JSON.stringify(toolPart.input, null, 2)}
          </pre>
        </div>
      )}
      {toolPart.output != null && (
        <div className="mt-1 max-h-[300px] overflow-auto text-[10px] text-muted-foreground">
          <div className="mb-0.5">output:</div>
          <pre className="bg-muted/30 rounded p-2 overflow-x-auto shadow-sm leading-tight border border-muted/20">
            {JSON.stringify(toolPart.output, null, 2)}
          </pre>
        </div>
      )}
    </CollapsiblePart>
  );
});

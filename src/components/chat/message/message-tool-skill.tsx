import type { AppUIMessage, ToolPart } from "@/lib/ai/chat-types";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolSkill = memo(function MessageToolSkill({
  isRunning = true,
  part,
  label = "Load Skills",
}: {
  part: AppUIMessage["parts"][0];
  isRunning?: boolean;
  label?: string;
}) {
  const toolPart = part as ToolPart;
  const state = toolPart.state;

  return (
    <CollapsiblePart toolName={label} state={state} isRunning={isRunning}>
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
            {`${(toolPart.output as string).length} characters...`}
          </pre>
        </div>
      )}
    </CollapsiblePart>
  );
});

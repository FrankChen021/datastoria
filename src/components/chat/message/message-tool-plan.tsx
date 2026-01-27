import type { PlanOutput } from "@/app/api/chat/route";
import type { AppUIMessage } from "@/lib/ai/common-types";
import { memo, useEffect } from "react";
import type { ToolPart } from "../chat-message-types";
import { ChatUIContext } from "../chat-ui-context";
import { CollapsiblePart } from "./collapsible-part";

/**
 * This is a SIMULATE tool call for the client to show as progress
 */
export const MessageToolPlan = memo(function MessageToolPlan({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart;
  const state = toolPart.state;
  const output = toolPart.output as PlanOutput;

  // Update title when output.title is available
  useEffect(() => {
    if (output?.title) {
      ChatUIContext.updateTitle(output.title);
    }
  }, [output?.title]);

  return (
    <CollapsiblePart toolName={"Plan"} state={state}>
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

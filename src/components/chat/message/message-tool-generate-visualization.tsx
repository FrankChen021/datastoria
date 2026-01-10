import { DashboardPanel } from "@/components/shared/dashboard/dashboard-panel";
import { SERVER_TOOL_NAMES } from "@/lib/ai/agent/server-tools";
import type { AppUIMessage } from "@/lib/ai/common-types";
import { memo } from "react";
import type { PanelDescriptor } from "../../shared/dashboard/dashboard-model";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolGenerateVisualization = memo(function MessageToolGenerateVisualization({
  part,
}: {
  part: AppUIMessage["parts"][0];
}) {
  const toolPart = part as ToolPart & { output?: PanelDescriptor };
  const panelDescriptor = toolPart.output;
  const state = toolPart.state;
  const isComplete = state === "output-available";
  const isError = state === "output-error";

  if (isComplete && (!panelDescriptor || panelDescriptor.type === "none")) {
    // Defensive
    return null;
  }
  if (panelDescriptor) {
    if (panelDescriptor.titleOption === undefined) {
      // Defensive programming
      panelDescriptor.titleOption = {
        title: "",
      };
    }
    panelDescriptor.titleOption.showRefreshButton = true;
    if (panelDescriptor.height === undefined) {
      panelDescriptor.height = 300;
    }
  }

  return (
    <>
      <CollapsiblePart
        toolName={SERVER_TOOL_NAMES.GENEREATE_VISUALIZATION}
        state={state}
        defaultExpanded={true}
        keepChildrenMounted={true}
      >
        {isComplete && (
          <div className="pt-1">
            <DashboardPanel descriptor={panelDescriptor as PanelDescriptor} />
          </div>
        )}
        {isError && (
          <div className="text-xs text-destructive leading-relaxed px-1 py-1">
            {toolPart.errorText || "An error occurred"}
          </div>
        )}
      </CollapsiblePart>
    </>
  );
});

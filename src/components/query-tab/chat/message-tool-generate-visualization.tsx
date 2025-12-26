import { SERVER_TOOL_NAMES } from "@/lib/ai/server-tools";
import type { AppUIMessage, ToolPart } from "@/lib/ai/common-types";
import { memo } from "react";
import type { PanelDescriptor, TableDescriptor, TimeseriesDescriptor } from "../../shared/dashboard/dashboard-model";
import DashboardPanelTable from "../../shared/dashboard/dashboard-panel-table";
import DashboardPanelTimeseries from "../../shared/dashboard/dashboard-panel-timeseries";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolGenerateVisualization = memo(function MessageToolGenerateVisualization({ part }: { part: AppUIMessage["parts"][0] }) {
  const toolPart = part as ToolPart & { output?: PanelDescriptor };
  const panelDescriptor = toolPart.output;
  const state = toolPart.state;
  const isComplete = state === "output-available";

  if (isComplete && (!panelDescriptor || panelDescriptor.type === "none")) return null;
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
        defaultExpanded={false}
      ></CollapsiblePart>
      {panelDescriptor?.type === "table" ? (
        // The height is hard coded here, and in future we can optimize it
        <div className="h-[300px]">
          <DashboardPanelTable className="mt-1" descriptor={panelDescriptor as TableDescriptor} />
        </div>
      ) : panelDescriptor?.type === "line" || panelDescriptor?.type === "bar" || panelDescriptor?.type === "area" ? (
        <div className="h-[300px]">
          <DashboardPanelTimeseries className="mt-1" descriptor={panelDescriptor as TimeseriesDescriptor} />
        </div>
      ) : null}
    </>
  );
});


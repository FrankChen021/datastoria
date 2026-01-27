import { DashboardVisualizationPanel } from "@/components/shared/dashboard/dashboard-visualization-panel";
import type { AppUIMessage } from "@/lib/ai/common-types";
import { memo, useMemo } from "react";
import type { PanelDescriptor } from "../../shared/dashboard/dashboard-model";
import type { ToolPart } from "../chat-message-types";
import { CollapsiblePart } from "./collapsible-part";

export const MessageToolGenerateVisualization = memo(
  function MessageToolGenerateVisualization({ part }: { part: AppUIMessage["parts"][0] }) {
    const toolPart = part as ToolPart & { output?: PanelDescriptor };
    const state = toolPart.state;
    const isComplete = state === "output-available";
    const isError = state === "output-error";

    // Memoize panelDescriptor modifications to avoid mutating on every render
    const panelDescriptor = useMemo(() => {
      const descriptor = toolPart.output;
      if (!descriptor) return undefined;

      // Create a new object with modifications instead of mutating
      return {
        ...descriptor,
        titleOption: {
          ...(descriptor.titleOption || { title: "" }),
          showRefreshButton: true,
        },
        height: descriptor.height ?? 300,
      };
    }, [toolPart.output]);

    if (isComplete && (!panelDescriptor || panelDescriptor.type === "none")) {
      return null;
    }

    return (
      <>
        <CollapsiblePart
          toolName={"Generate Visualization"}
          state={state}
          defaultExpanded={true}
          keepChildrenMounted={true}
        >
          {isComplete && (
            <div
              className="pt-1"
              style={{ height: panelDescriptor?.height ? panelDescriptor.height + 30 : 300 }}
            >
              <DashboardVisualizationPanel descriptor={panelDescriptor as PanelDescriptor} />
            </div>
          )}
          {isError && (
            <div className="text-xs text-destructive leading-relaxed px-1 py-1">
              {(toolPart as { errorText?: string }).errorText || "An error occurred"}
            </div>
          )}
        </CollapsiblePart>
      </>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if the tool part actually changed
    const prevPart = prevProps.part as ToolPart;
    const nextPart = nextProps.part as ToolPart;
    return prevPart.toolCallId === nextPart.toolCallId && prevPart.state === nextPart.state;
  }
);

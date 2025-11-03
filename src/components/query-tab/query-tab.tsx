import { QueryInputView } from "./query-input/query-input-view";
import { QueryListView } from "@/components/query-tab/query-list-view";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

export interface QueryTabProps {
  tabId?: string;
}

export function QueryTab({ tabId }: QueryTabProps) {
  return (
    <PanelGroup direction="vertical" className="h-full">
      {/* Top Panel: Query Response View */}
      <Panel defaultSize={60} minSize={20} className="border-b bg-background overflow-auto">
        <QueryListView tabId={tabId} />
      </Panel>

      <PanelResizeHandle className="h-0.5 bg-border hover:bg-border/80 transition-colors cursor-row-resize" />

      {/* Bottom Panel: Query Input View */}
      <Panel defaultSize={40} minSize={20} className="bg-background">
        <QueryInputView />
      </Panel>
    </PanelGroup>
  );
}


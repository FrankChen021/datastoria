import { QueryInputView } from "./query-input/query-input-view";
import { QueryListView } from "@/components/query-tab/query-list-view";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { QueryControl } from "./query-control/query-control";
import { useHasSelectedText } from "./query-control/use-query-state";
import { memo, useCallback, useState } from "react";

export interface QueryTabProps {
  tabId?: string;
}

const QueryTabComponent = ({ tabId }: QueryTabProps) => {
  const hasSelectedText = useHasSelectedText();
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecutionStateChange = useCallback((executing: boolean) => {
    setIsExecuting(executing);
  }, []);

  return (
    <PanelGroup direction="vertical" className="h-full">
      {/* Top Panel: Query Response View */}
      <Panel defaultSize={60} minSize={20} className="border-b bg-background overflow-auto">
        <QueryListView tabId={tabId} onExecutionStateChange={handleExecutionStateChange} />
      </Panel>

      <PanelResizeHandle className="h-0.5 bg-border hover:bg-border/80 transition-colors cursor-row-resize" />

      {/* Bottom Panel: Query Input View with Control */}
      <Panel defaultSize={40} minSize={20} className="bg-background flex flex-col">
        <QueryControl isExecuting={isExecuting} hasSelectedText={hasSelectedText} />
        <div className="flex-1 overflow-hidden">
          <QueryInputView />
        </div>
      </Panel>
    </PanelGroup>
  );
};

export const QueryTab = memo(QueryTabComponent);


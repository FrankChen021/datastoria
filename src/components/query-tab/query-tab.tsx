import { QueryListView } from "@/components/query-tab/query-list-view";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type ImperativePanelHandle, Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { QueryControl } from "./query-control/query-control";
import { QueryExecutor, type QueryRequestEventDetail } from "./query-execution/query-executor";
import { QueryInputView, type QueryInputViewRef } from "./query-input/query-input-view";

export interface QueryTabProps {
  tabId?: string;
  initialQuery?: string;
  initialMode?: "replace" | "insert";
  active?: boolean;
}


const QueryTabComponent = ({ tabId, initialQuery, initialMode, active }: QueryTabProps) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const resultPanelRef = useRef<ImperativePanelHandle>(null);
  const queryInputRef = useRef<QueryInputViewRef>(null);

  const handleExecutionStateChange = useCallback((executing: boolean) => {
    setIsExecuting(executing);
  }, []);

  // Auto-expand the result panel when a query is executed
  useEffect(() => {
    const unsubscribe = QueryExecutor.onQueryRequest((event: CustomEvent<QueryRequestEventDetail>) => {
      const { tabId: eventTabId } = event.detail;

      // If tabId is specified, only handle events for this tab
      // If no tabId is specified in event, handle it in all tabs (or conservatively, just this one)
      if (eventTabId !== undefined && eventTabId !== tabId) {
        return;
      }

      const panel = resultPanelRef.current;
      if (panel) {
        const currentSize = panel.getSize();
        // If panel is collapsed or very small, expand it
        if (currentSize < 10) {
          panel.resize(60);
        }
      }
    });

    return unsubscribe;
  }, [tabId]);

  // Focus editor when tab becomes active
  useEffect(() => {
    if (active) {
      // Use setTimeout to ensure focus happens after the tab is fully rendered
      setTimeout(() => {
        queryInputRef.current?.focus();
      }, 0);
    }
  }, [active]);

  return (
    <PanelGroup direction="vertical" className="h-full">
      {/* Top Panel: Query Response View */}
      <Panel ref={resultPanelRef} defaultSize={0} minSize={0} className="bg-background overflow-auto">
        <QueryListView tabId={tabId} onExecutionStateChange={handleExecutionStateChange} />
      </Panel>

      <PanelResizeHandle className="h-[1px] bg-border hover:bg-border/80 transition-colors cursor-row-resize" />

      {/* Bottom Panel: Query Input View with Control */}
      <Panel defaultSize={100} minSize={20} className="bg-background flex flex-col">
        <div className="flex-1 overflow-hidden">
          <QueryInputView
            ref={queryInputRef}
            initialQuery={initialQuery}
            initialMode={initialMode}
          />
        </div>
        <QueryControl isExecuting={isExecuting} />
      </Panel>
    </PanelGroup>
  );
};

export const QueryTab = memo(QueryTabComponent);


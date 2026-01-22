import { useConnection } from "@/components/connection/connection-context";
import { QueryListView } from "@/components/query-tab/query-list-view";
import { TabManager } from "@/components/tab-manager";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { QueryControl } from "./query-control/query-control";
import { QueryExecutionProvider, useQueryExecutor } from "./query-execution/query-executor";
import type { QueryInputViewRef } from "./query-input/query-input-view";

// Dynamically import QueryInputView to prevent SSR issues with ace editor
const QueryInputView = dynamic(
  () => import("./query-input/query-input-view").then((mod) => mod.QueryInputView),
  {
    ssr: false,
  }
);

export interface QueryTabProps {
  tabId?: string;
  initialQuery?: string;
  initialMode?: "replace" | "insert";
  initialExecute?: boolean;
  active?: boolean;
}

const QueryTabContent = ({
  tabId,
  initialQuery,
  initialMode,
  initialExecute,
  active,
}: QueryTabProps) => {
  const queryInputRef = useRef<QueryInputViewRef>(null);
  const { connection } = useConnection();
  const { executeQuery, isSqlExecuting } = useQueryExecutor();

  // Pending query state for handling mode switching
  const [pendingQueryInfo, setPendingQueryInfo] = useState<{
    query: string;
    mode: "replace" | "insert";
  } | null>(null);

  // Unified handler for Cmd+Enter in QueryInputView
  const handleInputRun = useCallback(
    (textToRun: string) => {
      if (!connection || textToRun.length === 0 || isSqlExecuting) {
        return;
      }

      executeQuery(textToRun);
    },
    [executeQuery, connection, isSqlExecuting]
  );

  // Listen for query tab activation events
  useEffect(() => {
    const handler = (event: CustomEvent<import("@/components/tab-manager").TabInfo>) => {
      if (event.detail.type === "query") {
        const queryTabInfo = event.detail as import("@/components/tab-manager").QueryTabInfo;

        // Handle query insertion if provided
        if (queryTabInfo.initialQuery) {
          // Store query to be applied
          setPendingQueryInfo({
            query: queryTabInfo.initialQuery,
            mode: queryTabInfo.initialMode || "replace",
          });

          // Trigger execution if requested
          if (queryTabInfo.initialExecute) {
            executeQuery(queryTabInfo.initialQuery);
          }
        }
      }
    };

    const unsubscribe = TabManager.onOpenTab(handler);
    return unsubscribe;
  }, [executeQuery]);

  // Apply pending query when editor is ready
  useEffect(() => {
    if (pendingQueryInfo && queryInputRef.current) {
      // Use setTimeout to ensure the editor has loaded content from storage
      setTimeout(() => {
        queryInputRef.current?.setQuery(pendingQueryInfo.query, pendingQueryInfo.mode);
        // Clear pending query
        setPendingQueryInfo(null);
      }, 50);
    }
  }, [pendingQueryInfo]);

  // Execute initial query on mount if requested
  useEffect(() => {
    if (initialExecute && initialQuery) {
      // Small delay to ensure the execution state is ready and connection is available
      const timer = setTimeout(() => {
        executeQuery(initialQuery);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialExecute, initialQuery, executeQuery]);

  // Focus editor when tab becomes active (existing effect)
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
      <Panel defaultSize={60} minSize={20} className="bg-background overflow-auto">
        <QueryListView tabId={tabId} />
      </Panel>

      <PanelResizeHandle className="h-0.5 bg-border hover:bg-border/80 transition-colors cursor-row-resize" />

      {/* Bottom Panel: Query Input View with Control */}
      <Panel defaultSize={40} minSize={20} className="bg-background flex flex-col">
        <div className="flex-1 overflow-hidden">
          <QueryInputView
            ref={queryInputRef}
            initialQuery={initialQuery}
            initialMode={initialMode}
            storageKey="sql:input"
            language="dsql"
            onRun={handleInputRun}
          />
        </div>
        <QueryControl />
      </Panel>
    </PanelGroup>
  );
};

export const QueryTab = memo((props: QueryTabProps) => (
  <QueryExecutionProvider>
    <QueryTabContent {...props} />
  </QueryExecutionProvider>
));

import { QueryListView } from "@/components/query-tab/query-list-view";
import { useConnection } from "@/lib/connection/connection-context";
import { toastManager } from "@/lib/toast";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type ImperativePanelHandle, Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { QueryControl } from "./query-control/query-control";
import { useQueryEditor } from "./query-control/use-query-editor";
import { ChatExecutor } from "./query-execution/chat-executor";
import { QueryExecutor, type QueryRequestEventDetail } from "./query-execution/query-executor";
import { QueryInputLocalStorage } from "./query-input/query-input-local-storage";
import type { QueryInputViewRef } from "./query-input/query-input-view";

// Dynamically import QueryInputView to prevent SSR issues with ace editor
const QueryInputView = dynamic(
  () => import("./query-input/query-input-view").then(mod => mod.QueryInputView),
  { ssr: false }
);

export interface QueryTabProps {
  tabId?: string;
  initialQuery?: string;
  initialMode?: "replace" | "insert";
  active?: boolean;
}


const QueryTabComponent = ({ tabId, initialQuery, initialMode, active }: QueryTabProps) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [mode, setMode] = useState<"sql" | "chat">("sql");
  const resultPanelRef = useRef<ImperativePanelHandle>(null);
  const queryInputRef = useRef<QueryInputViewRef>(null);
  const { connection } = useConnection();
  const { text } = useQueryEditor(); // Get current text for chat

  const lastExecutionRef = useRef<any>(null);

  const handleExecutionStateChange = useCallback((executing: boolean) => {
    setIsExecuting(executing);
  }, []);

  const handleChatRequest = useCallback((inputText?: string) => {
    const textToUse = typeof inputText === 'string' ? inputText : text;
    if (!textToUse) return;

    // Get background SQL context if in chat mode (read from SQL storage)
    // If in SQL mode, the 'text' variable already holds the SQL, but handleChatRequest is likely called in Chat mode.
    // We explicitly read the SQL buffer to ensure we get the latest SQL the user was working on.
    const backgroundSql = QueryInputLocalStorage.getInput('editing-sql');

    // Build context for chat
    const context = {
      currentQuery: backgroundSql, // The SQL context "behind" the chat
      database: (connection as any)?.database,
      lastExecution: lastExecutionRef.current,
    };

    // Send to chat API
    ChatExecutor.sendChatRequest(textToUse, context);

    // Clear the chat input after sending
    queryInputRef.current?.setValue('');
  }, [text, connection]);

  const handleRun = useCallback((textToRun: string) => {
    if (mode === "chat") {
      handleChatRequest(textToRun);
    } else {
      QueryExecutor.sendQueryRequest(textToRun, {
        params: {
          default_format: "PrettyCompactMonoBlock",
          output_format_pretty_row_numbers: true,
        },
      });
    }
  }, [mode, handleChatRequest]);

  // Listen for query success to update context
  useEffect(() => {
    const unsubscribe = QueryExecutor.onQuerySuccess((event) => {
      // Update the ref with the latest execution details
      lastExecutionRef.current = event.detail;
    });
    return unsubscribe;
  }, []);

  const handleClearContext = useCallback(() => {
    lastExecutionRef.current = null;
    toastManager.show("Chat context cleared (execution history)", "success");
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
        {/* <ChatPanel
          currentDatabase={"default"}
          availableTables={[{ name: "table1", columns: ["column1", "column2"] }]}
        /> */}
      </Panel>

      <PanelResizeHandle className="h-[1px] bg-border hover:bg-border/80 transition-colors cursor-row-resize" />

      {/* Bottom Panel: Query Input View with Control */}
      <Panel defaultSize={100} minSize={20} className="bg-background flex flex-col">

        <div className="flex-1 overflow-hidden">
          <QueryInputView
            ref={queryInputRef}
            initialQuery={initialQuery}
            initialMode={initialMode}
            storageKey={mode === "sql" ? "editing-sql" : "editing-chat"}
            language={mode === "sql" ? "dsql" : "markdown"}
            placeholder={mode === "chat" ? "Ask AI anything about your data..." : undefined}
            onToggleMode={() => setMode(prev => prev === 'sql' ? 'chat' : 'sql')}
            onRun={handleRun}
          />
        </div>
        <QueryControl
          mode={mode}
          onModeChange={setMode}
          isExecuting={isExecuting}
          onRun={handleRun}
          onClearContext={handleClearContext}
        />
      </Panel>
    </PanelGroup>
  );
};

export const QueryTab = memo(QueryTabComponent);


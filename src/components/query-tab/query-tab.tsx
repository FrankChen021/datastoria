import { useConnection } from "@/components/connection/connection-context";
import { QueryListView, type ChatSessionStats } from "@/components/query-tab/query-list-view";
import { TabManager } from "@/components/tab-manager";
import { NUM_COLORS } from "@/lib/color-generator";
import { Hash } from "@/lib/hash";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { v7 as uuidv7 } from "uuid";
import { QueryControl } from "./query-control/query-control";
import { ChatExecutionProvider } from "./query-execution/chat-execution-context";
import { ChatExecutor } from "./query-execution/chat-executor";
import { QueryExecutionProvider, useQueryExecutor } from "./query-execution/query-executor";
import { QueryInputLocalStorage } from "./query-input/query-input-local-storage";
import type { QueryInputViewRef } from "./query-input/query-input-view";
import { useQueryInput } from "./query-input/use-query-input";

/**
 * Generates a new session ID that will have a different color than the previous session.
 * Uses hash-based color selection to ensure visual distinction.
 */
function generateNewSessionId(previousSessionId: string | undefined): string {
  if (!previousSessionId) {
    // No previous session, just generate a new one
    return uuidv7();
  }

  // Get the color index of the previous session
  const previousColorIndex = Hash.hash(previousSessionId) % NUM_COLORS;

  // Generate new session IDs until we get one with a different color
  // With 12 colors, probability of collision is ~8.3%, so we should find one quickly
  const maxAttempts = 50; // Safety limit to avoid infinite loops
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const newSessionId = uuidv7();
    const newColorIndex = Hash.hash(newSessionId) % NUM_COLORS;

    if (newColorIndex !== previousColorIndex) {
      return newSessionId;
    }
  }

  // If we somehow couldn't find a different color after maxAttempts, just return a new UUID
  // This is extremely unlikely but provides a fallback
  return uuidv7();
}

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
  const [mode, setMode] = useState<"sql" | "chat">("sql");
  const [isChatExecuting, setIsChatExecuting] = useState(false);
  const queryInputRef = useRef<QueryInputViewRef>(null);
  const { connection } = useConnection();
  const { text } = useQueryInput(); // Get current text for chat
  const { executeQuery, isSqlExecuting } = useQueryExecutor();

  // Pending query state for handling mode switching
  const [pendingQueryInfo, setPendingQueryInfo] = useState<{
    query: string;
    mode: "replace" | "insert";
  } | null>(null);

  // Session tracking for chat conversations
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => uuidv7());
  const [chatSessionStats, setChartSessionStats] = useState<ChatSessionStats>({
    messageCount: 0,
    tokens: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
  });

  const handleChatRequest = useCallback(
    (inputText?: string) => {
      const textToUse = typeof inputText === "string" ? inputText : text;
      if (!textToUse) return;

      // Get background SQL context if in chat mode (read from SQL storage)
      // If in SQL mode, the 'text' variable already holds the SQL, but handleChatRequest is likely called in Chat mode.
      // We explicitly read the SQL buffer to ensure we get the latest SQL the user was working on.
      const backgroundSql = QueryInputLocalStorage.getInput("editing-sql");

      // Build context for chat
      // Get ClickHouse user from connection (use internalUser if available, fallback to user)
      const clickHouseUser = connection?.metadata.internalUser;
      const context = {
        currentQuery: backgroundSql, // The SQL context "behind" the chat
        database: (connection as any)?.database,
        clickHouseUser,
      };

      // Send to chat API with session ID
      ChatExecutor.sendChatRequest(textToUse, context, tabId, currentSessionId);

      // Clear the chat input after sending
      queryInputRef.current?.setValue("");
    },
    [text, connection, tabId, currentSessionId]
  );

  // Unified handler for Cmd+Enter in QueryInputView
  // Handles both SQL and chat modes
  const handleInputRun = useCallback(
    (textToRun: string) => {
      // Prevent execution if already executing
      const isExecuting = isSqlExecuting || isChatExecuting;
      if (isExecuting) {
        return;
      }

      if (mode === "chat") {
        handleChatRequest(textToRun);
      } else {
        if (!connection || textToRun.length === 0) {
          return;
        }

        executeQuery(textToRun);
      }
    },
    [mode, handleChatRequest, executeQuery, connection, isSqlExecuting, isChatExecuting]
  );

  // handleChatRun is only used for chat mode (called from QueryControl button)
  const handleChatRun = useCallback(
    (textToRun: string) => {
      handleChatRequest(textToRun);
    },
    [handleChatRequest]
  );

  const handleNewConversation = useCallback(() => {
    setCurrentSessionId(generateNewSessionId(currentSessionId));
    setChartSessionStats({
      messageCount: 0,
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
    });
  }, [currentSessionId]);

  // Listen for query tab activation events
  useEffect(() => {
    const handler = (event: CustomEvent<import("@/components/tab-manager").OpenTabEventDetail>) => {
      if (event.detail.type === "query") {
        // Handle editor mode switch if specified
        if (event.detail.editorMode) {
          setMode(event.detail.editorMode);
        }

        // Handle query insertion if provided
        if (event.detail.query) {
          // Switch to SQL mode if not already (unless editorMode explicitly set to chat)
          if (!event.detail.editorMode) {
            setMode("sql");
          }
          // Store query to be applied after mode switch renders
          setPendingQueryInfo({
            query: event.detail.query,
            mode: event.detail.mode || "replace",
          });

          // Trigger execution if requested
          if (event.detail.execute) {
            executeQuery(event.detail.query);
          }
        }
      }
    };

    const unsubscribe = TabManager.onOpenTab(handler);
    return unsubscribe;
  }, [executeQuery]);

  // Apply pending query when mode is sql and editor is ready
  useEffect(() => {
    if (mode === "sql" && pendingQueryInfo && queryInputRef.current) {
      // Use setTimeout to ensure the editor has loaded the SQL content from storage
      // after the mode switch, before we apply the new query.
      setTimeout(() => {
        queryInputRef.current?.setQuery(pendingQueryInfo.query, pendingQueryInfo.mode);
        // Clear pending query
        setPendingQueryInfo(null);
      }, 50);
    }
  }, [mode, pendingQueryInfo]);

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
    <ChatExecutionProvider isChatExecuting={isChatExecuting}>
      <PanelGroup direction="vertical" className="h-full">
        {/* Top Panel: Query Response View */}
        <Panel defaultSize={60} minSize={20} className="bg-background overflow-auto">
          <QueryListView
            tabId={tabId}
            currentSessionId={currentSessionId}
            onExecutionStateChange={setIsChatExecuting}
            onChatSessionStatsChanged={setChartSessionStats}
            onNewSession={handleNewConversation}
          />
          {/* <ChatPanel
            currentDatabase={"default"}
            availableTables={[{ name: "table1", columns: ["column1", "column2"] }]}
          /> */}
        </Panel>

        <PanelResizeHandle className="h-[1px] bg-border hover:bg-border/80 transition-colors cursor-row-resize" />

        {/* Bottom Panel: Query Input View with Control */}
        <Panel defaultSize={40} minSize={20} className="bg-background flex flex-col">
          <div className="flex-1 overflow-hidden">
            <QueryInputView
              ref={queryInputRef}
              initialQuery={initialQuery}
              initialMode={initialMode}
              storageKey={mode === "sql" ? "editing-sql" : "editing-chat"}
              language={mode === "sql" ? "dsql" : "chat"}
              onToggleMode={() => setMode((prev) => (prev === "sql" ? "chat" : "sql"))}
              onRun={handleInputRun}
            />
          </div>
          <QueryControl
            mode={mode}
            onModeChange={setMode}
            onRun={handleChatRun}
            onNewConversation={handleNewConversation}
            sessionStats={chatSessionStats}
            currentSessionId={currentSessionId}
          />
        </Panel>
      </PanelGroup>
    </ChatExecutionProvider>
  );
};

export const QueryTab = memo((props: QueryTabProps) => (
  <QueryExecutionProvider>
    <QueryTabContent {...props} />
  </QueryExecutionProvider>
));

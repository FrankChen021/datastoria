import { Dialog } from "@/components/use-dialog";
import { QueryListView, type ChatSessionStats } from "@/components/query-tab/query-list-view";
import { NUM_COLORS } from "@/lib/color-generator";
import { useConnection } from "@/lib/connection/connection-context";
import { Hash } from "@/lib/hash";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { v7 as uuidv7 } from "uuid";
import { QueryControl } from "./query-control/query-control";
import { ChatExecutor } from "./query-execution/chat-executor";
import { QueryExecutor } from "./query-execution/query-executor";
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
const QueryInputView = dynamic(() => import("./query-input/query-input-view").then((mod) => mod.QueryInputView), {
  ssr: false,
});

export interface QueryTabProps {
  tabId?: string;
  initialQuery?: string;
  initialMode?: "replace" | "insert";
  active?: boolean;
}

const QueryTabComponent = ({ tabId, initialQuery, initialMode, active }: QueryTabProps) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [mode, setMode] = useState<"sql" | "chat">("sql");
  const queryInputRef = useRef<QueryInputViewRef>(null);
  const { connection } = useConnection();
  const { text } = useQueryInput(); // Get current text for chat

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

  const lastExecutionRef = useRef<any>(null);

  const handleExecutionStateChange = useCallback((executing: boolean) => {
    setIsExecuting(executing);
  }, []);

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
      const clickHouseUser = connection?.session?.internalUser || connection?.user;
      const context = {
        currentQuery: backgroundSql, // The SQL context "behind" the chat
        database: (connection as any)?.database,
        clickHouseUser,
        lastExecution: lastExecutionRef.current,
      };

      // Send to chat API with session ID
      ChatExecutor.sendChatRequest(textToUse, context, tabId, currentSessionId);

      // Clear the chat input after sending
      queryInputRef.current?.setValue("");
    },
    [text, connection, tabId, currentSessionId]
  );

  const handleRun = useCallback(
    (textToRun: string) => {
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
    },
    [mode, handleChatRequest]
  );

  // Listen for query success to update context
  useEffect(() => {
    const unsubscribe = QueryExecutor.onQuerySuccess((event) => {
      // Update the ref with the latest execution details
      lastExecutionRef.current = event.detail;
    });
    return unsubscribe;
  }, []);

  const handleNewConversation = useCallback(() => {
    const startNewConversation = () => {
      // Create new session with a different color than the previous one
      const newSessionId = generateNewSessionId(currentSessionId);
      setCurrentSessionId(newSessionId);
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
      lastExecutionRef.current = null;
    };

    // Show confirmation if conversation has many messages
    if (chatSessionStats.messageCount > 0) {
      Dialog.confirm({
        title: "Start New Conversation?",
        description: `Current conversation has ${chatSessionStats.messageCount} messages.`,
        dialogButtons: [
          {
            text: "Start New",
            onClick: async () => {
              startNewConversation();
              return true;
            },
            default: true,
          },
          {
            text: "Cancel",
            onClick: async () => true,
            default: false,
          },
        ],
      });
      return;
    }

    startNewConversation();
  }, [chatSessionStats.messageCount, currentSessionId]);

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
      <Panel defaultSize={60} minSize={20} className="bg-background overflow-auto">
        <QueryListView
          tabId={tabId}
          currentSessionId={currentSessionId}
          onExecutionStateChange={handleExecutionStateChange}
          onChatSessionStatsChanged={setChartSessionStats}
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
            placeholder={mode === "chat" ? "Ask AI anything about your data..." : undefined}
            onToggleMode={() => setMode((prev) => (prev === "sql" ? "chat" : "sql"))}
            onRun={handleRun}
          />
        </div>
        <QueryControl
          mode={mode}
          onModeChange={setMode}
          isExecuting={isExecuting}
          onRun={handleRun}
          onNewConversation={handleNewConversation}
          sessionStats={chatSessionStats}
          currentSessionId={currentSessionId}
        />
      </Panel>
    </PanelGroup>
  );
};

export const QueryTab = memo(QueryTabComponent);

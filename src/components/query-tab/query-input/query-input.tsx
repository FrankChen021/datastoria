import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { QueryControl } from "../query-control/query-control";
import { ChatExecutor, type ChatRequestEventDetail } from "../query-execution/chat-executor";
import { ChatInput } from "./chat-input";
import { QueryInputView } from "./query-input-view";

export interface QueryInputProps {
  tabId?: string;
  isExecuting?: boolean;
}

export function QueryInput({ tabId, isExecuting = false }: QueryInputProps) {
  const [isChatMode, setIsChatMode] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [initialChatMessage, setInitialChatMessage] = useState<string | undefined>(undefined);
  const chatRequestRef = useRef<ChatRequestEventDetail | null>(null);

  // Listen for chat request events to switch to chat mode
  useEffect(() => {
    const unsubscribe = ChatExecutor.onChatRequest((event: CustomEvent<ChatRequestEventDetail>) => {
      const { tabId: eventTabId } = event.detail;

      // If tabId is specified, only handle events for this tab
      // If no tabId is specified in event, handle it in all tabs
      if (eventTabId !== undefined && eventTabId !== tabId) {
        return;
      }

      // Generate a new chatId for this chat session
      const chatId = uuid();
      console.log("🔵 QueryInput: Received chat request event:", {
        chatId,
        message: event.detail.message,
        tabId,
      });
      setActiveChatId(chatId);
      setInitialChatMessage(event.detail.message);
      setIsChatMode(true);
      chatRequestRef.current = { ...event.detail };
    });

    return unsubscribe;
  }, [tabId]);

  const handleExitChat = useCallback(() => {
    setIsChatMode(false);
    setActiveChatId(null);
    setInitialChatMessage(undefined);
    chatRequestRef.current = null;
  }, []);

  const handleChatMessageSent = useCallback(() => {
    // Clear initial message after first send
    setInitialChatMessage(undefined);
  }, []);

  const handleSwitchToChat = useCallback(() => {
    // Generate a new chatId for manual switch
    const chatId = uuid();
    setActiveChatId(chatId);
    setInitialChatMessage(undefined);
    setIsChatMode(true);
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Query Control - only show in SQL mode */}
      {!isChatMode && (
        <QueryControl
          isExecuting={isExecuting}
          onSwitchToChat={handleSwitchToChat}
        />
      )}

      {/* Input Area - switch between SQL and Chat */}
      <div className="flex-1 overflow-hidden">
        {isChatMode && activeChatId ? (
          <ChatInput
            chatId={activeChatId}
            initialMessage={initialChatMessage}
            onExitChat={handleExitChat}
            onMessageSent={handleChatMessageSent}
            tabId={tabId}
          />
        ) : (
          <QueryInputView />
        )}
      </div>
    </div>
  );
}


"use client";

import { ChatFactory } from "@/components/chat/chat-factory";
import { ChatUIContext } from "@/components/chat/chat-ui-context";
import { OpenHistoryButton } from "@/components/chat/history/open-history-button";
import { SqlExecutionProvider } from "@/components/chat/sql-execution-context";
import { chatStorage } from "@/components/chat/storage/chat-storage";
import {
  ChatView,
  DEFAULT_CHAT_QUESTIONS,
  type ChatViewHandle,
} from "@/components/chat/view/chat-view";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import { TabManager } from "@/components/tab-manager";
import { Button } from "@/components/ui/button";
import type { AppUIMessage } from "@/lib/ai/common-types";
import type { Chat } from "@ai-sdk/react";
import { Loader2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";

interface ChatTabProps {
  // We can pass initial ID if we opened it from history
  initialChatId?: string;
  // Whether this tab is currently active
  active?: boolean;
  // Initial prompt to send when tab opens
  initialPrompt?: string;
  // Whether to auto-run the initial prompt
  autoRun?: boolean;
  // Tab ID for closing
  tabId?: string;
}

export function ChatTab({ initialChatId, active, initialPrompt, autoRun, tabId }: ChatTabProps) {
  const [chatController, setChatController] = useState<Chat<AppUIMessage> | null>(null);
  const chatViewRef = useRef<ChatViewHandle | null>(null);
  const hasSentInitialPromptRef = useRef(false);
  const { connection } = useConnection();
  const { close, setInitialInput } = useChatPanel();

  // Close chat panel when chat tab becomes active
  useEffect(() => {
    if (active) {
      close();
    }
  }, [active, close]);

  const loadChat = useCallback(async (chatIdToLoad: string): Promise<void> => {
    const chat = await chatStorage.getChat(chatIdToLoad);
    if (chat) {
      TabManager.updateTabTitle(tabId, chat.title);
    }

    const newChatController = await ChatFactory.create({
      // We still use this id if it's not found in the storage because it might be a new chat id
      id: chatIdToLoad,
      connection: connection!,
    });
    setChatController(newChatController);
  }, []);

  // Initial chat loading
  useEffect(() => {
    const initializeChat = async () => {
      let idToLoad = initialChatId;
      if (initialChatId) {
        idToLoad = initialChatId;
      } else {
        // Load the latest chat
        const latestChat = await chatStorage.getLatestChatIdForConnection(connection?.connectionId);
        if (latestChat) {
          idToLoad = latestChat.chatId;
        } else {
          // Create a new one
          idToLoad = uuidv7();
        }
      }
      await loadChat(idToLoad);
    };

    initializeChat();
  }, []);

  const handleNewChat = useCallback(async () => {
    // Check if current chat is empty (no messages)
    if (chatController) {
      const messages = await chatStorage.getMessages(chatController.id);
      const hasMessages = messages.length > 0;

      // If chat is empty, just update the timestamp instead of creating a new chat
      if (!hasMessages) {
        const existingChat = await chatStorage.getChat(chatController.id);
        if (existingChat) {
          await chatStorage.saveChat({
            ...existingChat,
            updatedAt: new Date(),
          });
        }
        return;
      }
    }

    // Create new chat
    const newChatId = uuidv7();
    const newChat = await ChatFactory.create({ id: newChatId, connection: connection! });
    setChatController(newChat);
  }, [chatController, connection]);

  /**
   * When a chat is selected from history, update the chatId
   * This will trigger the main useEffect to load the selected chat
   */
  const handleSelectChat = useCallback((id: string) => {
    loadChat(id);
  }, []);

  const handleClearCurrentChat = useCallback(() => {
    if (chatController) {
      chatController.messages = [];
    }
  }, [chatController]);

  const handleCloseToPanel = useCallback(() => {
    if (chatController && tabId) {
      const currentInput = chatViewRef.current?.getInput() || "";
      setInitialInput(currentInput, chatController.id);
      TabManager.closeTab(tabId);
    }
  }, [chatController, tabId, setInitialInput]);

  // Handle initial prompt: send if autoRun is true, otherwise set in input
  const initialPromptInput = initialPrompt && !autoRun ? initialPrompt : undefined;

  // Send initial prompt when chat is ready and autoRun is true
  useEffect(() => {
    if (chatController && initialPrompt && autoRun && !hasSentInitialPromptRef.current && active) {
      // Wait a bit for chat to be fully initialized
      const timer = setTimeout(() => {
        if (chatViewRef.current) {
          chatViewRef.current.send(initialPrompt);
          hasSentInitialPromptRef.current = true;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [chatController, initialPrompt, autoRun, active]);

  // Listen for title changes and apply to current chat
  useEffect(() => {
    if (!chatController || !tabId) return;

    const handler = (event: CustomEvent<{ title: string }>) => {
      const title = event.detail.title;
      TabManager.updateTabTitle(tabId, title);
    };

    const unsubscribe = ChatUIContext.onTitleChange(handler);
    return unsubscribe;
  }, [chatController, tabId]);

  if (!chatController) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <SqlExecutionProvider value={{ executionMode: "inline" }}>
        {/* Floating History Button and Close to Panel Button */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {tabId && (
            <Button
              variant="outline"
              size="icon"
              className="h-6 w-6 bg-background/50 backdrop-blur-sm hover:bg-background/80 shadow-sm"
              onClick={handleCloseToPanel}
              title="Close tab and open in panel"
            >
              <Minimize2 className="!h-3 !w-3" />
            </Button>
          )}
          <OpenHistoryButton
            currentChatId={chatController.id}
            onNewChat={handleNewChat}
            onSelectChat={handleSelectChat}
            onClearCurrentChat={handleClearCurrentChat}
            variant="outline"
            className="h-6 w-6 bg-background/50 backdrop-blur-sm hover:bg-background/80 shadow-sm"
            iconClassName="!h-3 !w-3"
          />
        </div>

        <ChatView
          ref={chatViewRef}
          chat={chatController}
          // No onClose because Tabs handle their own closing
          onNewChat={handleNewChat}
          questions={DEFAULT_CHAT_QUESTIONS}
          // Pass initial prompt as external input if autoRun is false
          externalInput={initialPromptInput}
          // We can wire up query context later or pull from active tab
        />
      </SqlExecutionProvider>
    </div>
  );
}

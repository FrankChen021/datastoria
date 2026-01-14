"use client";

import { ChatFactory } from "@/components/chat/chat-factory";
import { OpenHistoryButton } from "@/components/chat/history/open-history-button";
import { SqlExecutionProvider } from "@/components/chat/sql-execution-context";
import { chatStorage } from "@/components/chat/storage/chat-storage";
import { ChatView, DEFAULT_CHAT_QUESTIONS, type ChatViewHandle } from "@/components/chat/view/chat-view";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import { TabManager } from "@/components/tab-manager";
import type { AppUIMessage } from "@/lib/ai/common-types";
import type { Chat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
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
  const [chat, setChat] = useState<Chat<AppUIMessage> | null>(null);
  const [chatId, setChatId] = useState<string | undefined>(initialChatId);
  const isCreatingChatRef = useRef(false);
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

  useEffect(() => {
    // If we already have a chat loaded with the correct ID, do nothing
    if (chat && chat.id === chatId) return;

    // Determine which chat ID to load
    const loadSession = async () => {
      const connectionId = connection?.connectionId;
      if (!connectionId) return;

      let idToLoad = chatId;

      // If no explicit ID, try to load latest or create new
      if (!idToLoad) {
        const latestId = await chatStorage.getLatestChatIdForConnection(connectionId);
        if (latestId) {
          idToLoad = latestId;
        } else {
          idToLoad = uuidv7();
        }
        setChatId(idToLoad);
      }

      // Create chat instance
      if (!isCreatingChatRef.current && idToLoad) {
        try {
          const newChat = await ChatFactory.create({ id: idToLoad, databaseId: connectionId });
          setChat(newChat);
        } catch (e) {
          console.error("Failed to load chat", e);
        }
      }
    };
    loadSession();
  }, [connection?.connectionId, chatId, chat]);

  const handleNewChat = useCallback(async () => {
    // Check if current chat is empty (no messages)
    if (chat) {
      const messages = await chatStorage.getMessages(chat.id);
      const hasMessages = messages.length > 0;

      // If chat is empty, just update the timestamp instead of creating a new chat
      if (!hasMessages) {
        const existingChat = await chatStorage.getChat(chat.id);
        if (existingChat) {
          await chatStorage.saveChat({
            ...existingChat,
            updatedAt: new Date(),
          });
        }
        return;
      }
    }

    // Generate new chat ID and create chat immediately to minimize loading state
    const newChatId = uuidv7();
    // Set flag to prevent useEffect from creating duplicate chat
    isCreatingChatRef.current = true;
    // Create new chat first, then update state
    ChatFactory.create({ id: newChatId, databaseId: connection?.connectionId }).then((newChat) => {
      setChatId(newChatId);
      setChat(newChat);
      isCreatingChatRef.current = false;
    });
  }, [chat, connection?.connectionId]);

  const handleSelectChat = useCallback((id: string) => {
    setChatId(id);
    // Reset chat to null to force reload
    setChat(null);
  }, []);

  const handleClearCurrentChat = useCallback(() => {
    if (chat) {
      chat.messages = [];
    }
  }, [chat]);

  const handleCloseToPanel = useCallback(() => {
    if (chat && tabId) {
      const currentInput = chatViewRef.current?.getInput() || "";
      setInitialInput(currentInput, chat.id);
      TabManager.closeTab(tabId);
    }
  }, [chat, tabId, setInitialInput]);

  // Handle initial prompt: send if autoRun is true, otherwise set in input
  const initialPromptInput = initialPrompt && !autoRun ? initialPrompt : undefined;

  // Send initial prompt when chat is ready and autoRun is true
  useEffect(() => {
    if (chat && initialPrompt && autoRun && !hasSentInitialPromptRef.current && active) {
      // Wait a bit for chat to be fully initialized
      const timer = setTimeout(() => {
        if (chatViewRef.current) {
          chatViewRef.current.send(initialPrompt);
          hasSentInitialPromptRef.current = true;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [chat, initialPrompt, autoRun, active]);

  if (!chat) {
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
            currentChatId={chat.id}
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
          chat={chat}
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

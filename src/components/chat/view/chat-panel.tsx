"use client";

import { ChatFactory } from "@/components/chat/chat-factory";
import { chatStorage } from "@/components/chat/storage/chat-storage";
import { useConnection } from "@/components/connection/connection-context";
import { TabManager } from "@/components/tab-manager";
import { Button } from "@/components/ui/button";
import type { Chat } from "@ai-sdk/react";
import { Loader2, Maximize2, X } from "lucide-react";
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { ChatContext } from "../chat-context";
import { OpenHistoryButton } from "../history/open-history-button";
import { SqlExecutionProvider } from "../sql-execution-context";
import { ChatView, type ChatViewHandle } from "./chat-view";
import { useChatPanel } from "./use-chat-panel";

interface ChatHeaderProps {
  onClose?: () => void;
  onNewChat: () => void;
  currentChatId: string;
  onSelectChat?: (id: string) => void;
  onClearCurrentChat?: () => void;
  onMaximize?: () => void;
}

const ChatHeader = React.memo(
  ({
    onClose,
    onNewChat,
    currentChatId,
    onSelectChat,
    onClearCurrentChat,
    onMaximize,
  }: ChatHeaderProps) => {
    return (
      <div className="h-9 border-b flex items-center justify-between px-2 shrink-0 bg-background/50 backdrop-blur-sm z-10">
        <h2 className="text-sm font-semibold"></h2>
        <div className="flex items-center">
          <OpenHistoryButton
            currentChatId={currentChatId}
            onNewChat={onNewChat}
            onSelectChat={onSelectChat}
            onClearCurrentChat={onClearCurrentChat}
          />
          {onMaximize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onMaximize}
              title="Maximize to tab"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              title="Close chat panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }
);

ChatHeader.displayName = "ChatHeader";

interface ChatPanelProps {
  // Optional: Pass in context from your app
  currentQuery?: string;
  currentDatabase?: string;
  availableTables?: Array<{
    name: string;
    columns: string[];
  }>;
  onClose?: () => void;
}

export function ChatPanel({
  currentQuery,
  currentDatabase,
  availableTables,
  onClose,
}: ChatPanelProps) {
  const { pendingCommand, consumeCommand } = useChatPanel();
  const [chat, setChat] = useState<Chat<any> | null>(null);
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const chatViewRef = useRef<ChatViewHandle | null>(null);
  const [isChatViewReady, setIsChatViewReady] = useState(false);
  const previousChatIdRef = useRef<string | null>(null);
  const processedPendingCommandRef = useRef<string | null>(null);
  const { connection } = useConnection();

  // Create a new chat instance
  const createChat = useCallback(async (id: string, connectionId: string) => {
    const newChat = await ChatFactory.create({ id, databaseId: connectionId });
    setChat(newChat);
    chatViewRef.current = null;
    setIsChatViewReady(false);
  }, []);

  // Load or create initial chat session
  useEffect(() => {
    const loadSession = async () => {
      const connectionId = connection?.connectionId;
      if (!connectionId || chatId) return;

      // If there's a pending command when component mounts (panel was closed, now opening)
      // OR if explicitly forcing new chat, create a new chat
      const hasPendingCommand = pendingCommand?.text || pendingCommand?.forceNewChat;
      if (hasPendingCommand) {
        const newChatId = uuidv7();
        previousChatIdRef.current = null;
        setChatId(newChatId);
        await createChat(newChatId, connectionId);
        return;
      }

      // Otherwise, load latest chat or create new one
      const latestId = await chatStorage.getLatestChatIdForConnection(connectionId);
      const idToUse = latestId || uuidv7();
      setChatId(idToUse);
      await createChat(idToUse, connectionId);
    };
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.connectionId, chatId]);

  // Handle pending command when chat already exists (panel was already open)
  useEffect(() => {
    if (!connection?.connectionId || !chat || !pendingCommand?.forceNewChat) return;

    // Skip if we've already processed this pending command
    const commandKey = `${pendingCommand.timestamp}-${pendingCommand.forceNewChat}`;
    if (processedPendingCommandRef.current === commandKey) return;

    // Create new chat
    const newChatId = uuidv7();
    previousChatIdRef.current = chat.id;
    processedPendingCommandRef.current = commandKey;
    setChatId(newChatId);
    createChat(newChatId, connection.connectionId);
  }, [
    pendingCommand?.forceNewChat,
    pendingCommand?.timestamp,
    connection?.connectionId,
    chat,
    createChat,
  ]);

  // Update context builder when props change
  useEffect(() => {
    ChatContext.setBuilder(() => ({
      currentQuery,
      database: currentDatabase,
      tables: availableTables,
      clickHouseUser: connection?.metadata.internalUser,
    }));
  }, [currentQuery, currentDatabase, availableTables, connection]);

  // Handle new chat creation (from user action)
  const handleNewChat = useCallback(async () => {
    if (!connection?.connectionId) return;

    // Check if current chat is empty
    if (chat) {
      const messages = await chatStorage.getMessages(chat.id);
      if (messages.length === 0) {
        // Just update timestamp for empty chat
        const existingChat = await chatStorage.getChat(chat.id);
        if (existingChat) {
          await chatStorage.saveChat({ ...existingChat, updatedAt: new Date() });
        }
        return;
      }
    }

    // Create new chat
    const newChatId = uuidv7();
    previousChatIdRef.current = chat?.id || null;
    setChatId(newChatId);
    await createChat(newChatId, connection.connectionId);
  }, [chat, connection?.connectionId, createChat]);

  // Handle sending pending messages
  useEffect(() => {
    if (!pendingCommand?.text || !isChatViewReady || !chatViewRef.current) return;
    if (!chat) return;

    // For forceNewChat, wait until chat ID has changed
    if (pendingCommand.forceNewChat && chat.id === previousChatIdRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      chatViewRef.current?.send(pendingCommand.text);
      consumeCommand();
      previousChatIdRef.current = null;
      processedPendingCommandRef.current = null;
    }, 100);

    return () => clearTimeout(timer);
  }, [pendingCommand, isChatViewReady, chat, consumeCommand]);

  const handleSelectChat = useCallback((id: string) => {
    setChatId(id);
  }, []);

  const handleClearCurrentChat = useCallback(() => {
    if (chat) {
      chat.messages = [];
    }
  }, [chat]);

  const handleMaximize = useCallback(() => {
    if (chat) {
      TabManager.openChatTab(chat.id);
    }
  }, [chat]);

  if (!chat) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <SqlExecutionProvider value={{ executionMode: "tab" }}>
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <ChatHeader
          onClose={onClose}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          currentChatId={chat.id}
          onClearCurrentChat={handleClearCurrentChat}
          onMaximize={handleMaximize}
        />
        <ChatView
          ref={(ref) => {
            chatViewRef.current = ref;
            setIsChatViewReady(ref !== null);
          }}
          chat={chat}
          onClose={onClose}
          onNewChat={handleNewChat}
          currentQuery={currentQuery}
          currentDatabase={currentDatabase}
          availableTables={availableTables}
        />
      </div>
    </SqlExecutionProvider>
  );
}

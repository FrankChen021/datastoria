"use client";

import { ChatFactory } from "@/components/chat/chat-factory";
import { ChatUIContext } from "@/components/chat/chat-ui-context";
import { chatStorage } from "@/components/chat/storage/chat-storage";
import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AppUIMessage } from "@/lib/ai/chat-types";
import type { Chat } from "@ai-sdk/react";
import { Loader2, Maximize2, Minimize2, Square, X } from "lucide-react";
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { ChatContext } from "../chat-context";
import { OpenHistoryButton } from "../history/open-history-button";
import { SqlExecutionProvider } from "../sql-execution-context";
import { ChatView, DEFAULT_CHAT_QUESTIONS, type ChatViewHandle } from "./chat-view";
import { useChatPanel, type ChatPanelDisplayMode } from "./use-chat-panel";

interface ChatHeaderProps {
  onClose?: () => void;
  onNewChat: () => void;
  currentChatId: string;
  onSelectChat?: (id: string) => void;
  onClearCurrentChat?: () => void;
  toggleDisplayMode?: () => void;
  displayMode?: ChatPanelDisplayMode;
  initialTitle?: string;
  isRunning?: boolean;
}

function getDisplayModeButtonInfo(displayMode: ChatPanelDisplayMode): {
  icon: React.ReactNode;
  tooltip: string;
} {
  switch (displayMode) {
    case "panel":
      return {
        icon: <Maximize2 className="!h-3.5 !w-3.5" />,
        tooltip: "Expand to tab width",
      };
    case "tabWidth":
      return {
        icon: <Square className="!h-3.5 !w-3.5" />,
        tooltip: "Expand to fullscreen",
      };
    case "fullscreen":
      return {
        icon: <Minimize2 className="!h-3.5 !w-3.5" />,
        tooltip: "Restore to panel",
      };
    default:
      return {
        icon: <Maximize2 className="!h-3.5 !w-3.5" />,
        tooltip: "Expand",
      };
  }
}

const ChatHeader = React.memo(
  ({
    onClose,
    onNewChat,
    currentChatId,
    onSelectChat,
    onClearCurrentChat,
    toggleDisplayMode,
    displayMode = "panel",
    initialTitle,
    isRunning,
  }: ChatHeaderProps) => {
    const isMobile = useIsMobile();
    const { icon, tooltip } = getDisplayModeButtonInfo(displayMode);
    const [title, setTitle] = useState<string | undefined>(initialTitle);

    // Reset title when chat ID changes
    useEffect(() => {
      setTitle(initialTitle);
    }, [currentChatId, initialTitle]);

    // Listen for title changes and apply to current chat
    useEffect(() => {
      const handler = (event: CustomEvent<{ title: string }>) => {
        const title = event.detail.title;
        setTitle(title);
      };

      const unsubscribe = ChatUIContext.onTitleChange(handler);
      return unsubscribe;
    }, []);

    return (
      <div className="h-9 border-b flex items-center justify-between px-2 shrink-0 bg-background/50 backdrop-blur-sm z-10">
        <h2 className="text-sm font-semibold">{title || "AI Assistant"}</h2>
        <div className="flex items-center">
          <OpenHistoryButton
            className="h-6 w-6"
            iconClassName="!h-3.5 !w-3.5"
            disabled={isRunning}
            currentChatId={currentChatId}
            onNewChat={onNewChat}
            onSelectChat={onSelectChat}
            onClearCurrentChat={onClearCurrentChat}
          />
          {!isMobile && toggleDisplayMode && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={toggleDisplayMode}
              disabled={isRunning}
              title={tooltip}
            >
              {icon}
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
              disabled={isRunning}
              title="Close chat panel"
            >
              <X className="!h-3.5 !w-3.5" />
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
    columns: Array<{ name: string; type: string }> | string[];
  }>;
  onClose?: () => void;
}

export function ChatPanel({
  currentQuery,
  currentDatabase,
  availableTables,
  onClose,
}: ChatPanelProps) {
  const {
    pendingCommand,
    consumeCommand,
    initialInput,
    clearInitialInput,
    displayMode,
    toggleDisplayMode,
  } = useChatPanel();
  const [chat, setChat] = useState<Chat<AppUIMessage> | null>(null);
  const [chatTitle, setChatTitle] = useState<string | undefined>(undefined);
  const [isRunning, setIsRunning] = useState(false);
  const chatViewRef = useRef<ChatViewHandle | null>(null);
  const [isChatViewReady, setIsChatViewReady] = useState(false);
  const previousChatIdRef = useRef<string | null>(null);
  const processedPendingCommandRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);
  const { connection } = useConnection();

  const loadChat = useCallback(
    async (chatIdToLoad: string): Promise<void> => {
      const chatData = await chatStorage.getChat(chatIdToLoad);
      if (chatData) {
        setChatTitle(chatData.title);
      } else {
        // New chat - set title to "New Chat"
        setChatTitle("New Chat");
      }

      const newChat = await ChatFactory.create({
        // We still use this id if it's not found in the storage because it might be a new chat id
        id: chatIdToLoad,
        connection: connection!,
      });
      setChat(newChat);
      chatViewRef.current = null;
      setIsChatViewReady(false);
    },
    [connection]
  );

  // Initial chat loading - only run once when chat is null
  useEffect(() => {
    // Skip if already initialized or chat already exists
    if (isInitializedRef.current || chat) return;

    const initializeChat = async () => {
      const connectionId = connection?.connectionId;
      if (!connectionId) return;

      // Capture pendingCommand at initialization time to avoid re-running when it changes
      const currentPendingCommand = pendingCommand;
      let idToLoad: string | undefined;

      // Check if initialInput has a specific chatId
      if (initialInput?.chatId) {
        idToLoad = initialInput.chatId;
      } else if (currentPendingCommand?.forceNewChat) {
        // If explicitly forcing new chat, create a new chat
        idToLoad = uuidv7();
        previousChatIdRef.current = null;
        setChatTitle("New Chat");
        // Mark this command as processed to prevent duplicate handling
        const commandKey = `${currentPendingCommand.timestamp}-${currentPendingCommand.forceNewChat}`;
        processedPendingCommandRef.current = commandKey;
      } else if (currentPendingCommand?.text) {
        // If there's a pending command (but not forcing new chat), still need to load a chat
        // Load the latest chat or create new one
        const latestChat = await chatStorage.getLatestChatIdForConnection(connectionId);
        if (latestChat) {
          idToLoad = latestChat.chatId;
        } else {
          idToLoad = uuidv7();
        }
      } else {
        // Load the latest chat
        const latestChat = await chatStorage.getLatestChatIdForConnection(connectionId);
        if (latestChat) {
          idToLoad = latestChat.chatId;
        } else {
          // Create a new one
          idToLoad = uuidv7();
          setChatTitle("New Chat");
        }
      }

      if (idToLoad) {
        await loadChat(idToLoad);
        isInitializedRef.current = true;
      }
    };

    initializeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.connectionId, initialInput?.chatId, chat, loadChat]);

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
    setChatTitle("New Chat");
    loadChat(newChatId);
  }, [pendingCommand?.forceNewChat, pendingCommand?.timestamp, connection, chat, loadChat]);

  // Update context builder when props change
  useEffect(() => {
    ChatContext.setBuilder(() => ({
      currentQuery,
      database: currentDatabase,
      tables: availableTables,
      clickHouseUser: connection?.metadata.internalUser,
    }));
  }, [currentQuery, currentDatabase, availableTables, connection]);

  // Clear initialInput after it's been used
  useEffect(() => {
    if (initialInput && chat && (!initialInput.chatId || initialInput.chatId === chat.id)) {
      // Clear after a short delay to ensure ChatView has processed it
      const timer = setTimeout(() => {
        clearInitialInput();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialInput, chat, clearInitialInput]);

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
    setChatTitle("New Chat");
    await loadChat(newChatId);
  }, [chat, connection?.connectionId, loadChat]);

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

  const handleSelectChat = useCallback(
    (id: string) => {
      loadChat(id);
    },
    [loadChat]
  );

  const handleClearCurrentChat = useCallback(() => {
    if (chat) {
      chat.messages = [];
    }
  }, [chat]);

  const handleToggleDisplayMode = useCallback(() => {
    toggleDisplayMode();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chatViewRef.current?.focus();
      });
    });
  }, [toggleDisplayMode]);

  if (!chat) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <SqlExecutionProvider value={{ executionMode: "inline" }}>
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <ChatHeader
          onClose={onClose}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          currentChatId={chat.id}
          onClearCurrentChat={handleClearCurrentChat}
          toggleDisplayMode={handleToggleDisplayMode}
          displayMode={displayMode}
          initialTitle={chatTitle}
          isRunning={isRunning}
        />
        <ChatView
          ref={(ref) => {
            chatViewRef.current = ref;
            setIsChatViewReady(ref !== null);
          }}
          chat={chat}
          onClose={onClose}
          onNewChat={handleNewChat}
          questions={DEFAULT_CHAT_QUESTIONS}
          currentQuery={currentQuery}
          currentDatabase={currentDatabase}
          availableTables={availableTables}
          externalInput={
            initialInput && (!initialInput.chatId || initialInput.chatId === chat.id)
              ? initialInput.text
              : undefined
          }
          onStreamingChange={setIsRunning}
        />
      </div>
    </SqlExecutionProvider>
  );
}

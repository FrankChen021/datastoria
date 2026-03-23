"use client";

import { ChatContext, getDatabaseContextFromConnection } from "@/components/chat/chat-context";
import { ChatFactory } from "@/components/chat/chat-factory";
import { ChatUIContext } from "@/components/chat/chat-ui-context";
import { SessionManager } from "@/components/chat/session/session-manager";
import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AppUIMessage, Message } from "@/lib/ai/chat-types";
import type { Chat } from "@ai-sdk/react";
import { Download, Loader2, Maximize2, Minimize2, Plus, Square, X } from "lucide-react";
import { useSession } from "next-auth/react";
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { OpenSessionListButton } from "../session/open-session-list-button";
import { SqlExecutionProvider } from "../sql-execution-context";
import { ChatView, DEFAULT_CHAT_QUESTIONS, type ChatViewHandle } from "./chat-view";
import { useChatPanel, type ChatPanelDisplayMode } from "./use-chat-panel";

interface ChatHeaderProps {
  onClose?: () => void;
  onNewChat: () => void;
  onExport?: () => void;
  currentChatId: string;
  onSelectChat?: (id: string) => void;
  toggleDisplayMode?: () => void;
  displayMode?: ChatPanelDisplayMode;
  initialTitle?: string;
  isRunning?: boolean;
}

type LoadChatOptions = {
  isNewSession?: boolean;
};

function sanitizeFileName(input: string): string {
  return Array.from(input)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code <= 0x1f || '<>:"/\\|?*'.includes(char)) {
        return "_";
      }
      return char;
    })
    .join("")
    .trim();
}

function collectExportText(message: Pick<Message, "parts">): string {
  return message.parts
    .filter(
      (
        part
      ): part is {
        type: "text";
        text: string;
      } => part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function buildSessionMarkdown(title: string, messages: Message[], userLabel: string): string {
  const lines: string[] = [new Date().toLocaleString(), title, ""];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    const content = collectExportText(message);
    if (!content) {
      continue;
    }

    lines.push(message.role === "user" ? `# ${userLabel}` : "# Assistant");
    lines.push(content);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function toAppUiMessage(message: Message): AppUIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    metadata: message.metadata,
  } as AppUIMessage;
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
    onExport,
    currentChatId,
    onSelectChat,
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
      <div className="h-9 border-b flex items-center justify-between px-2 shrink-0 bg-background z-10">
        <h2 className="text-sm font-semibold">{title || "Work with AI"}</h2>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNewChat}
            disabled={isRunning}
            title="New Session"
          >
            <Plus className="!h-3.5 !w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onExport}
            disabled={isRunning}
            title="Export session as Markdown"
          >
            <Download className="!h-3.5 !w-3.5" />
          </Button>
          {isMobile && (
            <OpenSessionListButton
              className="h-6 w-6"
              iconClassName="!h-3.5 !w-3.5"
              disabled={isRunning}
              currentChatId={currentChatId}
              onNewChat={onNewChat}
              onSelectChat={onSelectChat}
            />
          )}
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
    currentChatId,
    setCurrentChatId,
    selectedChatId,
    clearSelectedChatId,
    newChatRequestNonce,
    toggleDisplayMode,
  } = useChatPanel();
  const [chat, setChat] = useState<Chat<AppUIMessage> | null>(null);
  const [chatTitle, setChatTitle] = useState<string | undefined>(undefined);
  const [isRunning, setIsRunning] = useState(false);
  const chatViewRef = useRef<ChatViewHandle | null>(null);
  const [isChatViewReady, setIsChatViewReady] = useState(false);
  const previousChatIdRef = useRef<string | null>(null);
  const processedPendingCommandRef = useRef<string | null>(null);
  const processedNewChatRequestRef = useRef(newChatRequestNonce);
  const trackedRunningChatIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);
  const { connection } = useConnection();
  const { data: authSession } = useSession();

  const createDraftSession = useCallback(
    () => ({
      id: uuidv7(),
      title: "New Chat",
    }),
    []
  );

  const loadChat = useCallback(
    async (chatIdToLoad: string, options?: LoadChatOptions): Promise<void> => {
      const chatData =
        options?.isNewSession === true ? null : await SessionManager.getSession(chatIdToLoad);
      const initialMessages = chatData
        ? ((await SessionManager.getMessages(chatIdToLoad)).map(toAppUiMessage) as AppUIMessage[])
        : [];
      setChatTitle(chatData?.title ?? "New Chat");

      const newChat = await ChatFactory.create({
        sessionId: chatIdToLoad,
        connection: connection!,
        initialMessages,
      });
      setChat(newChat);
      chatViewRef.current = null;
      setIsChatViewReady(false);
    },
    [connection]
  );

  const loadDraftChat = useCallback(async (): Promise<void> => {
    const draftSession = createDraftSession();
    await loadChat(draftSession.id, { isNewSession: true });
  }, [createDraftSession, loadChat]);

  const createFreshChat = useCallback(async () => {
    if (!connection?.connectionId) return;

    previousChatIdRef.current = chat?.id || null;
    await loadDraftChat();
  }, [chat?.id, connection?.connectionId, loadDraftChat]);

  // Initial chat loading - only run once when chat is null
  useEffect(() => {
    // Skip if already initialized or chat already exists
    if (isInitializedRef.current || chat) return;

    const initializeChat = async () => {
      const connectionId = connection?.connectionId;
      if (!connectionId) return;

      // Capture pendingCommand at initialization time to avoid re-running when it changes
      const currentPendingCommand = pendingCommand;
      let loadTarget:
        | {
            id: string;
            isNewSession: boolean;
          }
        | undefined;

      // Explicit session selection should win when opening a hidden panel.
      if (selectedChatId) {
        loadTarget = { id: selectedChatId, isNewSession: false };
      } else if (initialInput?.chatId) {
        // Check if initialInput has a specific chatId
        loadTarget = { id: initialInput.chatId, isNewSession: false };
      } else if (currentPendingCommand?.forceNewChat) {
        loadTarget = { id: createDraftSession().id, isNewSession: true };
        previousChatIdRef.current = null;
        // Mark this command as processed to prevent duplicate handling
        const commandKey = `${currentPendingCommand.timestamp}-${currentPendingCommand.forceNewChat}`;
        processedPendingCommandRef.current = commandKey;
      } else if (currentPendingCommand?.text) {
        // If there's a pending command (but not forcing new chat), create a fresh session.
        loadTarget = { id: createDraftSession().id, isNewSession: true };
      } else {
        // Default to a fresh session when opening chat without an existing selection.
        loadTarget = { id: createDraftSession().id, isNewSession: true };
      }

      if (loadTarget) {
        await loadChat(loadTarget.id, { isNewSession: loadTarget.isNewSession });
        if (selectedChatId === loadTarget.id) {
          clearSelectedChatId();
        }
        isInitializedRef.current = true;
      }
    };

    initializeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connection?.connectionId,
    createDraftSession,
    initialInput?.chatId,
    chat,
    loadChat,
    selectedChatId,
    clearSelectedChatId,
  ]);

  // Handle pending command when chat already exists (panel was already open)
  useEffect(() => {
    if (!connection?.connectionId || !chat || !pendingCommand?.forceNewChat) return;

    // Skip if we've already processed this pending command
    const commandKey = `${pendingCommand.timestamp}-${pendingCommand.forceNewChat}`;
    if (processedPendingCommandRef.current === commandKey) return;

    void (async () => {
      const chatId = createDraftSession().id;
      previousChatIdRef.current = chat.id;
      processedPendingCommandRef.current = commandKey;
      await loadChat(chatId, { isNewSession: true });
    })();
  }, [
    pendingCommand?.forceNewChat,
    pendingCommand?.timestamp,
    connection,
    chat,
    createDraftSession,
    loadChat,
  ]);

  useEffect(() => {
    if (!chat || !selectedChatId || selectedChatId === chat.id) return;

    void loadChat(selectedChatId);
    clearSelectedChatId();
  }, [chat, selectedChatId, loadChat, clearSelectedChatId]);

  // Update context builder when props change
  useEffect(() => {
    ChatContext.setBuilder(() => ({
      database: currentDatabase,
      tables: availableTables,
      ...getDatabaseContextFromConnection(connection),
    }));
  }, [currentDatabase, availableTables, connection]);

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

    await createFreshChat();
  }, [connection?.connectionId, createFreshChat]);

  const handleExportSession = useCallback(async () => {
    if (!chat?.id) {
      return;
    }

    const storedSession = await SessionManager.getSession(chat.id);
    const storedMessages = await SessionManager.getMessages(chat.id);
    const title =
      (storedSession?.title?.trim() || chatTitle?.trim() || "New Chat").trim() || "New Chat";
    const userLabel = authSession?.user?.email?.trim() || "You";
    const markdown = buildSessionMarkdown(title, storedMessages, userLabel);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const timestamp = (storedSession?.createdAt ?? new Date()).toISOString().replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = `${timestamp}-${sanitizeFileName(title) || "chat-session"}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [authSession?.user?.email, chat?.id, chatTitle]);

  useEffect(() => {
    if (!chat?.id) {
      return;
    }

    const unsubscribe = ChatUIContext.onTitleChange((event) => {
      const nextTitle = event.detail.title?.trim();
      if (!nextTitle) {
        return;
      }

      // Title change events are global and not chat-scoped, so avoid persisting here.
      // Persistence remains in chat-scoped flows (for example onFinish/session rename).
      setChatTitle(nextTitle);
    });

    return unsubscribe;
  }, [chat?.id]);

  useEffect(() => {
    if (!chat || newChatRequestNonce === processedNewChatRequestRef.current) return;

    processedNewChatRequestRef.current = newChatRequestNonce;
    void createFreshChat();
  }, [chat, createFreshChat, newChatRequestNonce]);

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

  useEffect(() => {
    if (!chat) return;

    setCurrentChatId(chat.id);

    return () => {
      if (currentChatId === chat.id) {
        setCurrentChatId(null);
      }
    };
  }, [chat, currentChatId, setCurrentChatId]);

  useEffect(() => {
    if (!connection?.connectionId) {
      return;
    }

    const trackedChatId = trackedRunningChatIdRef.current;
    if (trackedChatId && trackedChatId !== chat?.id) {
      SessionManager.markRunning(connection.connectionId, trackedChatId, false);
    }

    if (!chat?.id) {
      trackedRunningChatIdRef.current = null;
      return;
    }

    trackedRunningChatIdRef.current = chat.id;
    SessionManager.markRunning(connection.connectionId, chat.id, isRunning);
  }, [chat?.id, connection?.connectionId, isRunning]);

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
          onExport={handleExportSession}
          onSelectChat={handleSelectChat}
          currentChatId={chat.id}
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

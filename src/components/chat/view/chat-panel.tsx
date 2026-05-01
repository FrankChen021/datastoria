"use client";

import { ChatContext, getDatabaseContextFromConnection } from "@/components/chat/chat-context";
import { ChatFactory } from "@/components/chat/chat-factory";
import { ChatUIContext } from "@/components/chat/chat-ui-context";
import {
  getSessionRepositoryConnectionId,
  isNoConnectionSessionConnectionId,
} from "@/components/chat/session/session-connection-id";
import { SessionManager } from "@/components/chat/session/session-manager";
import { useConnection } from "@/components/connection/connection-context";
import { getRuntimeConfig } from "@/components/runtime-config-provider";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AppUIMessage, Message } from "@/lib/ai/ai-types";
import { BasePath } from "@/lib/base-path";
import type { Connection } from "@/lib/connection/connection";
import { toastManager } from "@/lib/toast";
import type { Chat } from "@ai-sdk/react";
import { Download, Loader2, Maximize2, Minimize2, Plus, Share2, Square, X } from "lucide-react";
import { useSession } from "next-auth/react";
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { OpenSessionListButton } from "../session/open-session-list-button";
import { SqlExecutionProvider } from "../sql-execution-context";
import { ChatView, type ChatViewHandle } from "./chat-view";
import { useChatPanel, type ChatPanelDisplayMode } from "./use-chat-panel";

interface ChatHeaderProps {
  onClose?: () => void;
  onNewChat: () => void;
  onExport?: () => void;
  onShare?: () => void;
  currentChatId: string;
  onSelectChat?: (id: string, connectionId?: string) => void;
  toggleDisplayMode?: () => void;
  displayMode?: ChatPanelDisplayMode;
  initialTitle?: string;
  isRunning?: boolean;
  isSharing?: boolean;
  canShare?: boolean;
}

type LoadChatOptions = {
  isNewSession?: boolean;
  agentContext?: Partial<import("@/lib/ai/ai-types").AgentContext>;
  connectionOverride?: Connection | null;
  connectionId?: string;
  shareCode?: string;
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
    onShare,
    currentChatId,
    onSelectChat,
    toggleDisplayMode,
    displayMode = "panel",
    initialTitle,
    isRunning,
    isSharing,
    canShare,
  }: ChatHeaderProps) => {
    const isMobile = useIsMobile();
    const { icon, tooltip } = getDisplayModeButtonInfo(displayMode);
    const [title, setTitle] = useState<string | undefined>(initialTitle);
    const isShareUnavailable = !canShare;
    const shareTitle = isShareUnavailable
      ? getRuntimeConfig().sessionRepositoryType === "remote"
        ? "Sharing is unavailable for this session"
        : "Sharing is not supported because this deployment stores chat sessions in your browser."
      : "Copy share link";

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
      <div className="h-9 border-b flex items-center gap-2 px-2 shrink-0 bg-background z-10">
        <h2
          className="min-w-0 flex-1 truncate text-sm font-semibold"
          title={title || "Work with AI"}
        >
          {title || "Work with AI"}
        </h2>
        <div className="flex items-center shrink-0">
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
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${isShareUnavailable ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}`}
            onClick={isShareUnavailable ? undefined : onShare}
            disabled={canShare && (isRunning || isSharing)}
            aria-disabled={isShareUnavailable || isRunning || isSharing}
            title={shareTitle}
          >
            {isSharing ? (
              <Loader2 className="!h-3.5 !w-3.5 animate-spin" />
            ) : (
              <Share2 className="!h-3.5 !w-3.5" />
            )}
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
  currentDatabase?: string;
  onClose?: () => void;
}

export function ChatPanel({ currentDatabase, onClose }: ChatPanelProps) {
  const {
    pendingCommand,
    consumeCommand,
    initialInput,
    clearInitialInput,
    displayMode,
    currentChatId,
    setCurrentChatId,
    selectedChat,
    clearSelectedChat,
    getSessionShareCode,
    newChatRequestNonce,
    toggleDisplayMode,
    selectChat,
  } = useChatPanel();
  const [chat, setChat] = useState<Chat<AppUIMessage> | null>(null);
  const [chatTitle, setChatTitle] = useState<string | undefined>(undefined);
  const [isRunning, setIsRunning] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const chatViewRef = useRef<ChatViewHandle | null>(null);
  const [isChatViewReady, setIsChatViewReady] = useState(false);
  const previousChatIdRef = useRef<string | null>(null);
  const processedPendingCommandRef = useRef<string | null>(null);
  const processedNewChatRequestRef = useRef(newChatRequestNonce);
  const trackedRunningChatRef = useRef<{ chatId: string; connectionId: string } | null>(null);
  const isInitializedRef = useRef(false);
  const { connection, isInitialized: isConnectionInitialized } = useConnection();
  const chatConnectionId = getSessionRepositoryConnectionId(connection);
  const [loadedChatConnectionId, setLoadedChatConnectionId] = useState(chatConnectionId);
  const [loadedChatIsDraft, setLoadedChatIsDraft] = useState(false);
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
      const shareCode = options?.shareCode ?? getSessionShareCode(chatIdToLoad);
      const chatData =
        options?.isNewSession === true
          ? null
          : await SessionManager.getSession(chatIdToLoad, { shareCode });
      const initialMessages = chatData
        ? ((await SessionManager.getMessages(chatIdToLoad, { shareCode })).map(
            toAppUiMessage
          ) as AppUIMessage[])
        : [];
      setChatTitle(chatData?.title ?? "New Chat");
      const isSharedSession = Boolean(shareCode);
      const targetConnection = isSharedSession
        ? null
        : options && "connectionOverride" in options
          ? options.connectionOverride
          : connection;
      const targetConnectionId =
        options?.connectionId ??
        chatData?.databaseId ??
        getSessionRepositoryConnectionId(targetConnection);
      setLoadedChatConnectionId(targetConnectionId);
      setLoadedChatIsDraft(options?.isNewSession === true);

      const newChat = await ChatFactory.create({
        sessionId: chatIdToLoad,
        connection: targetConnection,
        connectionId: targetConnectionId,
        context: targetConnection ? undefined : {},
        initialMessages,
        agentContext: options?.agentContext,
        shareCode,
      });
      setChat(newChat);
      chatViewRef.current = null;
      setIsChatViewReady(false);
    },
    [connection, getSessionShareCode]
  );

  const loadDraftChat = useCallback(async (): Promise<void> => {
    const draftSession = createDraftSession();
    await loadChat(draftSession.id, { isNewSession: true });
  }, [createDraftSession, loadChat]);

  const createFreshChat = useCallback(async () => {
    previousChatIdRef.current = chat?.id || null;
    await loadDraftChat();
  }, [chat?.id, loadDraftChat]);

  // Initial chat loading - only run once when chat is null
  useEffect(() => {
    // Skip if already initialized or chat already exists
    if (!isConnectionInitialized || isInitializedRef.current || chat) return;

    const initializeChat = async () => {
      // Capture pendingCommand at initialization time to avoid re-running when it changes
      const currentPendingCommand = pendingCommand;
      let loadTarget:
        | {
            id: string;
            isNewSession: boolean;
            agentContext?: Partial<import("@/lib/ai/ai-types").AgentContext>;
          }
        | undefined;

      // Explicit session selection should win when opening a hidden panel.
      if (
        selectedChat?.connectionId &&
        !selectedChat.shareCode &&
        !isNoConnectionSessionConnectionId(selectedChat.connectionId) &&
        !connection?.matchesSessionConnectionId(selectedChat.connectionId)
      ) {
        return;
      } else if (selectedChat) {
        loadTarget = { id: selectedChat.chatId, isNewSession: false };
      } else if (initialInput?.chatId) {
        // Check if initialInput has a specific chatId
        loadTarget = { id: initialInput.chatId, isNewSession: false };
      } else if (currentPendingCommand?.forceNewChat) {
        loadTarget = {
          id: createDraftSession().id,
          isNewSession: true,
          agentContext: currentPendingCommand.agentContext,
        };
        previousChatIdRef.current = null;
        // Mark this command as processed to prevent duplicate handling
        const commandKey = `${currentPendingCommand.timestamp}-${currentPendingCommand.forceNewChat}`;
        processedPendingCommandRef.current = commandKey;
      } else if (currentPendingCommand?.text) {
        // If there's a pending command (but not forcing new chat), create a fresh session.
        loadTarget = {
          id: createDraftSession().id,
          isNewSession: true,
          agentContext: currentPendingCommand.agentContext,
        };
      } else {
        // Default to a fresh session when opening chat without an existing selection.
        loadTarget = { id: createDraftSession().id, isNewSession: true };
      }

      if (loadTarget) {
        await loadChat(loadTarget.id, {
          isNewSession: loadTarget.isNewSession,
          agentContext: loadTarget.agentContext,
          connectionOverride:
            selectedChat?.connectionId &&
            isNoConnectionSessionConnectionId(selectedChat.connectionId)
              ? null
              : undefined,
          connectionId: selectedChat?.connectionId,
          shareCode: selectedChat?.shareCode,
        });
        if (selectedChat?.chatId === loadTarget.id) {
          clearSelectedChat();
        }
        isInitializedRef.current = true;
      }
    };

    initializeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connection?.connectionId,
    isConnectionInitialized,
    chatConnectionId,
    createDraftSession,
    initialInput?.chatId,
    chat,
    loadChat,
    selectedChat,
    clearSelectedChat,
  ]);

  // Handle pending command when chat already exists (panel was already open)
  useEffect(() => {
    if (!chat || !pendingCommand?.forceNewChat) return;

    // Skip if we've already processed this pending command
    const commandKey = `${pendingCommand.timestamp}-${pendingCommand.forceNewChat}`;
    if (processedPendingCommandRef.current === commandKey) return;

    void (async () => {
      const chatId = createDraftSession().id;
      previousChatIdRef.current = chat.id;
      processedPendingCommandRef.current = commandKey;
      await loadChat(chatId, {
        isNewSession: true,
        agentContext: pendingCommand.agentContext,
      });
    })();
  }, [
    pendingCommand?.agentContext,
    pendingCommand?.forceNewChat,
    pendingCommand?.timestamp,
    chat,
    createDraftSession,
    loadChat,
  ]);

  useEffect(() => {
    if (!chat || !selectedChat) return;
    if (selectedChat.chatId === chat.id) return;
    if (
      selectedChat.connectionId &&
      !selectedChat.shareCode &&
      !isNoConnectionSessionConnectionId(selectedChat.connectionId) &&
      !connection?.matchesSessionConnectionId(selectedChat.connectionId)
    ) {
      return;
    }

    void loadChat(selectedChat.chatId, {
      connectionOverride: isNoConnectionSessionConnectionId(selectedChat.connectionId)
        ? null
        : undefined,
      connectionId: selectedChat.connectionId,
      shareCode: selectedChat.shareCode,
    });
    clearSelectedChat();
  }, [chat, clearSelectedChat, connection, loadChat, selectedChat]);

  useEffect(() => {
    if (
      !chat ||
      !loadedChatIsDraft ||
      isRunning ||
      chat.messages.length > 0 ||
      !isNoConnectionSessionConnectionId(loadedChatConnectionId) ||
      isNoConnectionSessionConnectionId(chatConnectionId)
    ) {
      return;
    }

    void loadChat(chat.id, { isNewSession: true });
  }, [chat, chatConnectionId, isRunning, loadedChatConnectionId, loadedChatIsDraft, loadChat]);

  // Update context builder when props change
  useEffect(() => {
    ChatContext.setBuilder(() => ({
      database: currentDatabase,
      ...getDatabaseContextFromConnection(connection),
    }));
  }, [currentDatabase, connection]);

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
    await createFreshChat();
  }, [createFreshChat]);

  const handleExportSession = useCallback(async () => {
    if (!chat?.id) {
      return;
    }

    const shareCode = getSessionShareCode(chat.id);
    const storedSession = await SessionManager.getSession(chat.id, { shareCode });
    const storedMessages = await SessionManager.getMessages(chat.id, { shareCode });
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
  }, [authSession?.user?.email, chat?.id, chatTitle, getSessionShareCode]);

  const handleShareSession = useCallback(async () => {
    if (!chat?.id || isSharing) {
      return;
    }

    setIsSharing(true);
    try {
      const response = await fetch(
        BasePath.getURL(`/api/ai/sessions/${encodeURIComponent(chat.id)}/share`),
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create share link: ${response.status}`);
      }

      const data = (await response.json()) as { url?: unknown };
      if (typeof data.url !== "string" || data.url.length === 0) {
        throw new Error("Share API returned an invalid URL");
      }

      const shareUrl = new URL(data.url, window.location.origin).toString();
      await navigator.clipboard.writeText(shareUrl);
      toastManager.show("Share link copied to clipboard", "success");
    } catch (error) {
      console.error("Failed to share session", error);
      toastManager.show("Failed to create share link", "error");
    } finally {
      setIsSharing(false);
    }
  }, [chat?.id, isSharing]);

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
    (id: string, targetConnectionId?: string, shareCode?: string) => {
      selectChat(id, targetConnectionId ?? chatConnectionId, shareCode);
    },
    [chatConnectionId, selectChat]
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
    const trackedChat = trackedRunningChatRef.current;
    if (
      trackedChat &&
      (trackedChat.chatId !== chat?.id || trackedChat.connectionId !== loadedChatConnectionId)
    ) {
      SessionManager.markRunning(trackedChat.connectionId, trackedChat.chatId, false);
    }

    if (!chat?.id) {
      trackedRunningChatRef.current = null;
      return;
    }

    trackedRunningChatRef.current = { chatId: chat.id, connectionId: loadedChatConnectionId };
    SessionManager.markRunning(loadedChatConnectionId, chat.id, isRunning);
  }, [chat?.id, loadedChatConnectionId, isRunning]);

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

  const canShare =
    getRuntimeConfig().sessionRepositoryType === "remote" &&
    !loadedChatIsDraft &&
    !getSessionShareCode(chat.id);

  return (
    <SqlExecutionProvider value={{ executionMode: "inline" }}>
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <ChatHeader
          onClose={onClose}
          onNewChat={handleNewChat}
          onExport={handleExportSession}
          onShare={handleShareSession}
          onSelectChat={handleSelectChat}
          currentChatId={chat.id}
          toggleDisplayMode={handleToggleDisplayMode}
          displayMode={displayMode}
          initialTitle={chatTitle}
          isRunning={isRunning}
          isSharing={isSharing}
          canShare={canShare}
        />
        <ChatView
          ref={(ref) => {
            chatViewRef.current = ref;
            setIsChatViewReady(ref !== null);
          }}
          chat={chat}
          onClose={onClose}
          onNewChat={handleNewChat}
          currentDatabase={currentDatabase}
          externalInput={
            initialInput && (!initialInput.chatId || initialInput.chatId === chat.id)
              ? initialInput
              : undefined
          }
          onStreamingChange={setIsRunning}
        />
      </div>
    </SqlExecutionProvider>
  );
}

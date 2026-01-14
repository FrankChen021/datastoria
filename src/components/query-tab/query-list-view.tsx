import { ChatContext, type DatabaseContext } from "@/components/chat/chat-context";
import { ChatFactory } from "@/components/chat/chat-factory";
import { useConnection } from "@/components/connection/connection-context";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { AppUIMessage, TokenUsage } from "@/lib/ai/common-types";
import { toastManager } from "@/lib/toast";
import { useChat, type Chat } from "@ai-sdk/react";
import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v7 as uuid } from "uuid";
import { ChatMessageView } from "../chat/message/chat-message-view";
import type { ChatMessage } from "../chat/message/chat-messages";
import { ChatExecutor } from "./query-execution/chat-executor";
import { useQueryExecutor } from "./query-execution/query-executor";
import { QueryListItemView } from "./query-list-item-view";
import type { SQLMessage } from "./query-view-model";

export interface ChatSessionStats {
  messageCount: number;
  tokens: TokenUsage;
  startTime?: Date;
}

export interface QueryListViewProps {
  tabId?: string; // Optional tab ID for multi-tab support
  currentSessionId?: string; // Current session ID for chat messages
  onExecutionStateChange?: (isChatExecuting: boolean) => void;
  onChatSessionStatsChanged?: (stats: ChatSessionStats) => void; // Callback to update parent with session stats
  onNewSession?: () => void; // Callback to generate a new session when clearing screen
}

export type Message = SQLMessage | ChatMessage;

function QueryListViewContent({
  tabId,
  currentSessionId,
  onExecutionStateChange,
  onChatSessionStatsChanged,
  onNewSession,
  chatInstance,
  messageIdToSessionIdRef,
}: QueryListViewProps & {
  chatInstance: Chat<AppUIMessage>;
  messageIdToSessionIdRef: React.MutableRefObject<Map<string, string>>;
}) {
  const { connection } = useConnection();
  const {
    sqlMessages,
    isSqlExecuting,
    deleteQuery,
    deleteAllQueries: clearAllQueries,
  } = useQueryExecutor();

  const responseScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPlaceholderRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);
  const prevSqlMessagesCountRef = useRef(sqlMessages.length);
  const messageTimestampsRef = useRef<Map<string, number>>(new Map());
  // Map to store sessionId for messages by their content and timestamp
  // Key: message content, Value: { sessionId, timestamp }
  const pendingSessionIdsRef = useRef<Map<string, { sessionId: string; timestamp: number }>>(
    new Map()
  );
  // Map to store errors by message ID
  // Key: message ID, Value: Error
  const messageErrorsRef = useRef<Map<string, Error>>(new Map());
  // Note: messageIdToSessionIdRef is passed as a prop from parent component

  // Use hook with the instance
  const {
    messages: rawMessages,
    sendMessage,
    status,
    error: chatError,
  } = useChat({
    chat: chatInstance,
    onError: (error: Error) => {
      console.error("Chat error:", error);
      toastManager.show("Chat failed: " + error.message, "error");
    },
  });

  // Watch for error changes from useChat and store them in the ref for persistence
  useEffect(() => {
    if (chatError) {
      // Find the last assistant message that was being streamed (the one that errored)
      // Use chatInstance.messages directly to get the latest state
      const currentMessages = chatInstance.messages;
      if (currentMessages && currentMessages.length > 0) {
        // Find the last assistant message
        for (let i = currentMessages.length - 1; i >= 0; i--) {
          const msg = currentMessages[i];
          if (msg.role === "assistant") {
            // Store the error with this message ID for persistence
            messageErrorsRef.current.set(msg.id, chatError);
            break;
          }
        }
      }
    }
  }, [chatError, chatInstance]);

  // Track executing state for Chat
  const isChatExecuting = status === "streaming" || status === "submitted";

  // Notify parent about chat execution state changes
  useEffect(() => {
    if (onExecutionStateChange) {
      onExecutionStateChange(isChatExecuting);
    }
  }, [isChatExecuting, onExecutionStateChange]);

  const scrollToBottom = useCallback((instant = false) => {
    if (scrollPlaceholderRef.current && responseScrollContainerRef.current) {
      // If instant, set scrollTop directly
      if (instant) {
        responseScrollContainerRef.current.scrollTop =
          responseScrollContainerRef.current.scrollHeight;
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollPlaceholderRef.current) {
            scrollPlaceholderRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
          }
        });
      });
    }
  }, []);

  // Merge lists efficiently
  const mergedMessageList = useMemo(() => {
    if (!rawMessages) return sqlMessages;

    const getRecord = (value: unknown): Record<string, unknown> | null =>
      typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

    const getOptionalField = (value: unknown, key: string): unknown => {
      const rec = getRecord(value);
      return rec ? rec[key] : undefined;
    };

    const getOptionalStringField = (value: unknown, key: string): string | undefined => {
      const v = getOptionalField(value, key);
      return typeof v === "string" ? v : undefined;
    };

    const chatMessages: ChatMessage[] = (rawMessages as AppUIMessage[])
      .filter((m) => {
        const type = getOptionalStringField(m, "type");
        const exclude = type === "step-start" || type === "step-finish";
        // Filter internal messages if needed, matching chat-list-item-view logic
        // For now, allow all, or filter raw text parts
        return !exclude;
      })
      .map((m) => {
        // Stable timestamp logic:
        // 1. If message has createdAt, use it.
        // 2. If not, check if we already assigned a timestamp in our ref map.
        // 3. If not, assign Date.now() and store it.
        let ts: number;
        if (m.metadata?.createdAt instanceof Date) {
          ts = m.metadata.createdAt.getTime();
        } else {
          const existingTs = messageTimestampsRef.current.get(m.id);
          if (existingTs) {
            ts = existingTs;
          } else {
            ts = Date.now();
            messageTimestampsRef.current.set(m.id, ts);
          }
        }

        // Ensure parts exist and are up to date with streaming content
        // If parts is empty or undefined, but content exists (streaming text), use content.
        let parts = m.parts;
        if (!parts) {
          parts = [];
        }

        // Compute content string for display fallback or search
        let content = "";
        if (!content && parts.length > 0) {
          content = parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("");
        }

        // Map 'data' role to 'system'
        let role = m.role as string;
        if (role === "data") role = "system";

        // Extract usage from metadata or usage property
        const usage: TokenUsage | undefined = m.metadata?.usage ?? m.usage;

        // Determine sessionId for this message
        let sessionId: string | undefined = getOptionalStringField(m, "sessionId");

        // Check if we already stored a sessionId for this message ID
        if (!sessionId) {
          sessionId = messageIdToSessionIdRef.current.get(m.id);
        }

        // If message doesn't have a sessionId and it's a user message, try to match it with a pending sessionId
        if (!sessionId && role === "user" && content) {
          const pending = pendingSessionIdsRef.current.get(content);
          if (pending) {
            // Check if this message was created recently (within 5 seconds of the pending entry)
            const timeDiff = Math.abs(ts - pending.timestamp);
            if (timeDiff < 5000) {
              sessionId = pending.sessionId;
              // Store it by message ID for future reference (e.g., for assistant messages)
              messageIdToSessionIdRef.current.set(m.id, sessionId);
              // Remove from pending map once used
              pendingSessionIdsRef.current.delete(content);
            }
          }
        }

        // For assistant messages, try to find the sessionId from the previous user message
        // by looking at rawMessages array (not chatMessages to avoid circular dependency)
        if (!sessionId && role === "assistant" && rawMessages) {
          const currentIndex = rawMessages.findIndex((msg) => msg.id === m.id);
          if (currentIndex > 0) {
            // Look backwards for the last user message
            for (let i = currentIndex - 1; i >= 0; i--) {
              const prevMsg = rawMessages[i];
              if (prevMsg.role === "user") {
                // Check if we have a stored sessionId for this previous user message
                const prevSessionId = messageIdToSessionIdRef.current.get(prevMsg.id);
                if (prevSessionId) {
                  sessionId = prevSessionId;
                  // Store it for this assistant message too
                  messageIdToSessionIdRef.current.set(m.id, sessionId);
                  break;
                }
              }
            }
          }
        }

        // Fallback to currentSessionId if still no sessionId
        if (!sessionId) sessionId = currentSessionId;

        // Store sessionId by message ID for future reference (especially for assistant messages)
        if (sessionId) {
          messageIdToSessionIdRef.current.set(m.id, sessionId);
        }

        // Check if there's an error for this message
        // First check if this is the last assistant message and there's a current chatError
        // Then fall back to stored errors in the ref (for persistence across re-renders)
        let messageError: Error | undefined;
        if (role === "assistant" && chatError) {
          // Check if this is the last assistant message in rawMessages
          const currentIndex = rawMessages.findIndex((msg) => msg.id === m.id);
          if (currentIndex >= 0) {
            // Check if this is the last assistant message
            let isLastAssistant = true;
            for (let i = currentIndex + 1; i < rawMessages.length; i++) {
              if (rawMessages[i].role === "assistant") {
                isLastAssistant = false;
                break;
              }
            }
            if (isLastAssistant) {
              messageError = chatError;
            }
          }
        }
        // Fall back to stored error if no current error matches
        if (!messageError) {
          messageError = messageErrorsRef.current.get(m.id);
        }

        return {
          type: "chat",
          id: m.id,
          role: role as "user" | "assistant" | "system",
          parts: parts,
          usage: usage,
          content: content,
          isLoading: false,
          timestamp: ts,
          sessionId: sessionId,
          error: messageError,
        };
      });

    // Mark the last assistant message as loading if global loading is true
    if (isChatExecuting && chatMessages.length > 0) {
      const last = chatMessages[chatMessages.length - 1];
      if (last.role === "assistant") {
        last.isLoading = true;
      }
    }

    // Merge and sort - add tabId to SQL messages
    const sqlMessagesWithTabId = sqlMessages.map((msg) => ({ ...msg, tabId }));
    const all = [...sqlMessagesWithTabId, ...chatMessages];
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }, [
    sqlMessages,
    rawMessages,
    isChatExecuting,
    currentSessionId,
    messageIdToSessionIdRef,
    chatError,
    tabId,
  ]);

  // Track previous stats to avoid redundant updates
  const prevStatsRef = useRef<ChatSessionStats | undefined>(undefined);

  // Update parent with current session stats (message count, token usage, and start time)
  useEffect(() => {
    if (onChatSessionStatsChanged && currentSessionId) {
      const currentSessionMessages = mergedMessageList.filter(
        (msg) => msg.type === "chat" && msg.sessionId === currentSessionId
      ) as ChatMessage[];

      const messageCount = currentSessionMessages.length;

      // Find the first message timestamp as the session start time
      const startTime =
        currentSessionMessages.length > 0
          ? new Date(Math.min(...currentSessionMessages.map((msg) => msg.timestamp)))
          : undefined;

      // Sum all token usages from messages in the current session
      const totalTokens: TokenUsage = currentSessionMessages.reduce(
        (acc, msg) => {
          if (msg.usage) {
            return {
              inputTokens: (acc.inputTokens || 0) + (msg.usage.inputTokens || 0),
              outputTokens: (acc.outputTokens || 0) + (msg.usage.outputTokens || 0),
              totalTokens: (acc.totalTokens || 0) + (msg.usage.totalTokens || 0),
              reasoningTokens: (acc.reasoningTokens || 0) + (msg.usage.reasoningTokens || 0),
              cachedInputTokens: (acc.cachedInputTokens || 0) + (msg.usage.cachedInputTokens || 0),
            };
          }
          return acc;
        },
        {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        } as TokenUsage
      );

      // Check if stats effectively changed
      const prevStats = prevStatsRef.current;
      const hasChanged =
        !prevStats ||
        prevStats.messageCount !== messageCount ||
        prevStats.tokens.totalTokens !== totalTokens.totalTokens ||
        prevStats.tokens.outputTokens !== totalTokens.outputTokens ||
        prevStats.startTime?.getTime() !== startTime?.getTime();

      if (hasChanged) {
        const newStats = {
          messageCount,
          tokens: totalTokens,
          startTime,
        };
        prevStatsRef.current = newStats;
        onChatSessionStatsChanged(newStats);
      }
    }
  }, [mergedMessageList, currentSessionId, onChatSessionStatsChanged]);

  // Auto scroll when list grows or content updates
  useEffect(() => {
    // Check if a new SQL message was added by comparing with previous count
    const sqlMessageAdded = sqlMessages.length > prevSqlMessagesCountRef.current;
    prevSqlMessagesCountRef.current = sqlMessages.length;

    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      scrollToBottom();
    } else if (sqlMessageAdded) {
      // New SQL query was added - always scroll to bottom
      scrollToBottom();
    } else {
      // Also scroll if streaming happens (content size change) or SQL is executing
      if (isChatExecuting || isSqlExecuting) {
        const container = responseScrollContainerRef.current;
        if (container) {
          const { scrollTop, scrollHeight, clientHeight } = container;
          // Threshold of 100px to consider "at bottom"
          const isAtBottom = scrollHeight - scrollTop - clientHeight <= 100;
          if (isAtBottom) {
            scrollToBottom(true);
          }
        }
      }
    }
  }, [mergedMessageList, isChatExecuting, isSqlExecuting, sqlMessages.length, scrollToBottom]);

  // Listeners
  useEffect(() => {
    const unsubscribeChat = ChatExecutor.onChatRequest((event) => {
      if (event.detail.tabId !== undefined && event.detail.tabId !== tabId) return;
      // ... existing chat logic ...

      // Ensure we have a way to send
      if (sendMessage) {
        // Set context builder for this request
        // Ensure context includes clickHouseUser from connection
        if (event.detail.context) {
          const clickHouseUser = connection?.user;
          const contextWithUser: DatabaseContext = {
            ...event.detail.context,
            clickHouseUser:
              (event.detail.context as DatabaseContext).clickHouseUser || clickHouseUser,
          };
          ChatContext.setBuilder(() => contextWithUser);
        } else {
          // If no context provided, create one with clickHouseUser
          const clickHouseUser = connection?.user;
          if (clickHouseUser) {
            ChatContext.setBuilder(() => ({ clickHouseUser }));
          }
        }

        // Send message to chat
        // Store the sessionId from the event so we can associate it with the message when it's created
        const sessionIdToUse = event.detail.sessionId || currentSessionId;
        const messageText = event.detail.message;
        const now = Date.now();

        // Store sessionId for this message content (will be matched when mapping messages)
        // Only store if we have a valid sessionId
        if (sessionIdToUse) {
          pendingSessionIdsRef.current.set(messageText, {
            sessionId: sessionIdToUse,
            timestamp: now,
          });
        }

        // Clean up old entries (older than 10 seconds) to prevent memory leaks
        for (const [key, value] of pendingSessionIdsRef.current.entries()) {
          if (now - value.timestamp > 10000) {
            pendingSessionIdsRef.current.delete(key);
          }
        }

        // TODO: generated messageId, so that we can associate errors to the latest message id

        sendMessage({
          text: messageText,
        });
        shouldScrollRef.current = true;
      } else {
        console.warn("Chat not ready yet");
      }
    });

    return () => {
      unsubscribeChat();
    };
  }, [tabId, sendMessage, currentSessionId, connection?.user]);

  // Deletion Handlers
  const handleQueryDelete = useCallback(
    (id: string) => {
      deleteQuery(id);
    },
    [deleteQuery]
  );

  const handleClearScreen = useCallback(() => {
    // Clear SQL messages and executing queries (via context)
    clearAllQueries();

    // Clear chat messages
    chatInstance.messages = [];

    // Clear all refs related to chat messages
    messageIdToSessionIdRef.current.clear();
    pendingSessionIdsRef.current.clear();
    messageTimestampsRef.current.clear();
    messageErrorsRef.current.clear();

    // Generate a new session ID so new messages are treated as a new session
    if (onNewSession) {
      onNewSession();
    }
  }, [onNewSession, chatInstance, messageIdToSessionIdRef, clearAllQueries]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={responseScrollContainerRef}
          className="h-full w-full overflow-auto"
          style={{ scrollBehavior: "smooth" }}
        >
          {mergedMessageList.length === 0 ? (
            <div className="text-sm text-muted-foreground p-1">
              Input your SQL in the editor below and execute it, then the results will appear here.
              Or input your questions to chat with the AI assistant.
            </div>
          ) : (
            <>
              {mergedMessageList.map((msg, index) => {
                // Check if this is the start of a new session
                const prevMsg = index > 0 ? mergedMessageList[index - 1] : null;

                const isNewSession = Boolean(
                  msg.type === "chat" &&
                  msg.sessionId &&
                  prevMsg?.type === "chat" &&
                  (prevMsg as ChatMessage).sessionId !== msg.sessionId &&
                  msg.role === "user"
                );

                if (msg.type === "sql") {
                  return (
                    <QueryListItemView
                      key={msg.id}
                      {...msg}
                      onQueryDelete={handleQueryDelete}
                      isFirst={index === 0}
                      scrollRootRef={responseScrollContainerRef}
                    />
                  );
                } else {
                  return (
                    <div key={msg.id}>
                      {/* Show separator for new conversation */}
                      {isNewSession && (
                        <div className="flex items-center gap-2 px-4 h-6 text-xs text-muted-foreground">
                          <div className="flex-1 h-px bg-border" />
                          <span className="px-2">New conversation started</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <ChatMessageView
                        message={msg}
                        isFirst={index === 0 || isNewSession}
                        isLast={index === mergedMessageList.length - 1}
                      />
                    </div>
                  );
                }
              })}
              <div ref={scrollPlaceholderRef} className="h-6" />
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleClearScreen}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear screen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function QueryListView(props: QueryListViewProps) {
  const [chatInstance, setChatInstance] = useState<Chat<AppUIMessage> | null>(null);
  // Use a ref to store currentSessionId so the getter function always has the latest value
  const currentSessionIdRef = useRef<string | undefined>(props.currentSessionId);
  // Use a ref to store the messageIdToSessionId map so the getter function can access it
  const messageIdToSessionIdRef = useRef<Map<string, string>>(new Map());

  // Update ref when currentSessionId changes
  useEffect(() => {
    currentSessionIdRef.current = props.currentSessionId;
  }, [props.currentSessionId]);

  // Initialize Chat Instance
  const { connection } = useConnection();
  useEffect(() => {
    let mounted = true;
    async function initChat() {
      try {
        // Use a stable ID for the tab, or a new random one if tabId is missing (unlikely for views)
        const id = props.tabId || uuid();
        // Set up context builder with clickHouseUser from connection
        const clickHouseUser = connection?.user;
        if (clickHouseUser) {
          ChatContext.setBuilder(() => ({ clickHouseUser }));
        }
        const chat = await ChatFactory.create({
          id,
          skipStorage: false,
          getCurrentSessionId: () => currentSessionIdRef.current,
          getMessageSessionId: (messageId: string) =>
            messageIdToSessionIdRef.current.get(messageId),
        });
        if (mounted) {
          setChatInstance(chat);
        }
      } catch (e) {
        console.error("Failed to init chat", e);
      }
    }
    initChat();
    return () => {
      mounted = false;
    };
  }, [props.tabId, connection]);

  if (!chatInstance) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <QueryListViewContent
      {...props}
      chatInstance={chatInstance}
      messageIdToSessionIdRef={messageIdToSessionIdRef}
    />
  );
}

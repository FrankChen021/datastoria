import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { AppUIMessage, TokenUsage } from "@/lib/ai/common-types";
import { createChat, setChatContextBuilder } from "@/lib/chat";
import type { DatabaseContext } from "@/lib/chat/types";
import { useConnection } from "@/lib/connection/connection-context";
import { toastManager } from "@/lib/toast";
import type { Chat } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { ChatMessageView } from "./chat/chat-message-view";
import { ChatExecutor } from "./query-execution/chat-executor";
import { QueryExecutor } from "./query-execution/query-executor";
import { QueryListItemView } from "./query-list-item-view";
import type { QueryRequestViewModel } from "./query-view-model";

export interface ChatSessionStats {
  messageCount: number;
  tokens: TokenUsage;
  startTime?: Date;
}

export interface QueryListViewProps {
  tabId?: string; // Optional tab ID for multi-tab support
  currentSessionId?: string; // Current session ID for chat messages
  onExecutionStateChange?: (isExecuting: boolean) => void;
  onChatSessionStatsChanged?: (stats: ChatSessionStats) => void; // Callback to update parent with session stats
  onNewSession?: () => void; // Callback to generate a new session when clearing screen
}

const MAX_MESSAGE_LIST_SIZE = 100;

export interface SQLMessage {
  type: "sql";
  id: string;
  queryRequest: QueryRequestViewModel;
  view: string;
  viewArgs?: {
    displayFormat?: "sql" | "text";
    formatter?: (text: string) => string;
    showRequest?: "show" | "hide" | "collapse";
    params?: Record<string, unknown>;
  };
  timestamp: number;
  sessionId?: string; // Optional session ID when SQL is added to chat
}

// Adapter interface for the merged list
export interface ChatMessage {
  type: "chat";
  id: string;
  role: "user" | "assistant" | "system";
  parts: AppUIMessage["parts"];
  usage?: AppUIMessage["usage"];
  content: string; // Kept for search/display purposes
  isLoading: boolean;
  timestamp: number;
  error?: Error | undefined;
  sessionId?: string; // Session ID for grouping messages
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
  // We now split state: SQL messages are local, Chat messages are managed by useChat
  const [sqlMessages, setSqlMessages] = useState<SQLMessage[]>([]);

  const responseScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPlaceholderRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);
  const executingQueriesRef = useRef<Set<string>>(new Set());
  const messageTimestampsRef = useRef<Map<string, number>>(new Map());
  // Map to store sessionId for messages by their content and timestamp
  // Key: message content, Value: { sessionId, timestamp }
  const pendingSessionIdsRef = useRef<Map<string, { sessionId: string; timestamp: number }>>(new Map());
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

  const scrollToBottom = useCallback((instant = false) => {
    if (scrollPlaceholderRef.current && responseScrollContainerRef.current) {
      // If instant, set scrollTop directly
      if (instant) {
        responseScrollContainerRef.current.scrollTop = responseScrollContainerRef.current.scrollHeight;
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

  // Update parent execution state
  useEffect(() => {
    if (onExecutionStateChange) {
      const isSqlExecuting = executingQueriesRef.current.size > 0;
      onExecutionStateChange(isSqlExecuting || isChatExecuting);
    }
  }, [executingQueriesRef.current.size, isChatExecuting, onExecutionStateChange]);

  // Merge lists efficiently
  const mergedMessageList = useMemo(() => {
    if (!rawMessages) return sqlMessages;

    const chatMessages: ChatMessage[] = (rawMessages as AppUIMessage[])
      .filter((m) => {
        const exclude = (m as any).type === "step-start" || (m as any).type === "step-finish";
        // Filter internal messages if needed, matching chat-list-item-view logic
        // For now, allow all, or filter raw text parts
        return !exclude;
      })
      .map((m) => {
        // Access generic properties safely
        const mAny = m as any;

        // Stable timestamp logic:
        // 1. If message has createdAt, use it.
        // 2. If not, check if we already assigned a timestamp in our ref map.
        // 3. If not, assign Date.now() and store it.
        let ts: number;
        if (mAny.createdAt) {
          ts = new Date(mAny.createdAt).getTime();
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
        if ((!parts || parts.length === 0) && mAny.content) {
          parts = [{ type: "text", text: mAny.content }];
        } else if (!parts) {
          parts = [];
        }

        // Compute content string for display fallback or search
        let content = mAny.content || "";
        if (!content && parts.length > 0) {
          content = parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("");
        }

        // Map 'data' role to 'system'
        let role = m.role as string;
        if (role === "data") role = "system";

        // Extract usage from metadata, usage property, or finish part
        let usage = (m as any).metadata?.usage || (m as any).usage;

        if (!usage && parts) {
          const finishPart = parts.find((p: any) => p.type === "finish");
          if (finishPart) {
            const partMetadata = (finishPart as any).messageMetadata;
            if (partMetadata?.usage) {
              usage = partMetadata.usage;
            } else if ((finishPart as any).usage) {
              usage = (finishPart as any).usage;
            }
          }
        }

        // Determine sessionId for this message
        let sessionId: string | undefined = (m as any).sessionId;

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
        if (!sessionId) {
          sessionId = currentSessionId;
        }

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

    // Merge and sort
    const all = [...sqlMessages, ...chatMessages];
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }, [sqlMessages, rawMessages, isChatExecuting, currentSessionId, messageIdToSessionIdRef, chatError]);

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

      onChatSessionStatsChanged({
        messageCount,
        tokens: totalTokens,
        startTime,
      });
    }
  }, [mergedMessageList, currentSessionId, onChatSessionStatsChanged]);

  const addQuery = useCallback(
    (
      sql: string,
      options?: { displayFormat?: "sql" | "text"; formatter?: (text: string) => string; view?: string },
      params?: Record<string, unknown>
    ) => {
      if (!connection) {
        toastManager.show("No connection selected", "error");
        return;
      }

      const queryId = uuid();
      const timestamp = Date.now();

      // Extract original SQL for rawSQL
      let rawSQL = sql;
      const view = options?.view;
      const isExplainQuery = view && view !== "query";

      if (isExplainQuery) {
        if (view === "pipeline") {
          rawSQL = sql.replace(/^EXPLAIN\s+pipeline\s+graph\s*=\s*1[\s\n]+/i, "");
        } else if (view === "plan") {
          rawSQL = sql.replace(/^EXPLAIN\s+plan\s+indexes\s*=\s*1[\s\n]+/i, "");
        } else {
          rawSQL = sql.replace(new RegExp(`^EXPLAIN\\s+${view}[\\s\\n]+`, "i"), "");
        }
      }

      setSqlMessages((prevList) => {
        let newList = prevList;
        // Optional: limit local SQL history size
        if (newList.length >= MAX_MESSAGE_LIST_SIZE) {
          newList = newList.slice(newList.length - MAX_MESSAGE_LIST_SIZE + 1);
        }

        const showRequest = isExplainQuery ? "show" : options?.formatter ? "hide" : "show";

        const queryMsg: SQLMessage = {
          type: "sql",
          id: queryId,
          timestamp,
          view: options?.view || "query",
          viewArgs: { ...options, params },
          queryRequest: {
            uuid: queryId,
            sql: sql,
            rawSQL: rawSQL,
            requestServer: connection.name || "Server",
            queryId: queryId,
            traceId: null,
            timestamp: timestamp,
            showRequest: showRequest,
            params: params,
            onCancel: () => {},
          },
        };

        shouldScrollRef.current = true;
        return [...newList, queryMsg];
      });
    },
    [connection]
  );

  // Auto scroll when list grows or content updates
  useEffect(() => {
    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      scrollToBottom();
    } else {
      // Also scroll if streaming happens (content size change)
      if (isChatExecuting) {
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
  }, [mergedMessageList, isChatExecuting, scrollToBottom]);

  // Listeners
  useEffect(() => {
    const unsubscribeQuery = QueryExecutor.onQueryRequest((event) => {
      if (event.detail.tabId !== undefined && event.detail.tabId !== tabId) return;
      addQuery(event.detail.sql, event.detail.options, event.detail.options?.params);
    });

    const unsubscribeChat = ChatExecutor.onChatRequest((event) => {
      if (event.detail.tabId !== undefined && event.detail.tabId !== tabId) return;

      // Ensure we have a way to send
      if (sendMessage) {
        // Set context builder for this request
        // Ensure context includes clickHouseUser from connection
        if (event.detail.context) {
          const clickHouseUser = connection?.session?.internalUser || connection?.user;
          const contextWithUser: DatabaseContext = {
            ...event.detail.context,
            clickHouseUser: (event.detail.context as DatabaseContext).clickHouseUser || clickHouseUser,
          };
          setChatContextBuilder(() => contextWithUser);
        } else {
          // If no context provided, create one with clickHouseUser
          const clickHouseUser = connection?.session?.internalUser || connection?.user;
          if (clickHouseUser) {
            setChatContextBuilder(() => ({ clickHouseUser }));
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

        sendMessage({
          text: messageText,
        });
        shouldScrollRef.current = true;
      } else {
        console.warn("Chat not ready yet");
      }
    });

    return () => {
      unsubscribeQuery();
      unsubscribeChat();
    };
  }, [tabId, addQuery, sendMessage, currentSessionId]);

  // Deletion Handlers
  const handleQueryDelete = useCallback((id: string) => {
    setSqlMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleClearScreen = useCallback(() => {
    // Clear SQL messages
    setSqlMessages([]);
    executingQueriesRef.current.clear();
    
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
    
    if (onExecutionStateChange) onExecutionStateChange(false);
  }, [onExecutionStateChange, onNewSession, chatInstance, messageIdToSessionIdRef]);

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
              Input your SQL in the editor below and execute it, then the results will appear here. Or type '@ai' to
              chat with the AI assistant.
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
                      isLast={index === mergedMessageList.length - 1}
                      onExecutionStateChange={(qid, isExec) => {
                        if (isExec) executingQueriesRef.current.add(qid);
                        else executingQueriesRef.current.delete(qid);
                      }}
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
        const clickHouseUser = connection?.session?.internalUser || connection?.user;
        if (clickHouseUser) {
          setChatContextBuilder(() => ({ clickHouseUser }));
        }
        const chat = await createChat({
          id,
          skipStorage: false,
          getCurrentSessionId: () => currentSessionIdRef.current,
          getMessageSessionId: (messageId: string) => messageIdToSessionIdRef.current.get(messageId),
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
    <QueryListViewContent {...props} chatInstance={chatInstance} messageIdToSessionIdRef={messageIdToSessionIdRef} />
  );
}

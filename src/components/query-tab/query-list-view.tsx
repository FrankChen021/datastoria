import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useConnection } from "@/lib/connection/connection-context";
import { toastManager } from "@/lib/toast";
import { Trash2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { QueryExecutor } from "./query-execution/query-executor";
import { ChatExecutor } from "./query-execution/chat-executor";
import { QueryListItemView } from "./query-list-item-view";
import { ChatResponseView } from "./chat-response-view";
import type { QueryRequestViewModel } from "./query-view-model";
import { useChat } from '@ai-sdk/react';
import type { Chat } from '@ai-sdk/react';
import { format } from "date-fns";
import type { AppUIMessage } from "@/lib/ai/client-tools";
import { createChat, setChatContextBuilder } from "@/lib/chat";

export interface QueryListViewProps {
  tabId?: string; // Optional tab ID for multi-tab support
  onExecutionStateChange?: (isExecuting: boolean) => void;
}

const MAX_MESSAGE_LIST_SIZE = 100;

export interface SQLMessage {
  type: 'sql';
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
}

// Adapter interface for the merged list
interface MergedChatMessage {
  type: 'chat';
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts: AppUIMessage['parts']; // Use parts from AppUIMessage
  isLoading: boolean;
  timestamp: number;
  error?: Error | undefined;
}

export type Message = SQLMessage | MergedChatMessage;

function QueryListViewContent({
  tabId,
  onExecutionStateChange,
  chatInstance
}: QueryListViewProps & { chatInstance: Chat<AppUIMessage> }) {
  const { connection } = useConnection();
  // We now split state: SQL messages are local, Chat messages are managed by useChat
  const [sqlMessages, setSqlMessages] = useState<SQLMessage[]>([]);

  const responseScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPlaceholderRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);
  const executingQueriesRef = useRef<Set<string>>(new Set());
  const messageTimestampsRef = useRef<Map<string, number>>(new Map());

  // Use hook with the instance
  // @ts-ignore - useChat types might be outdated or custom in this project
  const { messages: rawMessages, sendMessage, status } = useChat({
    chat: chatInstance,
    onError: (error: Error) => {
      console.error("Chat error:", error);
      toastManager.show("Chat failed: " + error.message, "error");
    }
  });

  // Track executing state for Chat
  const isChatExecuting = status === 'streaming' || status === 'submitted';

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
            scrollPlaceholderRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
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

    const chatObjs: MergedChatMessage[] = (rawMessages as AppUIMessage[]).filter(m => {
      // Filter internal messages if needed, matching chat-list-item-view logic
      // For now, allow all, or filter raw text parts
      return true;
    }).map(m => {
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
        parts = [{ type: 'text', text: mAny.content }];
      } else if (!parts) {
        parts = [];
      }

      // Compute content string for display fallback or search
      let content = mAny.content || '';
      if (!content && parts.length > 0) {
        content = parts.filter(p => p.type === 'text').map(p => p.text).join('');
      }

      // Map 'data' role to 'system'
      let role = m.role as string;
      if (role === 'data') role = 'system';

      return {
        type: 'chat',
        id: m.id,
        role: role as 'user' | 'assistant' | 'system',
        content: content,
        parts: parts,
        isLoading: false,
        timestamp: ts
      };
    });

    // Mark the last assistant message as loading if global loading is true
    if (isChatExecuting && chatObjs.length > 0) {
      const last = chatObjs[chatObjs.length - 1];
      if (last.role === 'assistant') {
        last.isLoading = true;
      }
    }

    // Merge and sort
    const all = [...sqlMessages, ...chatObjs];
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }, [sqlMessages, rawMessages, isChatExecuting]);


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
          type: 'sql',
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
            onCancel: () => { },
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
        if (event.detail.context) {
          setChatContextBuilder(() => event.detail.context);
        }

        sendMessage({
          text: event.detail.message
        });
        shouldScrollRef.current = true;
      } else {
        console.warn("Chat not ready yet");
      }
    });

    return () => {
      unsubscribeQuery();
      unsubscribeChat();
    }
  }, [tabId, addQuery, sendMessage]);


  // Deletion Handlers
  const handleQueryDelete = useCallback((id: string) => {
    setSqlMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  const handleClearScreen = useCallback(() => {
    setSqlMessages([]);
    executingQueriesRef.current.clear();
    if (onExecutionStateChange) onExecutionStateChange(false);
  }, [onExecutionStateChange]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={responseScrollContainerRef} className="h-full w-full overflow-auto p-2" style={{ scrollBehavior: 'smooth' }}>
          {mergedMessageList.length === 0 ? (
            <div className="text-sm text-muted-foreground p-1">Input your SQL in the editor below and execute it, then the results will appear here. Or type '@ai' to chat with the AI assistant.</div>
          ) : (
            <>
              {mergedMessageList.map((msg, index) => {
                if (msg.type === 'sql') {
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
                    <div key={msg.id} className={``}>
                      {msg.role === 'user' && <div className="flex items-center gap-2 mt-2">
                        <h4 className="text-sm font-semibold">{format(msg.timestamp, "yyyy-MM-dd HH:mm:ss")}</h4>
                      </div>}
                      <ChatResponseView
                        messages={[{
                          id: msg.id,
                          role: msg.role,
                          parts: msg.parts
                        }]}
                        isLoading={msg.isLoading}
                        error={msg.error}
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

  // Initialize Chat Instance
  useEffect(() => {
    let mounted = true;
    async function initChat() {
      try {
        // Use a stable ID for the tab, or a new random one if tabId is missing (unlikely for views)
        const id = props.tabId || uuid();
        const chat = await createChat({ id, skipStorage: false });
        if (mounted) {
          setChatInstance(chat);
        }
      } catch (e) {
        console.error("Failed to init chat", e);
      }
    }
    initChat();
    return () => { mounted = false; };
  }, [props.tabId]);

  if (!chatInstance) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <QueryListViewContent {...props} chatInstance={chatInstance} />;
}

import type { AppUIMessage } from "@/lib/ai/client-tools";
import { createChat, setChatContextBuilder } from "@/lib/chat";
import type { Chat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatRequestEventDetail } from "@/components/query-tab/query-execution/chat-executor";

interface ChatInstance {
  chat: Chat<AppUIMessage>;
  chatRequest: ChatRequestEventDetail;
  isInitialized: boolean;
}

/**
 * Hook to manage multiple Chat instances at the parent level
 * Pre-creates Chat instances and passes them down to child components
 */
export function useChatManager(chatList: Array<{ id: string; chatRequest: ChatRequestEventDetail }>, databaseId?: string) {
  const [chatInstances, setChatInstances] = useState<Map<string, ChatInstance>>(new Map());
  const initializingRef = useRef<Set<string>>(new Set());

  // Initialize chat instances for new chat items
  useEffect(() => {
    const initializeChats = async () => {
      for (const chatItem of chatList) {
        const chatId = chatItem.id;

        // Check if already initialized or currently initializing using functional update
        let shouldInitialize = false;
        setChatInstances((prev) => {
          if (prev.has(chatId) || initializingRef.current.has(chatId)) {
            return prev; // Already initialized or initializing
          }
          shouldInitialize = true;
          return prev;
        });

        if (!shouldInitialize) {
          continue;
        }

        initializingRef.current.add(chatId);

        try {
          // Set context builder for this specific chat
          setChatContextBuilder(() => chatItem.chatRequest.context);

          // Create chat instance with skipStorage for single-use chats
          const chatInstance = await createChat({
            id: chatId,
            databaseId,
            skipStorage: true, // Skip storage for single-use chats
          });

          setChatInstances((prev) => {
            // Double-check it wasn't added while we were initializing
            if (prev.has(chatId)) {
              return prev;
            }
            const newMap = new Map(prev);
            newMap.set(chatId, {
              chat: chatInstance,
              chatRequest: chatItem.chatRequest,
              isInitialized: true,
            });
            return newMap;
          });
        } catch (error) {
          console.error(`Failed to initialize chat ${chatId}:`, error);
          setChatInstances((prev) => {
            const newMap = new Map(prev);
            newMap.set(chatId, {
              chat: null as unknown as Chat<AppUIMessage>, // Will be handled by error state
              chatRequest: chatItem.chatRequest,
              isInitialized: false,
            });
            return newMap;
          });
        } finally {
          initializingRef.current.delete(chatId);
        }
      }
    };

    initializeChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatList, databaseId]);

  // Get chat instance for a specific chat ID
  const getChatInstance = useCallback(
    (chatId: string): ChatInstance | undefined => {
      return chatInstances.get(chatId);
    },
    [chatInstances]
  );

  // Cleanup chat instance
  const removeChatInstance = useCallback((chatId: string) => {
    setChatInstances((prev) => {
      const newMap = new Map(prev);
      newMap.delete(chatId);
      return newMap;
    });
  }, []);

  return {
    chatInstances,
    getChatInstance,
    removeChatInstance,
  };
}


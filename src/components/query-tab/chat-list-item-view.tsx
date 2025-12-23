import type { AppUIMessage } from "@/lib/ai/client-tools";
import { createChat, setChatContextBuilder } from "@/lib/chat";
import type { Chat } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatRequestEventDetail } from "../query-execution/chat-executor";
import { ChatResponseView } from "./chat-response-view";

interface ChatListItemViewProps {
  chatId: string;
  chatRequest: ChatRequestEventDetail;
  chatInstance?: Chat<AppUIMessage> | null; // Pre-created chat instance from parent
  isLast?: boolean;
  onChatDelete?: (chatId: string) => void;
  onExecutionStateChange?: (chatId: string, isExecuting: boolean) => void;
  onScrollToBottom?: () => void;
}

// Separate component that uses useChat - only rendered when chat is ready
function ChatContent({
  chat,
  chatRequest,
  onExecutionStateChange,
  chatIdRef,
  onMessagesChange,
}: {
  chat: Chat<AppUIMessage>;
  chatRequest: ChatRequestEventDetail;
  onExecutionStateChange?: (chatId: string, isExecuting: boolean) => void;
  chatIdRef: React.MutableRefObject<string | null>;
  onMessagesChange?: () => void;
}) {
  console.log("🚀 ChatContent component rendering with chat:", chat?.id);

  // Use the chat instance created by createChat() - this includes onToolCall handler
  console.log("🔄 Calling useChat hook with chat instance");
  const {
    messages: rawMessages,
    error,
    status,
    sendMessage,
  } = useChat({
    chat: chat, // Use the chat instance that has onToolCall, custom transport, etc.
  });

  // Filter out internal AI SDK parts like 'step-start', 'step-finish', etc.
  // AppUIMessage is already the AI SDK's UIMessage type, so we can use rawMessages directly
  // but we need to filter out internal parts that shouldn't be displayed
  const messages: AppUIMessage[] = rawMessages.map((msg) => {
    // The usage data should be in the message metadata (not in parts)
    // The AI SDK automatically attaches metadata from finish chunks to the message
    const msgWithMetadata = msg as AppUIMessage & {
      metadata?: { usage?: { inputTokens: number; outputTokens: number; totalTokens: number } };
    };
    const usage = msgWithMetadata.metadata?.usage;

    if (usage) {
      console.log("Found usage in message metadata:", { id: msg.id, role: msg.role, usage });
    }

    return {
      ...msg,
      usage, // Attach usage to the message for easy access
      parts: msg.parts.filter((part) => {
        // Filter out internal AI SDK stream events that shouldn't be displayed
        const partType = part.type as string;
        return (
          partType === "text" ||
          partType === "dynamic-tool" ||
          (typeof partType === "string" &&
            partType.startsWith("tool-") &&
            partType !== "tool-input-available" &&
            partType !== "tool-input-start" &&
            partType !== "tool-input-delta" &&
            partType !== "step-start" &&
            partType !== "step-finish")
        );
      }),
    };
  });

  console.log("✅ useChat hook processed messages:", {
    rawMessageCount: rawMessages.length,
    processedMessageCount: messages.length,
    status,
    hasError: !!error,
  });

  if (error) {
    console.error("❌ useChat hook returned error:", error, error?.stack);
  }

  const hasSentInitialMessage = useRef(false);

  // Send initial message once chat is ready
  useEffect(() => {
    try {
      console.log("🔄 ChatContent useEffect triggered:", {
        hasSent: hasSentInitialMessage.current,
        hasMessage: !!chatRequest.message?.trim(),
        message: chatRequest.message,
      });

      if (!hasSentInitialMessage.current && chatRequest.message?.trim() && sendMessage) {
        hasSentInitialMessage.current = true;
        console.log("✅ About to send initial message:", chatRequest.message);

        try {
          console.log("📤 Calling useChat sendMessage with:", chatRequest.message);
          sendMessage({ text: chatRequest.message });
          console.log("📤 sendMessage called successfully");
        } catch (sendError) {
          console.error("❌ Failed to send initial message:", sendError, { message: chatRequest.message });
        }
      }
    } catch (effectError) {
      console.error("❌ Error in ChatContent useEffect:", effectError, { chatRequest });
    }
  }, [chatRequest.message, sendMessage]);

  // Update execution state
  useEffect(() => {
    const isExecuting = status === "streaming" || status === "submitted";
    if (chatIdRef.current && onExecutionStateChange) {
      onExecutionStateChange(chatIdRef.current, isExecuting);
    }
  }, [status, onExecutionStateChange, chatIdRef]);

  // Continuously scroll while streaming
  useEffect(() => {
    if (status === "streaming" && messages.length > 0 && onMessagesChange) {
      // Scroll continuously during streaming
      const intervalId = setInterval(() => {
        onMessagesChange();
      }, 100);
      return () => clearInterval(intervalId);
    }
  }, [status, messages.length]);

  useEffect(() => {
    if (messages.length > 0 && onMessagesChange) {
      onMessagesChange();
    }
  }, [messages.length]);

  return (
    <ChatResponseView
      messages={messages as AppUIMessage[]}
      isLoading={status === "streaming" || status === "submitted"}
      error={error}
    />
  );
}

export function ChatListItemView({
  chatId,
  chatRequest,
  chatInstance,
  isLast,
  onChatDelete,
  onExecutionStateChange,
  onScrollToBottom,
}: ChatListItemViewProps) {
  const chatIdRef = useRef<string>(chatId);
  const [timestamp] = useState(() => format(new Date(), "yyyy-MM-dd HH:mm:ss"));

  // Use pre-created chat instance if provided, otherwise fall back to creating one
  const [chat, setChat] = useState<Chat<AppUIMessage> | null>(chatInstance || null);
  const [isInitializing, setIsInitializing] = useState(!chatInstance);

  // If chatInstance is provided from parent, use it directly
  useEffect(() => {
    if (chatInstance) {
      setChat(chatInstance);
      setIsInitializing(false);
      chatIdRef.current = chatInstance.id;
    }
  }, [chatInstance]);

  // Fallback: Initialize chat instance if not provided from parent
  useEffect(() => {
    if (chatInstance || chat) {
      return; // Already have a chat instance
    }

    let mounted = true;

    async function initChat() {
      try {
        // Set up context builder
        setChatContextBuilder(() => chatRequest.context);

        // Create or get chat instance
        const instance = await createChat({
          id: chatId,
          skipStorage: true, // Skip storage for single-use chats
          apiEndpoint: "/api/chat-agent", // Use the agent-based endpoint
        });

        if (!mounted) return;

        chatIdRef.current = instance.id;
        setChat(instance);
        setIsInitializing(false);
      } catch (error) {
        console.error("Failed to initialize chat:", error);
        if (mounted) {
          setIsInitializing(false);
        }
      }
    }

    initChat();

    return () => {
      mounted = false;
    };
  }, [chatId, chatRequest.context, chatInstance, chat]);

  if (isInitializing || !chat) {
    return (
      <div className={`pb-4 mb-4 ${isLast ? "" : "border-b"}`}>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-sm font-semibold">{timestamp}</h4>
        </div>
        <div className="flex items-center gap-2 mt-2 mb-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Initializing chat...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`pb-4 mb-4 ${isLast ? "" : "border-b"}`}
      // onMouseEnter={() => setShowDelete(true)}
      // onMouseLeave={() => setShowDelete(false)}
    >
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold">{timestamp}</h4>
        {/* {onChatDelete && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 transition-opacity ${showDelete ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            onClick={handleDelete}
          >
            <X className="h-4 w-4" />
          </Button>
        )} */}
      </div>

      {/* Chat Content - only render when chat is ready */}
      <ChatContent
        chat={chat}
        chatRequest={chatRequest}
        onExecutionStateChange={onExecutionStateChange}
        chatIdRef={chatIdRef}
        onMessagesChange={onScrollToBottom}
      />
    </div>
  );
}

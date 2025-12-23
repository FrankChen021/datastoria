import type { AppUIMessage } from "@/lib/ai/client-tools";
import { Button } from "@/components/ui/button";
import { createChat, setChatContextBuilder } from "@/lib/chat/create-chat";
import type { ChatContext } from "@/lib/chat/types";
import { useConnection } from "@/lib/connection/connection-context";
import { useChat } from "@ai-sdk/react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatResponseView } from "../chat-response-view";
import { ChatExecutor } from "../query-execution/chat-executor";
import { QueryInputView, type QueryInputViewRef } from "./query-input-view";

export interface ChatInputProps {
  chatId: string;
  initialMessage?: string;
  onExitChat: () => void;
  onMessageSent?: () => void;
  tabId?: string;
}

// Separate component that uses useChat - only rendered when chat is ready
function ChatInputContent({
  chat,
  initialMessage,
  onExitChat,
  onMessageSent,
  tabId,
}: {
  chat: Awaited<ReturnType<typeof createChat>>;
  initialMessage?: string;
  onExitChat: () => void;
  onMessageSent?: () => void;
  tabId?: string;
}) {
  const editorRef = useRef<QueryInputViewRef>(null);
  const hasDispatchedChatRequest = useRef(false);

  // Use useChat hook to get messages, status, and sendMessage
  const {
    messages: rawMessages,
    error,
    status,
    sendMessage,
  } = useChat({
    chat: chat,
  });

  // Filter out internal AI SDK parts
  const messages: AppUIMessage[] = rawMessages.map((msg) => {
    // The usage data should be in the message metadata (not in parts)
    // The AI SDK automatically attaches metadata from finish chunks to the message
    const msgWithMetadata = msg as AppUIMessage & { 
      metadata?: { usage?: { inputTokens: number; outputTokens: number; totalTokens: number } } 
    };
    const usage = msgWithMetadata.metadata?.usage;

    return {
      ...msg,
      usage, // Attach usage to the message for easy access
      parts: msg.parts.filter((part) => {
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
    } as AppUIMessage;
  });

  // Send initial message if provided
  const hasSentInitialMessage = useRef(false);
  useEffect(() => {
    if (initialMessage && initialMessage.trim() && !hasSentInitialMessage.current && sendMessage) {
      hasSentInitialMessage.current = true;
      hasDispatchedChatRequest.current = true;
      console.log("📤 ChatInput: Sending initial message via sendMessage()", { initialMessage });
      sendMessage({ text: initialMessage });
      if (onMessageSent) {
        onMessageSent();
      }
    }
  }, [initialMessage, sendMessage, onMessageSent]);

  // Handle run command from editor (Ctrl/Cmd+Enter)
  const handleRun = useCallback((text: string) => {
    if (!text || status === "streaming" || status === "submitted") {
      return;
    }

    if (!hasDispatchedChatRequest.current && !initialMessage) {
      hasDispatchedChatRequest.current = true;
      ChatExecutor.sendChatRequest("@ai", undefined, tabId);
    }

    console.log("📤 ChatInput: Sending message from editor via sendMessage()", { text });
    sendMessage({ text });

    // Clear editor after sending
    if (editorRef.current) {
      editorRef.current.setValue("");
    }

    if (onMessageSent) {
      onMessageSent();
    }

    setTimeout(() => {
      editorRef.current?.focus();
    }, 0);
  }, [status, sendMessage, onMessageSent, tabId, initialMessage]);

  return (
    <div className="flex flex-col h-full bg-background border-t">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <span className="text-sm font-medium">Chat with AI</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onExitChat} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Exit Chat
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-auto p-4">
        <ChatResponseView
          messages={messages}
          isLoading={status === "streaming" || status === "submitted"}
          error={error}
        />
      </div>

      {/* Input Area */}
      <div className="border-t" style={{ height: "150px" }}>
        <QueryInputView
          ref={editorRef}
          storageKey={`chat-input-${chat.id}`}
          language="chat"
          placeholder="Type your message... Press Ctrl/Cmd+Enter to send. Use @ to mention tables."
          onRun={handleRun}
        />
      </div>
    </div>
  );
}

export function ChatInput({ chatId, initialMessage, onExitChat, onMessageSent, tabId }: ChatInputProps) {
  const { connection } = useConnection();
  const [chat, setChat] = useState<Awaited<ReturnType<typeof createChat>> | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Set up context builder for chat
  useEffect(() => {
    const contextBuilder = (): ChatContext | undefined => {
      if (!connection) {
        return undefined;
      }

      // Connection doesn't have a database property, context is optional
      return {
        // Add more context as needed
      };
    };

    setChatContextBuilder(contextBuilder);

    return () => {
      setChatContextBuilder(() => undefined);
    };
  }, [connection]);

  // Create or load chat instance
  useEffect(() => {
    let mounted = true;

    async function initChat() {
      try {
        const chatInstance = await createChat({ id: chatId });
        if (mounted) {
          setChat(chatInstance);
          setIsInitializing(false);
        }
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
  }, [chatId]);

  if (isInitializing || !chat) {
    return (
      <div className="flex flex-col h-full bg-background border-t">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Chat with AI</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onExitChat} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Exit Chat
          </Button>
        </div>
        <div className="flex items-center justify-center flex-1">
          <div className="text-sm text-muted-foreground">Loading chat...</div>
        </div>
      </div>
    );
  }

  return (
    <ChatInputContent
      chat={chat}
      initialMessage={initialMessage}
      onExitChat={onExitChat}
      onMessageSent={onMessageSent}
      tabId={tabId}
    />
  );
}


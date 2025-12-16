import { Button } from "@/components/ui/button";
import type { AppUIMessage } from "@/lib/ai/ai-tools";
import { createChat, setChatContextBuilder } from "@/lib/chat/create-chat";
import type { ChatContext } from "@/lib/chat/types";
import { useConnection } from "@/lib/connection/connection-context";
import { useChat } from "@ai-sdk/react";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatResponseView } from "../chat-response-view";
import { ChatExecutor } from "../query-execution/chat-executor";

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
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    return {
      ...msg,
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

  const handleSend = useCallback(() => {
    const messageText = input.trim();
    if (!messageText || status === "streaming" || status === "submitted") {
      return;
    }

    if (!hasDispatchedChatRequest.current && !initialMessage) {
      hasDispatchedChatRequest.current = true;
      ChatExecutor.sendChatRequest("@ai", undefined, tabId);
    }

    console.log("📤 ChatInput: Sending subsequent message via sendMessage()", { messageText });
    sendMessage({ text: messageText });

    setInput("");
    if (onMessageSent) {
      onMessageSent();
    }

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [input, status, sendMessage, onMessageSent, tabId, initialMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const isSending = status === "streaming" || status === "submitted";

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
      <div className="border-t p-4">
        <div className="flex flex-col gap-2">
          {/* Textarea container with relative positioning for icon button */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              disabled={isSending}
              className="flex-1 min-h-[60px] max-h-[200px] resize-none rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 w-full"
              rows={3}
            />
            {/* Icon-only send button positioned in bottom-right */}
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              size="icon"
              className="absolute bottom-2 right-2 h-8 w-8"
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {/* Status text below textarea */}
          <div className="text-xs text-muted-foreground">
            {isSending ? "AI is responding..." : "Press Enter to send, Shift+Enter for new line"}
          </div>
        </div>
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


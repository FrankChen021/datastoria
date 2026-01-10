"use client";

import type { AppUIMessage } from "@/lib/ai/common-types";
import { AlertCircle } from "lucide-react";
import * as React from "react";
import { useDebouncedCallback } from "use-debounce";
import { ChatMessageView } from "./chat-message-view";

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

interface ChatMessagesProps {
  messages: ChatMessage[];
  error: Error | null;
}

export const ChatMessages = React.memo(({ messages, error }: ChatMessagesProps) => {
  const prevMessagesLengthRef = React.useRef(messages.length);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollPlaceholderRef = React.useRef<HTMLDivElement>(null);

  // Debounced scroll function (20ms delay)
  const scrollToBottom = useDebouncedCallback(() => {
    // Use requestAnimationFrame to ensure DOM is updated before scrolling
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollPlaceholderRef.current) {
          scrollPlaceholderRef.current.scrollIntoView({ block: "end", behavior: "auto" });
        } else if (scrollContainerRef.current) {
          // Fallback to direct scroll if placeholder not available
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });
    });
  }, 20);

  // Auto scroll when messages or error change
  React.useEffect(() => {
    if (messages.length === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const messagesLengthChanged = messages.length !== prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (messagesLengthChanged) {
      // When a new message comes(user request or received response), always scroll down
    } else {
      // Check if user is at bottom (within 100px threshold)
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight <= 100;
      if (!isAtBottom) {
        return;
      }
    }

    scrollToBottom();
  }, [messages, scrollToBottom]);

  return (
    <div
      ref={scrollContainerRef}
      className="h-full w-full overflow-auto"
      style={{ scrollBehavior: "smooth" }}
    >
      <div className="flex flex-col">
        {messages.map((message, index) => (
          <ChatMessageView
            key={message.id}
            message={message}
            isFirst={index === 0}
            isLast={index === messages.length - 1}
          />
        ))}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-lg flex items-start gap-2 mx-2">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Error</p>
            <p className="text-sm text-destructive/80">{error.message}</p>
          </div>
        </div>
      )}

      {/* Placeholder div at the bottom for scrolling */}
      <div ref={scrollPlaceholderRef} className="h-1" />
    </div>
  );
});

ChatMessages.displayName = "ChatMessages";

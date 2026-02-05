"use client";

import { AppLogo } from "@/components/app-logo";
import { TypingDots } from "@/components/ui/typing-dots";
import type { AppUIMessage } from "@/lib/ai/chat-types";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import * as React from "react";
import { useDebouncedCallback } from "use-debounce";
import { ChatMessage } from "./chat-message";
import type { UserAction } from "./message-user-actions";

interface ChatMessageListProps {
  messages: AppUIMessage[];
  isRunning: boolean;
  error: Error | null;
  onAction?: (action: UserAction) => void;
}

export const ChatMessageList = React.memo(
  ({ messages, isRunning, error, onAction }: ChatMessageListProps) => {
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

    // Auto scroll when messages, isRunning state, or error change
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
    }, [messages, isRunning, scrollToBottom]);

    return (
      <div
        ref={scrollContainerRef}
        className="h-full w-full overflow-auto"
        style={{ scrollBehavior: "smooth" }}
      >
        <div className="flex flex-col">
          {messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              message={message}
              isLoading={isRunning && index === messages.length - 1 && message.role === "assistant"}
              isFirst={index === 0}
              isLast={index === messages.length - 1}
              isRunning={isRunning}
              onAction={onAction}
            />
          ))}

          {/* Show loading indicator when waiting for assistant response */}
          {isRunning && messages.length > 0 && messages[messages.length - 1].role === "user" && (
            <div className={cn("mt-0")}>
              <div className="flex gap-[1px]">
                {/* Left color bar for assistant messages */}
                <div className="self-stretch w-1 flex-shrink-0 bg-emerald-400 dark:bg-emerald-500" />

                <div className="flex-1 flex flex-col min-w-0">
                  {/* Profile and message row */}
                  <div className="flex gap-[1px]">
                    <div className="flex-shrink-0 w-[28px] flex justify-center">
                      <div className="h-6 w-6 flex items-center justify-center">
                        <AppLogo className="h-6 w-6" />
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden min-w-0 text-sm pr-6">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Thinking</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                        <TypingDots />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
  }
);

ChatMessageList.displayName = "ChatMessageList";

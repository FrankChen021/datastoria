"use client";

import { AppLogo } from "@/components/app-logo";
import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import type { AppUIMessage, TokenUsage } from "@/lib/ai/common-types";
import "@/lib/number-utils"; // Ensure formatTimeDiff is available

import { useChat, type Chat } from "@ai-sdk/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChatContext } from "../chat-context";
import { ChatInput, type ChatInputHandle } from "../input/chat-input";
import { getTableContextByMentions } from "../input/mention-utils";
import { ChatMessages, type ChatMessage } from "../message/chat-messages";

export type Question = { text: string; autoRun?: boolean };

export const DEFAULT_CHAT_QUESTIONS: Question[] = [
  {
    text: "How many INSERT queries as well as insert rows, insert bytes were executed in the last 1 hour from @system.query_log?",
    autoRun: false,
  },
  {
    text: "Show me the number of error queries by hour from @system.query_log over the past 3 hours in line chart",
    autoRun: false,
  },
  {
    text: "What's the top 3 query that consumes the most CPU time over the past 3 hours from @system.query_log?",
    autoRun: false,
  },
  { text: "Show me table schema and structure", autoRun: false },
  { text: "Help me write a JOIN query", autoRun: false },
  { text: "What are the best practices for partitioning?", autoRun: false },
];

interface ChatViewProps {
  chat: Chat<AppUIMessage>;
  onClose?: () => void;
  onNewChat?: () => void;
  questions?: Question[];
  currentQuery?: string;
  currentDatabase?: string;
  availableTables?: Array<{
    name: string;
    columns: string[];
  }>;
  externalInput?: string;
}

export interface ChatViewHandle {
  send: (text: string) => void;
  getInput: () => string;
  focus: () => void;
}

export const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(function ChatView(
  { chat, onNewChat, questions, currentQuery, currentDatabase, availableTables, externalInput },
  ref
) {
  const { connection } = useConnection();
  const chatInputRef = useRef<ChatInputHandle | null>(null);

  const [promptInput, setPromptInput] = useState<string | undefined>(externalInput);

  // Update promptInput when externalInput changes
  useEffect(() => {
    if (externalInput !== undefined) {
      setPromptInput(externalInput);
    }
  }, [externalInput]);
  const { messages, error, sendMessage, status, stop } = useChat({ chat });

  // Focus input when ChatView is mounted
  useEffect(() => {
    // Use a small delay to ensure ChatInput is fully mounted
    const timer = setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!chat || !text.trim()) return;

      // Enrich context with mentioned tables
      const mentionedTables = getTableContextByMentions(text, connection!);

      // Update context builder to include mentioned tables
      ChatContext.setBuilder(() => ({
        currentQuery,
        database: currentDatabase,
        tables: [...(availableTables || []), ...(mentionedTables || [])],
        clickHouseUser: connection?.metadata.internalUser,
      }));

      sendMessage({ text });
    },
    [chat, sendMessage, connection, currentQuery, currentDatabase, availableTables]
  );

  // Expose send and getInput to parent component via imperative handle
  useImperativeHandle(
    ref,
    () => ({
      send: async (text: string) => {
        await handleSubmit(text);
      },
      getInput: () => {
        return chatInputRef.current?.getInput() || "";
      },
      focus: () => {
        chatInputRef.current?.focus();
      },
    }),
    [handleSubmit]
  );

  const isStreaming = status === "streaming" || status === "submitted";

  // Convert AI SDK messages to ChatMessage format
  const chatMessages = useMemo((): ChatMessage[] => {
    if (!messages) return [];

    const msgs = (messages as AppUIMessage[]).map((m) => {
      const mAny = m as any;
      const ts = mAny.createdAt ? new Date(mAny.createdAt).getTime() : Date.now();
      let parts = m.parts;
      if ((!parts || parts.length === 0) && mAny.content) {
        parts = [{ type: "text", text: mAny.content }];
      } else if (!parts) {
        parts = [];
      }

      let content = mAny.content || "";
      if (!content && parts.length > 0) {
        content = parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("");
      }

      let role = m.role as string;
      if (role === "data") role = "system";

      let usage = mAny.metadata?.usage || mAny.usage;
      if (!usage && parts) {
        const finishPart = parts.find((p: any) => p.type === "finish");
        if (finishPart) {
          const partMetadata = (finishPart as any).messageMetadata;
          usage = partMetadata?.usage || (finishPart as any).usage;
        }
      }

      return {
        type: "chat" as const,
        id: m.id,
        role: role as "user" | "assistant" | "system",
        parts: parts,
        usage: usage,
        content: content,
        isLoading: false,
        timestamp: ts,
        error: undefined,
      };
    });

    // Mark the last assistant message as loading if global loading is true
    // AND the message is not yet finished (no 'finish' part)
    if (isStreaming && msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      if (last.role === "assistant") {
        const isFinished = last.parts.some((p) => (p as any).type === "finish");
        if (!isFinished) {
          last.isLoading = true;
        }
      }
    }

    return msgs;
  }, [messages, isStreaming]);

  // Calculate total token usage
  const tokenUsage = useMemo((): TokenUsage => {
    return chatMessages.reduce(
      (acc, msg) => {
        if (msg.usage) {
          acc.totalTokens += msg.usage.totalTokens || 0;
          acc.inputTokens += msg.usage.inputTokens || 0;
          acc.outputTokens += msg.usage.outputTokens || 0;
          acc.reasoningTokens += msg.usage.reasoningTokens || 0;
          acc.cachedInputTokens += msg.usage.cachedInputTokens || 0;
        }
        return acc;
      },
      {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      }
    );
  }, [chatMessages]);

  const isEmpty = chatMessages.length === 0;

  const handleQuestionClick = useCallback(
    (question: { text: string; autoRun?: boolean }) => {
      if (question.autoRun) {
        // Auto-run: send the message immediately
        handleSubmit(question.text);
      } else {
        // Default: set the input for user to review/edit
        setPromptInput(question.text);
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {isEmpty ? (
        questions && questions.length > 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="bg-background shadow-sm">
              <AppLogo width={64} height={64} />
            </div>
            <div className="w-full max-w-xl">
              <p className="text-sm mb-2">Start a conversation with the AI assistant</p>
              <p className="text-xs text-muted-foreground mb-2">Try asking the AI assistant:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {questions.map((question, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    size="sm"
                    className="h-auto py-1.5 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    onClick={() => handleQuestionClick(question)}
                  >
                    {question.text}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="bg-background shadow-sm">
              <AppLogo width={64} height={64} />
            </div>
            <div className="space-y-2 w-full max-w-md">
              <p className="text-sm">Start a conversation with the AI assistant</p>
            </div>
          </div>
        )
      ) : (
        <ChatMessages messages={chatMessages} error={error || null} />
      )}
      <ChatInput
        ref={chatInputRef}
        onSubmit={handleSubmit}
        onStop={stop}
        isStreaming={isStreaming}
        hasMessages={chatMessages.length > 0}
        tokenUsage={tokenUsage}
        onNewChat={onNewChat}
        externalInput={promptInput}
      />
    </div>
  );
});

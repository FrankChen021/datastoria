"use client";

import { AppLogo } from "@/components/app-logo";
import { useConnection } from "@/components/connection/connection-context";
import type { AppUIMessage } from "@/lib/ai/chat-types";
import "@/lib/number-utils"; // Ensure formatTimeDiff is available

import { useChat, type Chat } from "@ai-sdk/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChatActionProvider } from "../chat-action-context";
import { ChatContext } from "../chat-context";
import { ChatInput, type ChatInputHandle } from "../input/chat-input";
import { getTableContextByMentions } from "../input/mention-utils";
import { ChatMessageList } from "../message/chat-message-list";
import type { UserActionInput } from "../message/message-user-actions";
import { useTokenUsage } from "./use-token-usage";

export type Question = { text: string; autoRun?: boolean };

const GREETINGS = [
  "Hello there! How can I help you today?",
  "Hi there! What would you like to explore?",
  "Good to see you! Ready to dive into your data?",
  "Nice to meet you! What can I help you analyze?",
  "Hello and welcome! Let's explore your ClickHouse cluster and data!",
];

export const DEFAULT_CHAT_QUESTIONS: Question[] = [
  {
    text: "Help me optimize a query",
    autoRun: true,
  },
  {
    text: "Show me the number of error queries by hour from @system.query_log over the past 3 hours in line chart",
    autoRun: true,
  },
  {
    text: "How many INSERT queries as well as insert rows, insert bytes were executed in the last 1 hour from @system.query_log",
    autoRun: true,
  },
  {
    text: "What's the top 3 SELECT queries that consumes the most CPU time over the past 3 hours",
    autoRun: true,
  },
  {
    text: "Visualize the trend of ProfileEvent_DistributedConnectionFailTry from the @system.metric_log by hour in the last 12 hours",
    autoRun: true,
  },
  { text: "Find the top 1 slowest query in the last 1 day and optimize it", autoRun: true },
  { text: "Help me write a JOIN query", autoRun: false },
  { text: "What are the best practices for partitioning?", autoRun: true },
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
    columns: Array<{ name: string; type: string }> | string[];
  }>;
  externalInput?: string;
  onStreamingChange?: (isRunning: boolean) => void;
}

export interface ChatViewHandle {
  send: (text: string) => void;
  getInput: () => string;
  focus: () => void;
}

export const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(function ChatView(
  {
    chat,
    onNewChat,
    questions,
    currentQuery,
    currentDatabase,
    availableTables,
    externalInput,
    onStreamingChange,
  },
  ref
) {
  const { connection } = useConnection();
  const chatInputRef = useRef<ChatInputHandle | null>(null);

  const [promptInput, setPromptInput] = useState<string | undefined>(externalInput);

  // Update promptInput when externalInput changes
  useEffect(() => {
    if (externalInput !== undefined) {
      setPromptInput(externalInput);
      return;
    }
    setPromptInput(undefined);
  }, [externalInput, chat.id]);
  const { messages, error, sendMessage, status, stop } = useChat({ chat });

  // Focus input when ChatView is mounted
  useEffect(() => {
    // Use a small delay to ensure ChatInput is fully mounted
    const timer = setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [chat.id]);

  // Notify parent when streaming state changes
  useEffect(() => {
    onStreamingChange?.(status === "streaming" || status === "submitted");
  }, [status, onStreamingChange]);

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

  const isRunning = status === "streaming" || status === "submitted";

  const tokenUsage = useTokenUsage(messages as AppUIMessage[]);

  const isEmpty = !messages || messages.length === 0;

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

  const handleUserAction = useCallback(
    (input: UserActionInput) => {
      if (input.autoRun) {
        handleSubmit(input.text);
        return;
      }
      setPromptInput(input.text);
    },
    [handleSubmit]
  );

  return (
    <ChatActionProvider onAction={handleUserAction} chatId={chat.id}>
      <div className="flex flex-col h-full bg-background overflow-hidden relative">
        {isEmpty ? (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 flex flex-col">
            <div className="flex flex-col items-center w-full max-w-full my-auto pb-8 pt-6">
              <div className="mb-0">
                <AppLogo width={64} height={64} />
              </div>
              <p className="text-xl text-center font-medium mb-4 mt-0">
                {GREETINGS[Math.floor(Math.random() * GREETINGS.length)]}
              </p>
              {questions && questions.length > 0 && (
                <div className="w-full flex flex-col items-center space-y-2">
                  {questions.map((question, index) => (
                    <button
                      key={index}
                      type="button"
                      className="w-max max-w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg border border-border/50 whitespace-normal hover:border-border transition-colors"
                      onClick={() => handleQuestionClick(question)}
                    >
                      {question.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ChatMessageList
            messages={messages as AppUIMessage[]}
            isRunning={isRunning}
            error={error || null}
          />
        )}
        <ChatInput
          ref={chatInputRef}
          onSubmit={handleSubmit}
          onStop={stop}
          isRunning={isRunning}
          hasMessages={messages.length > 0}
          tokenUsage={tokenUsage}
          onNewChat={onNewChat}
          externalInput={promptInput}
        />
      </div>
    </ChatActionProvider>
  );
});

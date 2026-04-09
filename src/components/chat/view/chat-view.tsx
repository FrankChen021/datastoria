"use client";

import { AppLogo } from "@/components/app-logo";
import { useConnection } from "@/components/connection/connection-context";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppUIMessage } from "@/lib/ai/chat-types";
import "@/lib/number-utils"; // Ensure formatTimeDiff is available

import { useChat, type Chat } from "@ai-sdk/react";
import { Activity, BarChart, Code2, Globe, Lightbulb, Zap } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { ChatActionProvider, type UserActionInput } from "../chat-action-context";
import { ChatContext, getDatabaseContextFromConnection } from "../chat-context";
import { ChatFactory } from "../chat-factory";
import { ChatCommandProvider, useChatCommands } from "../command-context";
import {
  ChatInput,
  type ChatInputHandle,
  type ChatInputImageAttachment,
} from "../input/chat-input";
import { getTableContextByMentions } from "../input/mention-utils";
import { ChatMessageList } from "../message/chat-message-list";
import { useTokenUsage } from "./use-token-usage";

export type Question = { text: string; autoRun?: boolean; requiredSkill?: string };

export type QuestionGroupData = {
  icon: React.ReactNode;
  questions: Question[];
};

const GREETINGS = [
  "Hello there! How can I help you today?",
  "Hi there! What would you like to explore?",
  "Good to see you! Ready to dive into your data?",
  "Nice to meet you! What can I help you analyze?",
  "Hello and welcome! Let's explore your ClickHouse cluster and data!",
];

export const DEFAULT_CHAT_QUESTION_GROUPS: Record<string, QuestionGroupData> = {
  Diagnostics: {
    icon: <Activity className="w-4 h-4 text-blue-500" />,
    questions: [
      { text: "What's the status of current cluster", autoRun: true },
    ],
  },
  "Data Exploration": {
    icon: <Globe className="w-4 h-4 text-green-500" />,
    questions: [
      { text: "What're the top 3 SELECT queries that consume the most CPU time over the past 3 hours", autoRun: true },
      { text: "How many INSERT queries as well as insert rows, insert bytes were executed in the last 1 hour from @system.query_log", autoRun: true },
    ],
  },
  Visualization: {
    icon: <BarChart className="w-4 h-4 text-purple-500" />,
    questions: [
      { text: "Show me the number of SELECT queries by minute from @system.query_log over the past 3 hours in bar chart", autoRun: true },
      { text: "Visualize the trend of ProfileEvent_DistributedConnectionFailTry from the @system.metric_log by hour in the last 12 hours", autoRun: true },
      { text: "Show the distribution of query kind from the @system.query_log in the last 12 hours in pie chart", autoRun: true },
    ],
  },
  "SQL Optimization": {
    icon: <Zap className="w-4 h-4 text-amber-500" />,
    questions: [
      { text: "Help me optimize a query", autoRun: true },
      { text: "Find the top 1 slowest query in the last 1 day and optimize it", autoRun: true },
    ],
  },
  "SQL Generation": {
    icon: <Code2 className="w-4 h-4 text-green-500" />,
    questions: [
      { text: "Generate a SELECT query to get the slowest query from the query log in the last 1 hour", autoRun: true },
    ],
  },
  "General": {
    icon: <Lightbulb className="w-4 h-4 text-yellow-500" />,
    questions: [
      { text: "What are the best practices for partitioning?", autoRun: true },
      { text: "How does async_insert work from the source code? Will data be lost if the server is restarted when this setting is enabled?", autoRun: true, requiredSkill: "source-code-inspection" },
    ],
  },
};

export function SampleQuestions({
  onQuestionClick,
}: {
  onQuestionClick: (question: Question) => void;
}) {
  const { commandsByName, loading } = useChatCommands();

  // Wait until commands are loaded so we don't flash empty groups
  if (loading) {
    return (
      <div className="w-full flex flex-col space-y-3 max-w-3xl mx-auto mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col border border-border/50 rounded-xl overflow-hidden bg-card shadow-sm">
            <div className="flex items-center space-x-2 px-4 py-2.5 bg-muted/30 border-b border-border/50">
              <Skeleton className="w-4 h-4 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 px-1 py-0">
              <div className="px-3 py-2.5">
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="px-3 py-2.5">
                <Skeleton className="h-4 w-5/6 mb-1" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const filteredGroups = Object.entries(DEFAULT_CHAT_QUESTION_GROUPS)
    .map(([group, data]) => {
      const filteredQuestions = data.questions.filter(
        (q) => !q.requiredSkill || commandsByName.has(q.requiredSkill)
      );
      return [group, { ...data, questions: filteredQuestions }] as const;
    })
    .filter(([_, data]) => data.questions.length > 0);

  if (filteredGroups.length === 0) return null;

  return (
    <div className="w-full flex flex-col space-y-3 max-w-3xl mx-auto mt-4">
      {filteredGroups.map(([group, { icon, questions }]) => (
        <div key={group} className="flex flex-col border border-border/50 rounded-xl overflow-hidden bg-card shadow-sm">
          <div className="flex items-center space-x-2 px-4 py-2.5 bg-muted/30 border-b border-border/50">
            {icon}
            <h3 className="text-sm font-medium text-foreground/80">{group}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 px-1 py-0">
            {questions.map((question, index) => {
              const isLastOdd = questions.length % 2 !== 0 && index === questions.length - 1;
              return (
                <button
                  key={question.text}
                  type="button"
                  className={`text-left px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border/50 ${
                    isLastOdd ? "md:col-span-2" : ""
                  }`}
                  onClick={() => onQuestionClick(question)}
                >
                  {question.text}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ChatViewProps {
  chat: Chat<AppUIMessage>;
  onClose?: () => void;
  onNewChat?: () => void;
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
    currentDatabase,
    availableTables,
    externalInput,
    onStreamingChange,
  },
  ref
) {
  const { connection } = useConnection();
  const chatInputRef = useRef<ChatInputHandle | null>(null);

  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
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
    async ({ text, files = [] }: { text: string; files?: ChatInputImageAttachment[] }) => {
      if (!chat || (!text.trim() && files.length === 0)) return;

      // Enrich context with mentioned tables
      const mentionedTables = getTableContextByMentions(text, connection!);
      const createdAt = Date.now();
      const messageId = uuidv7();

      // Update context builder to include mentioned tables
      ChatContext.setBuilder(() => ({
        database: currentDatabase,
        tables: [...(availableTables || []), ...(mentionedTables || [])],
        ...getDatabaseContextFromConnection(connection),
      }));

      sendMessage({
        id: messageId,
        role: "user",
        parts: [
          ...(text.trim().length > 0 ? [{ type: "text" as const, text }] : []),
          ...files.map((file) => ({
            type: "file" as const,
            mediaType: file.mediaType,
            url: file.url,
            filename: file.filename,
          })),
        ],
        metadata: {
          createdAt,
        },
      });
    },
    [chat, sendMessage, connection, currentDatabase, availableTables]
  );

  // Expose send and getInput to parent component via imperative handle
  useImperativeHandle(
    ref,
    () => ({
      send: async (text: string) => {
        await handleSubmit({ text });
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
        handleSubmit({ text: question.text });
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
        handleSubmit({ text: input.text });
        return;
      }
      setPromptInput(input.text);
    },
    [handleSubmit]
  );

  const handleStop = useCallback(() => {
    ChatFactory.stopClientTools(chat.id);
    stop();
  }, [chat.id, stop]);

  return (
    <ChatActionProvider
      onAction={handleUserAction}
      onToolOutput={({ tool, toolCallId, output }) =>
        chat.addToolOutput({
          tool: tool as never,
          toolCallId,
          output: output as never,
        })
      }
      chatId={chat.id}
    >
      <ChatCommandProvider>
        <div className="flex flex-col h-full bg-background overflow-hidden relative">
          {isEmpty ? (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 flex flex-col">
              <div className="flex flex-col items-center w-full max-w-full my-auto pb-8 pt-4">
                <div className="mb-0">
                  <AppLogo width={64} height={64} />
                </div>
                <p className="text-xl text-center font-medium mb-0 mt-0">{greeting}</p>
                <SampleQuestions onQuestionClick={handleQuestionClick} />
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
            onStop={handleStop}
            isRunning={isRunning}
            hasMessages={messages.length > 0}
            tokenUsage={tokenUsage}
            onNewChat={onNewChat}
            externalInput={promptInput}
          />
        </div>
      </ChatCommandProvider>
    </ChatActionProvider>
  );
});

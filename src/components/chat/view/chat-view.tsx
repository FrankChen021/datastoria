"use client";

import { useConnection } from "@/components/connection/connection-context";
import type { AppUIMessage } from "@/lib/ai/chat-types";
import "@/lib/number-utils"; // Ensure formatTimeDiff is available

import { useChat, type Chat } from "@ai-sdk/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { ChatActionProvider, type UserActionInput } from "../chat-action-context";
import { ChatContext, getDatabaseContextFromConnection } from "../chat-context";
import { ChatFactory } from "../chat-factory";
import {
  ChatInput,
  type ChatInputHandle,
  type ChatInputImageAttachment,
} from "../input/chat-input";
import { getTableContextByMentions } from "../input/mention-utils";
import { ChatMessageList } from "../message/chat-message-list";
import { SampleQuestions } from "./sample-questions";
import { type ChatComposerInput } from "./use-chat-panel";
import { useTokenUsage } from "./use-token-usage";

interface ChatViewProps {
  chat: Chat<AppUIMessage>;
  onClose?: () => void;
  onNewChat?: () => void;
  currentDatabase?: string;
  availableTables?: Array<{
    name: string;
    columns: Array<{ name: string; type: string }> | string[];
  }>;
  externalInput?: ChatComposerInput;
  onStreamingChange?: (isRunning: boolean) => void;
}

export interface ChatViewHandle {
  send: (text: string) => void;
  getInput: () => string;
  focus: () => void;
}

export const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(function ChatView(
  { chat, onNewChat, currentDatabase, availableTables, externalInput, onStreamingChange },
  ref
) {
  const { connection } = useConnection();
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const [promptInput, setPromptInput] = useState<ChatComposerInput | undefined>(externalInput);

  // Update promptInput when externalInput changes
  useEffect(() => {
    if (externalInput !== undefined) {
      setPromptInput(externalInput);
      return;
    }
    setPromptInput(undefined);
  }, [chat.id, externalInput]);
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
        setPromptInput({ text: question.text, mode: "replace", nonce: Date.now() });
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
      setPromptInput({ text: input.text, mode: "replace", nonce: Date.now() });
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
      <div className="flex flex-col h-full bg-background overflow-hidden relative">
        {isEmpty ? (
          <SampleQuestions onQuestionClick={handleQuestionClick} />
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
    </ChatActionProvider>
  );
});

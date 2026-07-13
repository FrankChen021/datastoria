"use client";

import { useConnection } from "@/components/connection/connection-context";
import type { AppUIMessage } from "@/lib/ai/ai-types";
import { MentionContext } from "@/lib/ai/mention-context";
import "@/lib/number-utils"; // Ensure formatTimeDiff is available

import { useChat, type Chat } from "@ai-sdk/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { v7 as uuidv7 } from "uuid";
import { ChatActionProvider, type UserActionInput } from "../chat-action-context";
import { ChatContext, getDatabaseContextFromConnection } from "../chat-context";
import { ChatFactory } from "../chat-factory";
import {
  ChatInput,
  type ChatInputHandle,
  type ChatInputImageAttachment,
} from "../input/chat-input";
import { ChatMessageList } from "../message/chat-message-list";
import { SampleQuestions } from "./sample-questions";
import { type ChatComposerInput } from "./use-chat-panel";
import { useTokenUsage } from "./use-token-usage";

const CHAT_STREAM_UPDATE_THROTTLE_MS = 50;

function useStableCallback<Args extends unknown[], Return>(
  callback: (...args: Args) => Return
): (...args: Args) => Return {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: Args) => callbackRef.current(...args), []);
}

interface ChatViewProps {
  chat: Chat<AppUIMessage>;
  onClose?: () => void;
  onNewChat?: () => void;
  currentDatabase?: string;
  externalInput?: ChatComposerInput;
  onStreamingChange?: (isRunning: boolean) => void;
}

export interface ChatViewHandle {
  send: (text: string) => void;
  getInput: () => string;
  focus: () => void;
}

export const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(function ChatView(
  { chat, onNewChat, currentDatabase, externalInput, onStreamingChange },
  ref
) {
  const { connection } = useConnection();
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const [promptInput, setPromptInput] = useState<ChatComposerInput | undefined>(externalInput);
  const promptInputNonceRef = useRef(0);

  // Update promptInput when externalInput changes
  useEffect(() => {
    if (externalInput !== undefined) {
      setPromptInput(externalInput);
      return;
    }
    setPromptInput(undefined);
  }, [chat.id, externalInput]);
  const { messages, error, sendMessage, status, stop } = useChat({
    chat,
    experimental_throttle: CHAT_STREAM_UPDATE_THROTTLE_MS,
  });

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

  const handleSubmit = useStableCallback(
    async ({ text, files = [] }: { text: string; files?: ChatInputImageAttachment[] }) => {
      if (!chat || (!text.trim() && files.length === 0)) return;

      const mentionMetadata = connection ? MentionContext.toMetadata(text, connection) : undefined;
      const createdAt = Date.now();
      const messageId = uuidv7();

      ChatContext.setBuilder(() => ({
        database: currentDatabase,
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
          ...(mentionMetadata ? { mentionMetadata } : {}),
        },
      });
    }
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

  const tokenUsage = useTokenUsage(isRunning ? undefined : (messages as AppUIMessage[]));

  const isEmpty = !messages || messages.length === 0;

  const createPromptInput = useCallback((text: string): ChatComposerInput => {
    return { text, mode: "replace", nonce: ++promptInputNonceRef.current };
  }, []);

  const handleQuestionClick = useStableCallback((question: { text: string; autoRun?: boolean }) => {
    if (question.autoRun) {
      // Auto-run: send the message immediately
      handleSubmit({ text: question.text });
    } else {
      // Default: set the input for user to review/edit
      setPromptInput(createPromptInput(question.text));
    }
  });

  const handleUserAction = useStableCallback((input: UserActionInput) => {
    if (input.autoRun) {
      handleSubmit({ text: input.text });
      return;
    }
    setPromptInput(createPromptInput(input.text));
  });

  const handleStop = useStableCallback(() => {
    ChatFactory.stopClientTools(chat.id);
    stop();
  });

  const handleToolOutput = useStableCallback(
    async ({ tool, toolCallId, output }: { tool: string; toolCallId: string; output: unknown }) => {
      await chat.addToolOutput({
        tool: tool as never,
        toolCallId,
        output: output as never,
      });
    }
  );

  return (
    <ChatActionProvider
      onAction={handleUserAction}
      onToolOutput={handleToolOutput}
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

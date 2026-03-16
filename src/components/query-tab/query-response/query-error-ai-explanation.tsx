"use client";

import { ChatFactory } from "@/components/chat/chat-factory";
import { ChatMessage } from "@/components/chat/message/chat-message";
import { useConnection } from "@/components/connection/connection-context";
import type { AppUIMessage } from "@/lib/ai/chat-types";
import { useChat, type Chat } from "@ai-sdk/react";
import { AlertCircle } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { buildExplainErrorPrompt } from "./explain-error-prompt";

interface QueryErrorAIExplanationProps {
  queryId: string;
  errorMessage: string;
  errorCode?: string;
  sql?: string;
}

const SHOW_AUTO_EXPLAIN_TOOL_CHROME = process.env.NODE_ENV === "development";

function getVisibleAssistantMessage(message: AppUIMessage): AppUIMessage | null {
  if (SHOW_AUTO_EXPLAIN_TOOL_CHROME) {
    return message;
  }

  const visibleParts = message.parts.filter(
    (part) => part.type === "text" || part.type === "reasoning"
  );

  if (visibleParts.length === 0) {
    return null;
  }

  return {
    ...message,
    parts: visibleParts,
  };
}

const InlineAutoExplainChat = memo(function InlineAutoExplainChat({
  chat,
  prompt,
  queryId,
}: {
  chat: Chat<AppUIMessage>;
  prompt: string;
  queryId: string;
}) {
  const { messages, error, sendMessage, status, stop } = useChat({ chat });
  const sentKeyRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hasRequested, setHasRequested] = useState(false);

  useEffect(() => {
    if (sentKeyRef.current === queryId) {
      return;
    }

    sentKeyRef.current = queryId;
    setHasRequested(true);
    sendMessage({
      id: uuidv7(),
      role: "user",
      parts: [{ type: "text", text: prompt }],
      metadata: { createdAt: Date.now() },
    });
  }, [prompt, queryId, sendMessage]);

  useEffect(() => {
    return () => {
      ChatFactory.stopClientTools(chat.id);
      stop();
    };
  }, [chat.id, stop]);

  const assistantMessages = useMemo(() => {
    const responseMessages = messages
      .filter((message) => message.role === "assistant")
      .map(getVisibleAssistantMessage)
      .filter((message): message is AppUIMessage => message !== null);

    if (responseMessages.length > 0 || !hasRequested || error) {
      return responseMessages;
    }

    return [
      {
        id: `auto-explain-loading-${queryId}`,
        role: "assistant",
        parts: [],
        createdAt: new Date(),
      } as AppUIMessage,
    ];
  }, [messages, hasRequested, error, queryId]);

  const isRunning = status === "submitted" || status === "streaming";

  useEffect(() => {
    const node = bottomRef.current;
    if (!node) {
      return;
    }

    requestAnimationFrame(() => {
      node.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }, [assistantMessages, error, isRunning]);

  if (!hasRequested && !isRunning && assistantMessages.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 overflow-hidden">
      {assistantMessages.map((message, index) => (
        <div key={message.id}>
          <ChatMessage
            message={message}
            isFirst={index === 0}
            isLast={index === assistantMessages.length - 1}
            isLoading={isRunning && index === assistantMessages.length - 1}
            isRunning={isRunning && index === assistantMessages.length - 1}
            loadingText={`AI is diagnosing this error...`}
          />
        </div>
      ))}

      {error && (
        <div className="mt-3 p-3 bg-destructive/10 border border-destructive rounded-md flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-sm text-destructive/90">{error.message}</div>
        </div>
      )}
      <div ref={bottomRef} className="h-px" />
    </div>
  );
});

export const QueryErrorAIExplanation = memo(function QueryErrorAIExplanation({
  queryId,
  errorMessage,
  errorCode,
  sql,
}: QueryErrorAIExplanationProps) {
  const { connection } = useConnection();
  const [chat, setChat] = useState<Chat<AppUIMessage> | null>(null);

  const prompt = useMemo(
    () =>
      buildExplainErrorPrompt({
        errorMessage,
        errorCode,
        sql,
      }),
    [errorCode, errorMessage, sql]
  );

  useEffect(() => {
    let cancelled = false;

    if (!connection?.metadata.internalUser) {
      setChat(null);
      return;
    }

    void (async () => {
      const createdChat = await ChatFactory.createEphemeral({
        connection,
        context: {
          currentQuery: sql,
          clickHouseUser: connection.metadata.internalUser,
        },
      });

      if (cancelled) {
        ChatFactory.stopClientTools(createdChat.id);
        return;
      }

      setChat(createdChat);
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, queryId, sql]);

  if (!chat) {
    return null;
  }

  return <InlineAutoExplainChat chat={chat} prompt={prompt} queryId={queryId} />;
});

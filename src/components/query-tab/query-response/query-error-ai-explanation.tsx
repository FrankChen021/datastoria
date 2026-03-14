"use client";

import { AppLogo } from "@/components/app-logo";
import { ChatFactory } from "@/components/chat/chat-factory";
import { ChatMessage } from "@/components/chat/message/chat-message";
import { useConnection } from "@/components/connection/connection-context";
import {
  AgentConfigurationManager,
} from "@/components/settings/agent/agent-manager";
import { TypingDots } from "@/components/ui/typing-dots";
import type { AppUIMessage } from "@/lib/ai/chat-types";
import { buildExplainErrorPrompt } from "@/lib/ai/explain-error-prompt";
import { cn } from "@/lib/utils";
import { useChat, type Chat } from "@ai-sdk/react";
import { AlertCircle } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { isAutoExplainClickHouseErrorBlacklisted } from "./query-error-auto-explain-config";

interface QueryErrorAIExplanationProps {
  errorMessage: string;
  errorCode?: string;
  sql?: string;
}

const AUTO_EXPLAIN_MESSAGE_STYLE = "";

function InlineAssistantLoading() {
  return (
    <div className={cn(AUTO_EXPLAIN_MESSAGE_STYLE, "p-3")}>
      <div className="flex gap-[1px]">
        <div className="self-stretch w-1 flex-shrink-0 bg-emerald-400 dark:bg-emerald-500" />
        <div className="flex-1 flex gap-[1px] min-w-0">
          <div className="flex-shrink-0 w-[28px] flex justify-center">
            <div className="h-6 w-6 flex items-center justify-center">
              <AppLogo className="h-6 w-6" />
            </div>
          </div>
          <div className="flex-1 overflow-hidden min-w-0 text-sm pr-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>AI is explaining this error</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-muted-foreground">
              <TypingDots />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const InlineAutoExplainChat = memo(function InlineAutoExplainChat({
  chat,
  prompt,
  requestKey,
}: {
  chat: Chat<AppUIMessage>;
  prompt: string;
  requestKey: string;
}) {
  const { messages, error, sendMessage, status, stop } = useChat({ chat });
  const sentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (sentKeyRef.current === requestKey) {
      return;
    }

    sentKeyRef.current = requestKey;
    sendMessage({
      id: uuidv7(),
      role: "user",
      parts: [{ type: "text", text: prompt }],
      metadata: { createdAt: Date.now() },
    });
  }, [prompt, requestKey, sendMessage]);

  useEffect(() => {
    return () => {
      ChatFactory.stopClientTools(chat.id);
      stop();
    };
  }, [chat.id, stop]);

  const assistantMessages = useMemo(
    () => messages.filter((message) => message.role === "assistant"),
    [messages]
  );
  const isRunning = status === "submitted" || status === "streaming";

  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        AI Explanation
      </div>
      <div className="overflow-hidden">
        {assistantMessages.map((message, index) => (
          <div key={message.id} className={AUTO_EXPLAIN_MESSAGE_STYLE}>
            <ChatMessage
              message={message}
              isFirst={index === 0}
              isLast={index === assistantMessages.length - 1}
              isLoading={isRunning && index === assistantMessages.length - 1}
              isRunning={isRunning && index === assistantMessages.length - 1}
            />
          </div>
        ))}

        {assistantMessages.length === 0 && isRunning && <InlineAssistantLoading />}

        {error && (
          <div className="mt-3 p-3 bg-destructive/10 border border-destructive rounded-md flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm text-destructive/90">{error.message}</div>
          </div>
        )}
      </div>
    </div>
  );
});

export const QueryErrorAIExplanation = memo(function QueryErrorAIExplanation({
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

  const requestKey = useMemo(
    () => `${String(errorCode ?? "")}:${errorMessage}:${sql ?? ""}`,
    [errorCode, errorMessage, sql]
  );

  const isEligible =
    Boolean(AgentConfigurationManager.getConfiguration().autoExplainClickHouseErrors) &&
    Boolean(connection?.metadata.internalUser) &&
    Boolean(errorCode) &&
    !isAutoExplainClickHouseErrorBlacklisted(errorCode);

  useEffect(() => {
    let cancelled = false;

    if (!isEligible || !connection?.metadata.internalUser) {
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
  }, [connection, isEligible, requestKey, sql]);

  if (!isEligible || !chat) {
    return null;
  }

  return <InlineAutoExplainChat chat={chat} prompt={prompt} requestKey={requestKey} />;
});

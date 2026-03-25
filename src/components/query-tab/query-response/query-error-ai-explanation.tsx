"use client";

import { getDatabaseContextFromConnection } from "@/components/chat/chat-context";
import { ChatFactory } from "@/components/chat/chat-factory";
import { ChatMessage } from "@/components/chat/message/chat-message";
import { SessionManager } from "@/components/chat/session/session-manager";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import {
  AgentConfigurationManager,
  normalizeAutoExplainLanguage,
} from "@/components/settings/agent/agent-manager";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AppUIMessage, Message } from "@/lib/ai/chat-types";
import type { AutoExplainNegativeReasonCode } from "@/lib/ai/session/feedback-events";
import { BasePath } from "@/lib/base-path";
import { useChat, type Chat } from "@ai-sdk/react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  SparklesIcon,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { buildExplainErrorPrompt } from "./explain-error-prompt";

interface QueryErrorAIExplanationProps {
  queryId: string;
  errorMessage: string;
  errorCode?: string;
  sql?: string;
}

const NEGATIVE_REASON_OPTIONS: Array<{
  value: AutoExplainNegativeReasonCode;
  label: string;
}> = [
  { value: "wrong_diagnosis", label: "Wrong diagnosis" },
  { value: "too_vague", label: "Too vague" },
  { value: "unsafe_fix", label: "Unsafe fix" },
  { value: "missing_context", label: "Missing context" },
  { value: "other", label: "Other" },
];

function resolveStoredMessageCreatedAt(message: AppUIMessage): Date {
  if (message.createdAt) {
    const createdAt = new Date(message.createdAt);
    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt;
    }
  }

  if (typeof message.metadata?.createdAt === "number") {
    const metadataCreatedAt = new Date(message.metadata.createdAt);
    if (!Number.isNaN(metadataCreatedAt.getTime())) {
      return metadataCreatedAt;
    }
  }

  return new Date();
}

function toStoredConversationMessages(messages: AppUIMessage[]): Message[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const createdAt = resolveStoredMessageCreatedAt(message);
      const updatedAt =
        message.updatedAt && !Number.isNaN(new Date(message.updatedAt).getTime())
          ? new Date(message.updatedAt)
          : createdAt;

      return {
        id: message.id,
        role: message.role,
        parts: message.parts as Message["parts"],
        metadata: message.metadata,
        createdAt,
        updatedAt,
      };
    });
}

function buildRecoveryDraftInput({
  reasonCode,
  freeText,
}: {
  reasonCode: AutoExplainNegativeReasonCode | null;
  freeText: string | null;
}) {
  return [
    "This inline diagnosis did not solve the problem.",
    reasonCode ? `What was off: ${reasonCode}.` : null,
    freeText ? `Extra context: ${freeText}` : null,
    "Can you help me continue debugging from the conversation above?",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRecoverySessionTitle(errorCode?: string): string {
  return errorCode ? `error ${errorCode} diagnosis` : "Inline error diagnosis";
}

const AutoExplainFeedback = memo(function AutoExplainFeedback({
  sessionId,
  assistantMessageId,
  queryId,
  errorCode,
  sql,
  onClose,
  conversationMessages,
  connectionId,
}: {
  sessionId: string;
  assistantMessageId: string;
  queryId: string;
  errorCode?: string;
  sql?: string;
  onClose?: () => void;
  conversationMessages: AppUIMessage[];
  connectionId: string;
}) {
  const { requestNewChat, selectChat, setDisplayMode, setInitialInput } = useChatPanel();
  const [selectedSolved, setSelectedSolved] = useState<boolean | null>(null);
  const [selectedReason, setSelectedReason] = useState<AutoExplainNegativeReasonCode | null>(null);
  const [freeText, setFreeText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [continuationSessionId, setContinuationSessionId] = useState<string | null>(null);
  const isSubmitted = savedMessage !== null && submitError === null;

  useEffect(() => {
    setSelectedSolved(null);
    setSelectedReason(null);
    setFreeText("");
    setIsSubmitting(false);
    setSubmitError(null);
    setSavedMessage(null);
    setRecoveryNotice(null);
    setContinuationSessionId(null);
  }, [assistantMessageId]);

  const persistFeedback = async (
    solved: boolean,
    recoveryActionTaken = false
  ): Promise<boolean> => {
    if (isSubmitting) {
      return false;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSavedMessage(null);

    try {
      const response = await fetch(BasePath.getURL("/api/ai/chat/feedback/auto-explain"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "auto_explain_error",
          sessionId,
          messageId: assistantMessageId,
          solved,
          reasonCode: solved ? null : selectedReason,
          freeText: solved ? null : freeText,
          recoveryActionTaken,
          payload: {
            queryId,
            errorCode: errorCode ?? null,
            sql: sql ?? null,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to record feedback");
      }

      setSelectedSolved(solved);
      if (solved) {
        setSelectedReason(null);
        setFreeText("");
      }
      setSavedMessage(
        solved
          ? "Thanks, we will use this feedback to improve auto explain."
          : "Thanks, we captured what was off so we can improve this diagnosis."
      );
      return true;
    } catch {
      setSubmitError("Could not save feedback. Please try again.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePositiveSubmit = async () => {
    setSelectedSolved(true);
    setSelectedReason(null);
    setFreeText("");
    await persistFeedback(true);
  };

  const handleNegativeStart = () => {
    setSelectedSolved(false);
    setSavedMessage(null);
    setSubmitError(null);
  };

  const handleNegativeSubmit = async () => {
    if (!selectedReason) {
      setSubmitError("Choose what was off before sending feedback.");
      return;
    }

    if (selectedReason === "other" && !freeText.trim()) {
      setSubmitError("Add a short note so we know what was off.");
      return;
    }

    await persistFeedback(false);
  };

  const handleRecovery = async () => {
    setRecoveryNotice(null);
    const feedbackSaved = await persistFeedback(false, true);
    const draftInput = buildRecoveryDraftInput({
      reasonCode: selectedReason,
      freeText: freeText.trim() || null,
    });

    if (continuationSessionId) {
      selectChat(continuationSessionId);
      setDisplayMode("panel");
      setInitialInput(draftInput, continuationSessionId);
      setRecoveryNotice(
        feedbackSaved
          ? "Reopened this Ask AI diagnosis so you can continue the conversation."
          : "Reopened this Ask AI diagnosis. Your feedback was not saved yet, so you can retry after this."
      );
      return;
    }

    try {
      const createdSession = await SessionManager.createSessionFromMessages(
        connectionId,
        toStoredConversationMessages(conversationMessages),
        buildRecoverySessionTitle(errorCode),
        sessionId
      );
      setContinuationSessionId(createdSession.chatId);
      selectChat(createdSession.chatId);
      setDisplayMode("panel");
      setInitialInput(draftInput, createdSession.chatId);
      setRecoveryNotice(
        feedbackSaved
          ? "Opened this diagnosis in Ask AI so you can continue the conversation."
          : "Opened this diagnosis in Ask AI. Your feedback was not saved yet, so you can retry after this."
      );
      return;
    } catch {
      requestNewChat();
      setDisplayMode("panel");
      setInitialInput(draftInput);

      if (!feedbackSaved) {
        setRecoveryNotice(
          "Opened a new Ask AI draft. Your feedback was not saved yet, so you can retry after this."
        );
      } else {
        setRecoveryNotice(
          "Opened a new Ask AI draft because we could not continue the inline session."
        );
      }
    }
  };

  return (
    <div className="flex gap-[1px]">
      <div className={"self-stretch w-1 flex-shrink-0 bg-emerald-400 dark:bg-emerald-500"} />

      <div className="relative flex flex-col flex-1 min-w-0  rounded-md border border-border/60 bg-muted/30 p-3 ml-1">
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        <div className="text-sm font-medium text-foreground">Did this solve the problem?</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Your feedback helps us improve inline error diagnosis without leaving this query.
        </div>
        {!isSubmitted && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 px-3"
              variant={selectedSolved === true ? "default" : "outline"}
              disabled={isSubmitting}
              onClick={() => void handlePositiveSubmit()}
            >
              {isSubmitting && selectedSolved === true ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ThumbsUp />
              )}
              Yes
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-3"
              variant={selectedSolved === false ? "default" : "outline"}
              disabled={isSubmitting}
              onClick={handleNegativeStart}
            >
              <ThumbsDown />
              No
            </Button>
          </div>
        )}

        {!isSubmitted && selectedSolved === false && (
          <div className="mt-3 space-y-3">
            <div className="text-sm text-foreground">
              Tell us what was off so we can improve this diagnosis.
            </div>
            <div className="flex flex-wrap gap-2">
              {NEGATIVE_REASON_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  className="h-8 px-3"
                  variant={selectedReason === option.value ? "default" : "outline"}
                  disabled={isSubmitting}
                  onClick={() => {
                    setSelectedReason(option.value);
                    setSubmitError(null);
                    setSavedMessage(null);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {selectedReason && (
              <Textarea
                value={freeText}
                onChange={(event) => setFreeText(event.target.value)}
                placeholder={
                  selectedReason === "other"
                    ? "Tell us what was off"
                    : "Optional details for the team reviewing this diagnosis"
                }
                maxLength={2000}
                className="h-24 resize-none"
              />
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 px-3"
                disabled={isSubmitting || !selectedReason}
                onClick={() => void handleNegativeSubmit()}
              >
                {isSubmitting ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
                Send feedback
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 px-3"
                variant="outline"
                disabled={isSubmitting || !selectedReason}
                onClick={() => void handleRecovery()}
              >
                <SparklesIcon />
                Continue the diagnosis conversation with more context
              </Button>
            </div>
          </div>
        )}

        {savedMessage && (
          <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {savedMessage}
          </div>
        )}
        {submitError && <div className="mt-2 text-sm text-destructive">{submitError}</div>}
        {recoveryNotice && (
          <div className="mt-2 text-sm text-muted-foreground">{recoveryNotice}</div>
        )}
      </div>
    </div>
  );
});

const InlineAutoExplainChat = memo(function InlineAutoExplainChat({
  chat,
  prompt,
  queryId,
  errorCode,
  sql,
  connectionId,
}: {
  chat: Chat<AppUIMessage>;
  prompt: string;
  queryId: string;
  errorCode?: string;
  sql?: string;
  connectionId: string;
}) {
  const { messages, error, sendMessage, status, stop } = useChat({ chat });
  const sentKeyRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hasRequested, setHasRequested] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);

  useEffect(() => {
    if (sentKeyRef.current === queryId) {
      return;
    }

    sentKeyRef.current = queryId;
    setHasRequested(true);
    setFeedbackDismissed(false);
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
    const responseMessages = messages.filter((message) => message.role === "assistant");

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
  const lastAssistantMessage = assistantMessages.at(-1);

  useEffect(() => {
    const node = bottomRef.current;
    if (!node || typeof node.scrollIntoView !== "function") {
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
      {lastAssistantMessage && !isRunning && !error && !feedbackDismissed && (
        <AutoExplainFeedback
          sessionId={chat.id}
          assistantMessageId={lastAssistantMessage.id}
          queryId={queryId}
          errorCode={errorCode}
          sql={sql}
          onClose={() => setFeedbackDismissed(true)}
          conversationMessages={messages}
          connectionId={connectionId}
        />
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

  const autoExplainLanguage = normalizeAutoExplainLanguage(
    AgentConfigurationManager.getConfiguration().autoExplainLanguage
  );

  const prompt = useMemo(
    () =>
      buildExplainErrorPrompt({
        errorMessage,
        errorCode,
        sql,
        language: autoExplainLanguage,
      }),
    [errorCode, errorMessage, sql, autoExplainLanguage]
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
        initialMessages: [],
        context: getDatabaseContextFromConnection(connection),
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

  if (!chat || !connection) {
    return null;
  }

  return (
    <InlineAutoExplainChat
      chat={chat}
      prompt={prompt}
      queryId={queryId}
      errorCode={errorCode}
      sql={sql}
      connectionId={connection.connectionId}
    />
  );
});

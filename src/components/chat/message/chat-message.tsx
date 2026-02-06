import { AppLogo } from "@/components/app-logo";
import { TypingDots } from "@/components/ui/typing-dots";
import { UserProfileImage } from "@/components/user-profile-image";
import type { AppUIMessage, ToolPart } from "@/lib/ai/chat-types";
import { CLIENT_TOOL_NAMES } from "@/lib/ai/tools/client/client-tools";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import type { LanguageModelUsage } from "ai";
import { Info } from "lucide-react";
import { memo } from "react";
import { ErrorMessageDisplay } from "./message-error";
import { MessageMarkdown } from "./message-markdown";
import { MessageReasoning } from "./message-reasoning";
import { MessageToolCollectSqlOptimizationEvidence } from "./message-tool-collect-sql-optimization-evidence";
import { MessageToolExecuteSql } from "./message-tool-execute-sql";
import { MessageToolExploreSchema } from "./message-tool-explore-schema";
import { MessageToolGeneral } from "./message-tool-general";
import { MessageToolGenerateSql } from "./message-tool-generate-sql";
import { MessageToolGenerateVisualization } from "./message-tool-generate-visualization";
import { MessageToolGetTables } from "./message-tool-get-tables";
import { MessageToolPlan } from "./message-tool-plan";
import { MessageToolSkill } from "./message-tool-skill";
import { MessageToolValidateSql } from "./message-tool-validate-sql";
import { MessageUser } from "./message-user";

/**
 * Display token usage information per message.
 * Uses LanguageModelUsage (non-deprecated fields).
 */
const TokenUsageDisplay = memo(function TokenUsageDisplay({
  id,
  usage,
}: {
  id: string;
  usage: LanguageModelUsage | null | undefined;
}) {
  if (usage == null) {
    return null;
  }

  const total = usage.totalTokens ?? 0;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const reasoning = usage.outputTokenDetails?.reasoningTokens ?? 0;
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;

  const show = total > 0 || input > 0 || output > 0 || reasoning > 0 || cacheRead > 0;
  if (!show) return null;
  return (
    <div
      data-message-id={id}
      className="flex gap-1 items-center mt-1 gap-1 bg-muted/30 rounded-md text-[10px] text-muted-foreground"
    >
      <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center">
        <Info className="h-3 w-3" />
      </div>
      <div className="flex items-center gap-1">
        <span className="font-medium">Tokens:</span>
        <span className="">
          <NumberFlow value={total} />
        </span>

        <span className="font-medium">; Input Tokens:</span>
        <span className="">
          <NumberFlow value={input} />
        </span>

        <span className="font-medium">; Output Tokens:</span>
        <span className="">
          <NumberFlow value={output} />
        </span>

        {reasoning > 0 && (
          <>
            <span className="font-medium">; Reasoning Tokens:</span>
            <span className="">
              <NumberFlow value={reasoning} />
            </span>
          </>
        )}

        {cacheRead > 0 && (
          <>
            <span className="font-medium">; Cached Input Tokens:</span>
            <span className="">
              <NumberFlow value={cacheRead} />
            </span>
          </>
        )}
      </div>
    </div>
  );
});

/**
 * Render a single message part
 */
const ChatMessagePart = memo(
  function ChatMessagePart({
    part,
    isUser,
    isRunning = true,
    messageId,
  }: {
    part: AppUIMessage["parts"][0];
    isUser: boolean;
    isRunning?: boolean;
    messageId?: string;
  }) {
    if (part.type === "text") {
      if (isUser) {
        return <MessageUser text={part.text} />;
      }
      return (
        <MessageMarkdown
          text={part.text}
          customStyle={{ fontSize: "0.9rem", lineHeight: "1.6" }}
          messageId={messageId}
        />
      );
    }
    if (part.type === "reasoning") {
      return <MessageReasoning part={part} />;
    }

    // Handle tool calls and responses
    let toolName: string | undefined;
    if (part.type === "dynamic-tool") {
      toolName = (part as ToolPart).toolName;
    } else if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      toolName = part.type.replace("tool-", "");
    }

    // SERVER TOOLS
    if (toolName === SERVER_TOOL_NAMES.GENERATE_SQL) {
      return <MessageToolGenerateSql part={part} isRunning={isRunning} />;
    } else if (toolName === SERVER_TOOL_NAMES.GENERATE_VISUALIZATION) {
      return <MessageToolGenerateVisualization part={part} isRunning={isRunning} />;
    } else if (toolName === SERVER_TOOL_NAMES.PLAN) {
      return <MessageToolPlan part={part} isRunning={isRunning} />;
    } else if (toolName === SERVER_TOOL_NAMES.SKILL) {
      return <MessageToolSkill part={part} isRunning={isRunning} />;
    }
    // CLIENT TOOLS
    else if (toolName === CLIENT_TOOL_NAMES.EXECUTE_SQL) {
      return <MessageToolExecuteSql part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.VALIDATE_SQL) {
      return <MessageToolValidateSql part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.EXPLORE_SCHEMA) {
      return <MessageToolExploreSchema part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.GET_TABLES) {
      return <MessageToolGetTables part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.COLLECT_SQL_OPTIMIZATION_EVIDENCE) {
      return <MessageToolCollectSqlOptimizationEvidence part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.FIND_EXPENSIVE_QUERIES) {
      return (
        <MessageToolGeneral toolName={"Find Expensive Queries"} part={part} isRunning={isRunning} />
      );
    }
    // GENERAL TOOLS
    else if (toolName) {
      return <MessageToolGeneral toolName={toolName} part={part} isRunning={isRunning} />;
    }

    return null;
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if the part actually changed
    if (prevProps.messageId !== nextProps.messageId) return false;
    if (prevProps.isUser !== nextProps.isUser) return false;
    if (prevProps.isRunning !== nextProps.isRunning) return false;
    if (prevProps.part === nextProps.part) return true;
    // For tool parts, compare by toolCallId and state
    const prevPart = prevProps.part as ToolPart;
    const nextPart = nextProps.part as ToolPart;
    if (prevPart.toolCallId && nextPart.toolCallId) {
      return prevPart.toolCallId === nextPart.toolCallId && prevPart.state === nextPart.state;
    }
    // For text parts, compare by text content
    if (prevPart.type === "text" && nextPart.type === "text") {
      return (
        (prevProps.part as { text: string }).text === (nextProps.part as { text: string }).text
      );
    }
    return false;
  }
);

interface ChatMessageProps {
  message: AppUIMessage;
  isLoading?: boolean;
  isFirst?: boolean; // Whether this is a new user request (needs top spacing)
  isLast?: boolean; // Whether this is the last message in a sequence
  isRunning?: boolean;
}
/**
 * Render a single message with session styling and visualization
 */
export const ChatMessage = memo(function ChatMessage({
  message,
  isLoading = false,
  isFirst = false,
  isRunning = true,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const timestamp = message.createdAt ? new Date(message.createdAt).getTime() : Date.now();
  const parts = message.parts || [];
  const error = (message as { error?: Error }).error;

  const showLoading = !isUser && isLoading;
  return (
    <div className={cn(isUser && !isFirst ? "mt-3 border-t" : "", isUser ? "py-1" : "")}>
      {/* Timestamp above profile for user messages - reserve space for alignment */}
      {isUser && timestamp && (
        <h4 className="px-3 py-2 text-sm font-semibold">
          {DateTimeExtension.toYYYYMMddHHmmss(new Date(timestamp))}
        </h4>
      )}

      <div className="flex gap-[1px]">
        {/* Left color bar to distinguish user vs assistant messages */}
        <div
          className={cn(
            "self-stretch w-1 flex-shrink-0",
            isUser ? "bg-sky-400 dark:bg-sky-500" : "bg-emerald-400 dark:bg-emerald-500"
          )}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Profile and message row - aligned at top */}
          <div className="flex gap-[1px]">
            <div className="flex-shrink-0 w-[28px] flex justify-center">
              {isUser ? (
                <UserProfileImage />
              ) : (
                <div className="h-6 w-6 flex items-center justify-center">
                  <AppLogo className="h-6 w-6" />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden min-w-0 text-sm pr-6">
              {parts.length === 0 && isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  {/* Under the state that request is submitted, but server has not responded yet */}
                  <span>Thinking</span>
                </div>
              )}
              {parts.length === 0 && !isLoading && !error && "Nothing returned"}
              {parts.map((part: AppUIMessage["parts"][0], i: number) => (
                <ChatMessagePart
                  key={i}
                  part={part}
                  isUser={isUser}
                  isRunning={isRunning}
                  messageId={message.id}
                />
              ))}
              {error && <ErrorMessageDisplay errorText={error.message || String(error)} />}
              {showLoading && (
                <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                  <TypingDots />
                </div>
              )}
            </div>
          </div>

          {/* Token usage row - enclosed by color bar, left-aligned with profile section */}
          {!isUser && (
            <div className="flex flex-1 min-w-0 pr-6">
              <TokenUsageDisplay
                id={message.id + "-usage"}
                usage={message.metadata?.usage as LanguageModelUsage | undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

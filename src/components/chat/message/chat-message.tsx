import { AppLogo } from "@/components/app-logo";
import { TypingDots } from "@/components/ui/typing-dots";
import { UserProfileImage } from "@/components/user-profile-image";
import { SERVER_TOOL_PLAN } from "@/lib/ai/agent/plan/planning-agent";
import { SERVER_TOOL_GENERATE_SQL } from "@/lib/ai/agent/sql-generation-agent";
import { SERVER_TOOL_GENEREATE_VISUALIZATION } from "@/lib/ai/agent/visualization-agent";
import type { AppUIMessage, TokenUsage, ToolPart } from "@/lib/ai/chat-types";
import { CLIENT_TOOL_NAMES } from "@/lib/ai/tools/client/client-tools";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
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
import { MessageToolValidateSql } from "./message-tool-validate-sql";
import { MessageUser } from "./message-user";

/**
 * Display token usage information per message
 */
const TokenUsageDisplay = memo(function TokenUsageDisplay({
  id,
  usage,
}: {
  id: string;
  usage: TokenUsage;
}) {
  const show =
    usage.totalTokens > 0 ||
    usage.inputTokens > 0 ||
    usage.outputTokens > 0 ||
    usage.reasoningTokens > 0 ||
    usage.cachedInputTokens > 0;
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
          <NumberFlow value={usage.totalTokens} />
        </span>

        <span className="font-medium">; Input Tokens:</span>
        <span className="">
          <NumberFlow value={usage.inputTokens} />
        </span>

        <span className="font-medium">; Output Tokens:</span>
        <span className="">
          <NumberFlow value={usage.outputTokens} />
        </span>

        {usage.reasoningTokens != null && usage.reasoningTokens > 0 && (
          <>
            <span className="font-medium">; Reasoning Tokens:</span>
            <span className="">
              <NumberFlow value={usage.reasoningTokens} />
            </span>
          </>
        )}

        {usage.cachedInputTokens != null && usage.cachedInputTokens > 0 && (
          <>
            <span className="font-medium">; Cached Input Tokens:</span>
            <span className="">
              <NumberFlow value={usage.cachedInputTokens} />
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
  }: {
    part: AppUIMessage["parts"][0];
    isUser: boolean;
    isRunning?: boolean;
  }) {
    if (part.type === "text") {
      if (isUser) {
        return <MessageUser text={part.text} />;
      }
      return (
        <MessageMarkdown text={part.text} customStyle={{ fontSize: "0.9rem", lineHeight: "1.6" }} />
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

    if (toolName === SERVER_TOOL_GENERATE_SQL) {
      return <MessageToolGenerateSql part={part} isRunning={isRunning} />;
    } else if (toolName === SERVER_TOOL_GENEREATE_VISUALIZATION) {
      return <MessageToolGenerateVisualization part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.EXECUTE_SQL) {
      return <MessageToolExecuteSql part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.VALIDATE_SQL) {
      return <MessageToolValidateSql part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.EXPLORE_SCHEMA) {
      return <MessageToolExploreSchema part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.GET_TABLES) {
      return <MessageToolGetTables part={part} isRunning={isRunning} />;
    } else if (toolName === CLIENT_TOOL_NAMES.COLLECT_SQL_OPTIMIZATION_EVIDENCE) {
      return <MessageToolCollectSqlOptimizationEvidence part={part} isRunning={isRunning} />;
    } else if (toolName === SERVER_TOOL_PLAN) {
      return <MessageToolPlan part={part} isRunning={isRunning} />;
    } else if (toolName) {
      return <MessageToolGeneral toolName={toolName} part={part} isRunning={isRunning} />;
    }

    return null;
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if the part actually changed
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
  const msgRecord = message as unknown as Record<string, unknown>;
  const timestamp = msgRecord.createdAt
    ? new Date(msgRecord.createdAt as string | number).getTime()
    : Date.now();
  const parts = message.parts || [];
  const metadata = msgRecord.metadata as Record<string, unknown> | undefined;
  const usage = metadata?.usage as TokenUsage | undefined;
  const error = msgRecord.error as Error | undefined;

  const showLoading = !isUser && isLoading;
  return (
    <div
      className={cn(isUser && !isFirst ? "mt-3 border-t" : "", isUser ? "bg-gray-800 py-1" : "")}
    >
      <div className="pl-2 py-1">
        {/* Timestamp above profile for user messages - reserve space for alignment */}
        {isUser && timestamp && (
          <h4 className="text-sm font-semibold mb-2">
            {DateTimeExtension.toYYYYMMddHHmmss(new Date(timestamp))}
          </h4>
        )}

        {/* Profile and message row - aligned at top */}
        <div className="flex gap-1">
          <div className="flex-shrink-0 w-[28px]">
            {isUser ? (
              <UserProfileImage />
            ) : (
              <div className="h-6 w-6 flex items-center justify-center">
                <AppLogo className={`h-6 w-6 }`} />
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
              <ChatMessagePart key={i} part={part} isUser={isUser} isRunning={isRunning} />
            ))}
            {error && <ErrorMessageDisplay errorText={error.message || String(error)} />}
            {showLoading && (
              <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                <TypingDots />
              </div>
            )}
          </div>
        </div>

        {!isUser && usage && <TokenUsageDisplay id={message.id + "-usage"} usage={usage} />}
      </div>
    </div>
  );
});

import { TypingDots } from "@/components/ui/typing-dots";
import { UserProfileImage } from "@/components/user-profile-image";
import { SERVER_TOOL_PLAN } from "@/lib/ai/agent/planner-agent";
import { SERVER_TOOL_GENERATE_SQL } from "@/lib/ai/agent/sql-generation-agent";
import { SERVER_TOOL_GENEREATE_VISUALIZATION } from "@/lib/ai/agent/visualization-agent";
import type { AppUIMessage, TokenUsage } from "@/lib/ai/common-types";
import { CLIENT_TOOL_NAMES } from "@/lib/ai/tools/client/client-tools";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { Info, Sparkles } from "lucide-react";
import { memo } from "react";
import type { ToolPart } from "../chat-message-types";
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
  function ChatMessagePart({ part, isUser }: { part: AppUIMessage["parts"][0]; isUser: boolean }) {
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
      return <MessageToolGenerateSql part={part} />;
    } else if (toolName === SERVER_TOOL_GENEREATE_VISUALIZATION) {
      return <MessageToolGenerateVisualization part={part} />;
    } else if (toolName === CLIENT_TOOL_NAMES.EXECUTE_SQL) {
      return <MessageToolExecuteSql part={part} />;
    } else if (toolName === CLIENT_TOOL_NAMES.VALIDATE_SQL) {
      return <MessageToolValidateSql part={part} />;
    } else if (toolName === CLIENT_TOOL_NAMES.EXPLORE_SCHEMA) {
      return <MessageToolExploreSchema part={part} />;
    } else if (toolName === CLIENT_TOOL_NAMES.GET_TABLES) {
      return <MessageToolGetTables part={part} />;
    } else if (toolName === CLIENT_TOOL_NAMES.COLLECT_SQL_OPTIMIZATION_EVIDENCE) {
      return <MessageToolCollectSqlOptimizationEvidence part={part} />;
    } else if (toolName === SERVER_TOOL_PLAN) {
      return <MessageToolPlan part={part} />;
    } else if (toolName) {
      return <MessageToolGeneral toolName={toolName} part={part} />;
    }

    return null;
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if the part actually changed
    if (prevProps.isUser !== nextProps.isUser) return false;
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
}
/**
 * Render a single message with session styling and visualization
 */
export const ChatMessage = memo(function ChatMessage({
  message,
  isLoading = false,
  isFirst = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const msgRecord = message as unknown as Record<string, unknown>;
  const timestamp = msgRecord.createdAt
    ? new Date(msgRecord.createdAt as string | number).getTime()
    : Date.now();
  const parts = message.parts || [];
  const metadata = msgRecord.metadata as Record<string, unknown> | undefined;
  const usage = (metadata?.usage || msgRecord.usage) as TokenUsage | undefined;
  const error = msgRecord.error as Error | undefined;

  const showLoading = !isUser && isLoading;
  return (
    <div
      className={cn(
        isUser && !isFirst ? "pt-3" : "py-1",
        // Add border as separator, the SAME style as it's in the query-list-item-view.tsx
        isUser && !isFirst ? "border-t" : ""
      )}
    >
      <div className="pl-2 py-1">
        {/* Timestamp above profile for user messages - reserve space for alignment */}
        {isUser && timestamp && (
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
            {DateTimeExtension.toYYYYMMddHHmmss(new Date(timestamp))}
          </h4>
        )}

        {/* Profile and message row - aligned at top */}
        <div className="flex gap-1">
          <div className="flex-shrink-0">
            {isUser ? (
              <UserProfileImage />
            ) : (
              <div className="h-6 w-6 flex items-center justify-center">
                <Sparkles className={`h-4 w-4 }`} />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden min-w-0 text-sm pr-6">
            {parts.length === 0 && isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Thinking</span>
              </div>
            )}
            {parts.length === 0 && !isLoading && !error && "Nothing returned"}
            {parts.map((part, i) => (
              <ChatMessagePart key={i} part={part} isUser={isUser} />
            ))}
            {error && <ErrorMessageDisplay errorText={error.message || String(error)} />}
            {showLoading && (
              <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                <TypingDots />
              </div>
            )}
          </div>
        </div>

        {/* Show the token even when it's loading */}
        {!isUser && usage && <TokenUsageDisplay id={message.id + "-usage"} usage={usage} />}
      </div>
    </div>
  );
});

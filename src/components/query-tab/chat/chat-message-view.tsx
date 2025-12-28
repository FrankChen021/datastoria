import { UserProfileImage } from "@/components/user-profile-image";
import { CLIENT_TOOL_NAMES } from "@/lib/ai/client-tools";
import type { AppUIMessage, TokenUsage, ToolPart } from "@/lib/ai/common-types";
import { SERVER_TOOL_NAMES } from "@/lib/ai/server-tools";
import { colorGenerator } from "@/lib/color-generator";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import { Info, Sparkles } from "lucide-react";
import { memo } from "react";
import type { ChatMessage } from "../query-list-view";
import { ErrorMessageDisplay } from "./message-error";
import { MessageMarkdown } from "./message-markdown";
import { MessageReasoning } from "./message-reasoning";
import { MessageToolExecuteSql } from "./message-tool-execute-sql";
import { MessageToolGeneral } from "./message-tool-general";
import { MessageToolGenerateSql } from "./message-tool-generate-sql";
import { MessageToolGenerateVisualization } from "./message-tool-generate-visualization";
import { MessageToolGetTableColumns } from "./message-tool-get-table-columns";
import { MessageToolGetTables } from "./message-tool-get-tables";
import { MessageToolValidateSql } from "./message-tool-validate-sql";

/**
 * Display token usage information per message
 */
const TokenUsageDisplay = memo(function TokenUsageDisplay({ usage }: { usage: TokenUsage }) {
  return (
    <div className="flex gap-1 items-center mt-1 gap-1 bg-muted/30 rounded-md text-[10px] text-muted-foreground">
      <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center">
        <Info className="h-3 w-3" />
      </div>
      <div className="flex items-center gap-1">
        <span className="font-medium">Tokens:</span>
        <span className="">{usage.totalTokens.toLocaleString()}, </span>

        <span className="font-medium">Input Tokens:</span>
        <span className="">{usage.inputTokens.toLocaleString()}, </span>

        <span className="font-medium">Output Tokens:</span>
        <span className="">{usage.outputTokens.toLocaleString()}</span>

        {usage.reasoningTokens != null && usage.reasoningTokens > 0 && (
          <>
            <span className="font-medium">| Reasoning Tokens:</span>
            <span className="">{usage.reasoningTokens.toLocaleString()}</span>
          </>
        )}

        {usage.cachedInputTokens != null && usage.cachedInputTokens > 0 && (
          <>
            <span className="font-medium">| Cached Input Tokens:</span>
            <span className="">{usage.cachedInputTokens.toLocaleString()}</span>
          </>
        )}
      </div>
    </div>
  );
});

/**
 * Render a single message part
 */
function ChatMessagePart({ part }: { part: AppUIMessage["parts"][0] }) {
  if (part.type === "text") {
    return <MessageMarkdown text={part.text} />;
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

  if (toolName === SERVER_TOOL_NAMES.GENERATE_SQL) {
    return <MessageToolGenerateSql part={part} />;
  } else if (toolName === SERVER_TOOL_NAMES.GENEREATE_VISUALIZATION) {
    return <MessageToolGenerateVisualization part={part} />;
  } else if (toolName === CLIENT_TOOL_NAMES.EXECUTE_SQL) {
    return <MessageToolExecuteSql part={part} />;
  } else if (toolName === CLIENT_TOOL_NAMES.VALIDATE_SQL) {
    return <MessageToolValidateSql part={part} />;
  } else if (toolName === CLIENT_TOOL_NAMES.GET_TABLE_COLUMNS) {
    return <MessageToolGetTableColumns part={part} />;
  } else if (toolName === CLIENT_TOOL_NAMES.GET_TABLES) {
    return <MessageToolGetTables part={part} />;
  } else if (toolName) {
    return <MessageToolGeneral toolName={toolName} part={part} />;
  }

  return null;
}

interface ChatMessageViewProps {
  message: ChatMessage;
  isFirst?: boolean; // Whether this is a new user request (needs top spacing)
  isLast?: boolean; // Whether this is the last message in a sequence
}
/**
 * Render a single message with session styling and visualization
 */
export const ChatMessageView = memo(function ChatMessageView({
  message,
  isFirst = false,
  isLast = false,
}: ChatMessageViewProps) {
  // Get session colors from color generator
  const sessionColor = message.sessionId ? colorGenerator.getColor(message.sessionId) : null;
  const sessionStyles = sessionColor
    ? {
        borderLeftColor: sessionColor.foreground,
      }
    : {};

  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "py-3 border-l-4 transition-colors",
        // Add border as separator, the SAME style as it's in the query-list-item-view.tsx
        isUser && !isFirst ? "border-t" : ""
      )}
      style={sessionStyles}
    >
      <div className="pl-2 py-1">
        {/* Timestamp above profile for user messages - reserve space for alignment */}
        {isUser && message.timestamp && (
          <div className="text-[10px] text-muted-foreground font-medium whitespace-nowrap pl-1">
            {DateTimeExtension.toYYYYMMddHHmmss(new Date(message.timestamp))}
          </div>
        )}

        {/* Profile and message row - aligned at top */}
        <div className="flex gap-1">
          <div className="flex-shrink-0">
            {isUser ? (
              <UserProfileImage />
            ) : (
              <div className="h-6 w-6 flex items-center justify-center">
                <Sparkles
                  className={`h-4 w-4 ${isLast && message.isLoading ? "animate-spin" : ""}`}
                  style={isLast && message.isLoading ? { animationDuration: "2s" } : undefined}
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden min-w-0 mt-1">
            <div className="text-sm">
              {message.parts.length === 0 && message.isLoading && "Thinking..."}
              {message.parts.length === 0 && !message.isLoading && !message.error && "Nothing returned"}
              {message.parts.map((part, i) => (
                <ChatMessagePart key={i} part={part} />
              ))}
              {message.error && <ErrorMessageDisplay errorText={message.error.message || String(message.error)} />}
            </div>
          </div>
        </div>

        {!isUser && message.usage && !message.isLoading && <TokenUsageDisplay usage={message.usage} />}
      </div>
    </div>
  );
});

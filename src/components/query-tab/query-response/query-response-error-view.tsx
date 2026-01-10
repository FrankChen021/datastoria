import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { parseErrorLocation, type ErrorLocation } from "@/lib/clickhouse-error-parser";
import { AlertCircleIcon, SparklesIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { useChatPanel } from "../../chat/view/use-chat-panel";

export interface QueryErrorDisplay {
  message: string;
  data: unknown;
  httpHeaders?: Record<string, string>;
}

interface ErrorLocationViewProps {
  errorLocation: ErrorLocation;
}

const ErrorLocationView = memo(function ErrorLocationView({
  errorLocation,
}: ErrorLocationViewProps) {
  const codeString = useMemo(() => {
    return errorLocation.contextLines
      .map((line) => {
        const linePrefix = `${String(line.lineNum).padStart(4, " ")} | `;
        let text = `${linePrefix}${line.content}`;
        if (line.isErrorLine) {
          const pointerPrefix = `${" ".repeat(4)} | `;
          const pointer = `${" ".repeat(errorLocation.caretPosition)}^${errorLocation.message ? ` ${errorLocation.message}` : ""}`;
          text += `\n${pointerPrefix}${pointer}`;
        }
        return text;
      })
      .join("\n");
  }, [errorLocation]);

  return (
    <div className="mb-3">
      <div className="my-2 font-medium">
        Error Context: Line {errorLocation.lineNumber}, Col {errorLocation.columnNumber}:
      </div>
      <div className="font-mono text-sm rounded overflow-hidden">
        <ThemedSyntaxHighlighter
          language="sql"
          customStyle={{ padding: 0, margin: 0, fontSize: "0.875rem" }}
        >
          {codeString}
        </ThemedSyntaxHighlighter>
      </div>
    </div>
  );
});

interface QueryResponseErrorViewProps {
  error: QueryErrorDisplay;
  sql?: string;
}

export const QueryResponseErrorView = memo(function QueryResponseErrorView({
  error,
  sql,
}: QueryResponseErrorViewProps) {
  const { postMessage } = useChatPanel();
  const clickHouseErrorCode = error.httpHeaders?.["x-clickhouse-exception-code"];

  // Memoize detailMessage computation
  const detailMessage = useMemo(() => {
    if (typeof error.data === "object" && error.data !== null) {
      return JSON.stringify(error.data, null, 2);
    }
    if (typeof error.data === "string") {
      return error.data;
    }
    return null;
  }, [error.data]);

  // Parse line and column for exception code 62 - memoized to avoid recalculation
  const errorLocation = useMemo(() => {
    return parseErrorLocation(clickHouseErrorCode, detailMessage, sql);
  }, [clickHouseErrorCode, detailMessage, sql]);

  const [showFullDetailMessage, setShowFullDetailMessage] = useState(false);
  const [isAskAIClicked, setIsAskAIClicked] = useState(false);

  // Memoize truncation logic
  const shouldTruncateDetailMessage = useMemo(
    () => errorLocation && detailMessage && detailMessage.length > 128,
    [errorLocation, detailMessage]
  );

  const displayDetailMessage = useMemo(
    () =>
      shouldTruncateDetailMessage && !showFullDetailMessage && detailMessage
        ? detailMessage.substring(0, 128)
        : detailMessage,
    [shouldTruncateDetailMessage, showFullDetailMessage, detailMessage]
  );

  // Handle "Ask AI to explain and fix" button click
  const handleAskAI = () => {
    // Build the message with SQL and error details
    const message = `I got an error when executing this SQL query. Please explain what went wrong in short and provide a fix.

### SQL
\`\`\`sql
${sql}
\`\`\`

### Error Message
${detailMessage}
`;

    // Post message to the global chat panel
    postMessage(message, { forceNewChat: true });

    // Hide the button after clicking
    setIsAskAIClicked(true);
  };

  return (
    <Alert variant="destructive" className="border-0 p-1 text-destructive">
      <div className="flex items-center gap-2">
        <AlertCircleIcon className="h-4 w-4" />
        <AlertTitle className="mb-0">{error.message}</AlertTitle>
      </div>
      <AlertDescription className="mt-2 gap-2">
        {detailMessage && detailMessage.length > 0 && (
          <div className="whitespace-pre-wrap overflow-x-auto font-medium bg-muted/50 dark:bg-muted/30">
            {displayDetailMessage}
            {shouldTruncateDetailMessage && !showFullDetailMessage && (
              <>
                {" "}
                <span
                  className="text-primary underline cursor-pointer hover:text-primary/80 font-mono inline"
                  onClick={() => setShowFullDetailMessage(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setShowFullDetailMessage(true);
                    }
                  }}
                >
                  ...
                </span>
              </>
            )}
          </div>
        )}
        {errorLocation && <ErrorLocationView errorLocation={errorLocation} />}
        {detailMessage && detailMessage.length > 0 && sql && sql.length > 0 && !isAskAIClicked && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAskAI}
              className="gap-2 rounded-sm text-primary bg-primary/10 hover:bg-primary/20 hover:text-primary border-primary/50 font-semibold animate-pulse"
            >
              <SparklesIcon className="h-4 w-4" />
              Ask AI About This Error
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
});

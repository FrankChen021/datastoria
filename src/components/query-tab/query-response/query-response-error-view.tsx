import { AskAIButton } from "@/components/shared/ask-ai-button";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseErrorLocation, type ErrorLocation } from "@/lib/clickhouse/clickhouse-error-parser";
import { AlertCircleIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { QueryErrorDisplay } from "../query-view-model";

interface ErrorLocationViewProps {
  errorLocation: ErrorLocation;
}

const ErrorLocationView = memo(function ErrorLocationView({
  errorLocation,
}: ErrorLocationViewProps) {
  const codeString = useMemo(() => {
    return errorLocation.contextLines
      .map((line) => {
        let text = `${line.content}`;
        if (line.isErrorLine) {
          const errorLength = errorLocation.errorLength ?? 1;
          const pointer = `${" ".repeat(errorLocation.caretPosition)}${"^".repeat(errorLength)}${errorLocation.message ? ` --- ${errorLocation.message}` : ""}`;
          text += `\n${pointer}`;
        }
        return text;
      })
      .join("\n");
  }, [errorLocation]);

  // Determine the starting line number for the snippet
  const startLineNumber = errorLocation.contextLines[0]?.lineNum ?? 1;

  return (
    <div className="mb-3">
      <div className="my-2 font-medium">
        Error Context: Line {errorLocation.lineNumber}, Col {errorLocation.columnNumber}:
      </div>
      <div className="font-mono text-sm rounded-sm overflow-hidden border bg-background">
        <ThemedSyntaxHighlighter
          language="sql"
          showLineNumbers={true}
          startingLineNumber={startLineNumber}
          wrapLines={true}
          customStyle={{
            padding: "0.5rem",
            margin: 0,
            fontSize: "0.875rem",
            lineHeight: "1.5",
          }}
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
  const clickHouseErrorCode = error.exceptionCode;

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

  return (
    <Alert variant="destructive" className="border-0 p-1 text-destructive">
      <div className="flex items-center gap-2">
        <AlertCircleIcon className="h-4 w-4" />
        <AlertTitle className="mb-0">{error.message}</AlertTitle>
      </div>
      <AlertDescription className="mt-2 gap-2">
        {errorLocation && <ErrorLocationView errorLocation={errorLocation} />}
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
        {detailMessage && detailMessage.length > 0 && sql && sql.length > 0 && (
          <div className="mt-3">
            <AskAIButton sql={sql} errorMessage={detailMessage} hideAfterClick={true} />
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
});

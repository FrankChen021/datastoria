import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { parseErrorLocation, type ErrorLocation } from "@/lib/clickhouse/clickhouse-error-parser";
import { AlertCircleIcon, SparklesIcon } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { QueryErrorDisplay } from "../query-view-model";
import { QueryErrorAIExplanation } from "./query-error-ai-explanation";
import { AutoExplainState, getAutoExplainState } from "./query-error-auto-explain-config";

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
    <div className="mb-3 text-destructive">
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
  queryId: string;
  sql?: string;
  enableAutoExplanation?: boolean;
}

export const QueryResponseErrorView = memo(function QueryResponseErrorView({
  error,
  queryId,
  sql,
  enableAutoExplanation = false,
}: QueryResponseErrorViewProps) {
  const clickHouseErrorCode = error.exceptionCode;
  const [isManualExplainRequested, setIsManualExplainRequested] = useState(false);

  useEffect(() => {
    setIsManualExplainRequested(false);
  }, [queryId]);

  const autoExplainState = useMemo(
    () => getAutoExplainState(clickHouseErrorCode),
    [clickHouseErrorCode]
  );
  const shouldAutoExplain = enableAutoExplanation && autoExplainState === AutoExplainState.ENABLED;

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
    <Alert variant="default" className="border-0 p-1">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircleIcon className="h-4 w-4" />
        <AlertTitle className="mb-0">{error.message}</AlertTitle>
      </div>
      <AlertDescription className="mt-2 gap-2">
        {errorLocation && <ErrorLocationView errorLocation={errorLocation} />}
        {detailMessage && detailMessage.length > 0 && (
          <div className="whitespace-pre-wrap overflow-x-auto font-medium bg-muted/50 dark:bg-muted/30 text-destructive">
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
        {detailMessage &&
          detailMessage.length > 0 &&
          sql &&
          sql.length > 0 &&
          autoExplainState !== AutoExplainState.UNAVAILABLE && (
            <>
              {shouldAutoExplain || isManualExplainRequested ? (
                <QueryErrorAIExplanation
                  queryId={queryId}
                  errorMessage={detailMessage}
                  errorCode={clickHouseErrorCode}
                  sql={sql}
                />
              ) : (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsManualExplainRequested(true)}
                    className="gap-2 rounded-sm text-primary bg-primary/10 hover:bg-primary/20 hover:text-primary border-primary/50 font-semibold animate-pulse"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    Ask AI for Fix
                  </Button>
                </div>
              )}
            </>
          )}
      </AlertDescription>
    </Alert>
  );
});

import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnsiText, containsAnsiCodes } from "@/lib/ansi-parser";
import { parseErrorLocation, type ErrorLocation } from "@/lib/clickhouse-error-parser";
import { AlertCircleIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import type { QueryRequestViewModel, QueryResponseViewModel } from "../query-view-model";
import { ExplainASTResponseView } from "./explain-ast-response-view";
import { ExplainPipelineResponseView } from "./explain-pipeline-response-view";
import { ExplainQueryResponseView } from "./explain-query-response-view";
import { ExplainSyntaxResponseView } from "./explain-syntax-response-view";
import { QueryResponseHttpHeaderView } from "./query-response-http-header-view";

interface QueryResponseViewProps {
  queryResponse: QueryResponseViewModel;
  queryRequest: QueryRequestViewModel;
  isLoading?: boolean;
  sql?: string;
  view?: string;
}

export interface QueryErrorDisplay {
  message: string;
  data: unknown;
  httpHeaders?: Record<string, string>;
}

interface ErrorLocationViewProps {
  errorLocation: ErrorLocation;
}

const ErrorLocationView = memo(function ErrorLocationView({ errorLocation }: ErrorLocationViewProps) {
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
        <ThemedSyntaxHighlighter language="sql" customStyle={{ margin: 0, fontSize: "0.875rem" }}>
          {codeString}
        </ThemedSyntaxHighlighter>
      </div>
    </div>
  );
});

export function ApiErrorView({ error, sql }: { error: QueryErrorDisplay; sql?: string }) {
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
        <AlertCircleIcon />
        <AlertTitle className="mb-0">{error.message}</AlertTitle>
      </div>
      <AlertDescription className="mt-2">
        {detailMessage && detailMessage.length > 0 && (
          <div className="whitespace-pre-wrap overflow-x-auto font-mono text-xs bg-muted/50 dark:bg-muted/30">
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
      </AlertDescription>
    </Alert>
  );
}

export function QueryResponseView({
  queryResponse,
  queryRequest,
  isLoading = false,
  sql,
  view = "query",
}: QueryResponseViewProps) {
  const [selectedTab, setSelectedTab] = useState("result");

  // Memoize error object creation
  const error: QueryErrorDisplay | undefined = useMemo(
    () =>
      queryResponse.message === null
        ? undefined
        : {
            message: queryResponse.message as string,
            data: queryResponse.data,
            httpHeaders: queryResponse.httpHeaders,
          },
    [queryResponse.message, queryResponse.data, queryResponse.httpHeaders]
  );

  // Memoize response text computation
  const responseText = useMemo(
    () =>
      typeof queryResponse.data === "string" ? queryResponse.data : JSON.stringify(queryResponse.data, null, 2) || "",
    [queryResponse.data]
  );

  // Memoize response text
  const rawQueryResponse = useMemo(() => responseText, [responseText]);

  // Check if response contains ANSI color codes
  const hasAnsiCodes = useMemo(() => containsAnsiCodes(rawQueryResponse), [rawQueryResponse]);

  // Memoize response rendering based on view type
  const renderResponse = useMemo(() => {
    // Handle explain views
    if (view === "ast") {
      return <ExplainASTResponseView queryRequest={queryRequest} queryResponse={queryResponse} />;
    }

    if (view === "pipeline") {
      return <ExplainPipelineResponseView queryRequest={queryRequest} queryResponse={queryResponse} />;
    }

    if (view === "plan" || view === "estimate") {
      return <ExplainQueryResponseView queryRequest={queryRequest} queryResponse={queryResponse} />;
    }

    if (view === "syntax") {
      return <ExplainSyntaxResponseView queryRequest={queryRequest} queryResponse={queryResponse} />;
    }

    // Default query view rendering
    if (!rawQueryResponse || rawQueryResponse.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          Query was executed successfully. No data is returned to show.
        </div>
      );
    }

    // If response contains ANSI codes, render with ANSI parser
    if (hasAnsiCodes) {
      return <AnsiText>{rawQueryResponse}</AnsiText>;
    }

    return (
      <div className="relative group">
        <CopyButton
          value={rawQueryResponse}
          className="left-0 top-0 right-auto opacity-0 group-hover:opacity-100 transition-opacity"
        />
        <pre className="text-xs">{rawQueryResponse}</pre>
      </div>
    );
  }, [view, queryRequest, queryResponse, rawQueryResponse, hasAnsiCodes]);

  if (isLoading) {
    return (
      <div className="h-full w-full overflow-auto p-4 flex flex-col items-center justify-center">
        <div className="text-sm text-muted-foreground">Executing query...</div>
      </div>
    );
  }

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mt-2">
      <div className="w-full border-b bg-background">
        <TabsList className="inline-flex min-w-full justify-start rounded-none border-0 h-auto p-0 bg-transparent flex-nowrap">
          <TabsTrigger
            value="result"
            className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            Result
          </TabsTrigger>
          {queryResponse.httpHeaders && (
            <TabsTrigger
              value="headers"
              className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Response Headers
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      {error && (
        <TabsContent value="result">
          <ApiErrorView error={error} sql={sql} />
        </TabsContent>
      )}

      {!error && (
        <TabsContent value="result" className="overflow-auto">
          <div className="relative">{renderResponse}</div>
        </TabsContent>
      )}

      {queryResponse.httpHeaders && (
        <TabsContent value="headers" className="overflow-auto">
          <QueryResponseHttpHeaderView headers={queryResponse.httpHeaders} />
        </TabsContent>
      )}
    </Tabs>
  );
}

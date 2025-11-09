import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircleIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { QueryResponseHeaderView } from "./query-response-header-view";
import type { QueryResponseViewModel } from "./query-view-model";

interface QueryResponseViewProps {
  queryResponse: QueryResponseViewModel;
  isLoading?: boolean;
  sql?: string;
}

export interface ApiErrorResponse {
  errorMessage: string;
  data: unknown;
  httpHeaders?: Record<string, string>;
}

export function ApiErrorView({ error, sql }: { error: ApiErrorResponse; sql?: string }) {
  const clickHouseErrorCode = error.httpHeaders?.["x-clickhouse-exception-code"];
  const detailMessage =
    typeof error.data === "object" && error.data !== null
      ? JSON.stringify(error.data, null, 2)
      : typeof error.data === "string"
        ? error.data
        : null;

  // Parse line and column for exception code 62
  const parseErrorLocation = () => {
    if (clickHouseErrorCode !== "62" || !detailMessage || !sql) {
      return null;
    }

    // Extract line and column from pattern: (line 12, col 4)
    const match = detailMessage.match(/\(line\s+(\d+),\s*col\s+(\d+)\)/i);
    if (!match) {
      return null;
    }

    const lineNumber = parseInt(match[1], 10);
    const columnNumber = parseInt(match[2], 10);

    if (isNaN(lineNumber) || isNaN(columnNumber) || lineNumber < 1 || columnNumber < 1) {
      return null;
    }

    // Get the SQL lines
    const sqlLines = sql.split("\n");
    if (lineNumber > sqlLines.length) {
      return null;
    }

    // Calculate start line (3 lines before error line, or line 1 if error is too early)
    const startLine = Math.max(1, lineNumber - 3);
    // Calculate end line (3 lines after error line, or last line if error is too late)
    const endLine = Math.min(sqlLines.length, lineNumber + 3);

    // Build context lines with line numbers
    const contextLines: Array<{ lineNum: number; content: string; isErrorLine: boolean }> = [];
    for (let i = startLine; i <= endLine; i++) {
      const lineIndex = i - 1; // Convert to 0-based index
      const lineContent = sqlLines[lineIndex] || "";
      const isErrorLine = i === lineNumber;

      // For error line, show only first 50 characters if column is smaller than 50
      let displayContent = lineContent;
      if (isErrorLine && columnNumber <= 50) {
        displayContent = lineContent.substring(0, 50);
      }

      contextLines.push({
        lineNum: i,
        content: displayContent,
        isErrorLine,
      });
    }

    // Calculate caret position for error line
    const errorLineContent = contextLines.find((line) => line.isErrorLine)?.content || "";
    const caretPosition = Math.min(columnNumber - 1, errorLineContent.length - 1);

    return {
      lineNumber,
      columnNumber,
      contextLines,
      caretPosition,
    };
  };

  const errorLocation = parseErrorLocation();

  return (
    <Alert variant="destructive" className="border-0 p-3 text-yellow-900 dark:text-yellow-600">
      <div className="flex items-center gap-2">
        <AlertCircleIcon />
        <AlertTitle>{error.errorMessage}</AlertTitle>
      </div>
      <AlertDescription className="mt-2">
        {clickHouseErrorCode && (
          <div className="mb-2">
            ClickHouse Exception Code: <code className=" font-mono font-semibold">{clickHouseErrorCode}</code>
          </div>
        )}
        {errorLocation && (
          <div className="mb-3">
            <div className="mb-2 font-medium">
              Error location (line {errorLocation.lineNumber}, col {errorLocation.columnNumber}):
            </div>
            <div className="font-mono text-sm bg-muted/50 dark:bg-muted/30 p-3 rounded border border-yellow-400/40 dark:border-yellow-700/40">
              {errorLocation.contextLines.map((line, index) => (
                <div key={index}>
                  <div className="whitespace-pre">
                    <span className="text-muted-foreground mr-2 select-none">
                      {String(line.lineNum).padStart(4, " ")} |
                    </span>
                    <span className={line.isErrorLine ? "text-destructive" : ""}>{line.content}</span>
                  </div>
                  {line.isErrorLine && (
                    <div className="whitespace-pre text-destructive">
                      <span className="text-muted-foreground mr-2 select-none">
                        {String(errorLocation.lineNumber).padStart(4, " ")} |
                      </span>
                      <span>{" ".repeat(errorLocation.caretPosition)}^</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {detailMessage && detailMessage.length > 0 && (
          <div>
            <div className="mb-2 font-medium">Complete Response:</div>
            <pre className="whitespace-pre-wrap overflow-x-auto font-mono text-sm bg-muted/50 dark:bg-muted/30 p-3 rounded border border-yellow-400/40 dark:border-yellow-700/40">
              {detailMessage}
            </pre>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function QueryResponseView({ queryResponse, isLoading = false, sql }: QueryResponseViewProps) {
  const [selectedTab, setSelectedTab] = useState("result");

  if (isLoading) {
    return (
      <div className="h-full w-full overflow-auto p-4 flex flex-col items-center justify-center">
        <div className="text-sm text-muted-foreground">Executing query...</div>
      </div>
    );
  }

  const error: ApiErrorResponse | undefined =
    queryResponse.errorMessage === null
      ? undefined
      : {
          errorMessage: queryResponse.errorMessage as string,
          data: queryResponse.data,
          httpHeaders: queryResponse.httpHeaders,
        };

  const responseText =
    typeof queryResponse.data === "string" ? queryResponse.data : JSON.stringify(queryResponse.data, null, 2);

  const rawQueryResponse = queryResponse.formatter ? queryResponse.formatter(responseText) : responseText;

  const renderResponse = () => {
    if (rawQueryResponse.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          Query was executed successfully. No data is returned to show.
        </div>
      );
    }

    if (queryResponse.displayFormat === "sql") {
      return (
        <ThemedSyntaxHighlighter
          customStyle={{ fontSize: "14px", margin: 0, padding: "1rem" }}
          language="sql"
          showLineNumbers={true}
        >
          {rawQueryResponse}
        </ThemedSyntaxHighlighter>
      );
    } else {
      return <pre className="text-sm">{rawQueryResponse}</pre>;
    }
  };

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mt-2">
      <div className="w-full border-b bg-background">
        <TabsList className="inline-flex min-w-full justify-start rounded-none border-0 h-auto p-0 bg-transparent flex-nowrap">
          {error && (
            <TabsTrigger
              value="result"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Result
            </TabsTrigger>
          )}
          {!error && (
            <TabsTrigger
              value="result"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Result
            </TabsTrigger>
          )}
          {queryResponse.httpHeaders && (
            <TabsTrigger
              value="headers"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
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
          <div className="relative">{renderResponse()}</div>
        </TabsContent>
      )}

      {queryResponse.httpHeaders && (
        <TabsContent value="headers" className="overflow-auto">
          <QueryResponseHeaderView headers={queryResponse.httpHeaders} />
        </TabsContent>
      )}
    </Tabs>
  );
}

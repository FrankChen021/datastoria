import { useSqlExecution } from "@/components/chat/sql-execution-context";
import { useConnection } from "@/components/connection/connection-context";
import { QueryExecutionTimer } from "@/components/query-tab/query-execution-timer";
import { CopyButton } from "@/components/ui/copy-button";
import type { QueryError } from "@/lib/connection/connection";
import { StringUtils } from "@/lib/string-utils";
import { toastManager } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Loader2, Play, X } from "lucide-react";
import { memo, useRef, useState } from "react";
import { v7 as uuid } from "uuid";
import { QueryResponseView } from "../../query-tab/query-response/query-response-view";
import type { QueryResponseViewModel } from "../../query-tab/query-view-model";
import { ThemedSyntaxHighlighter } from "../../shared/themed-syntax-highlighter";
import { TabManager } from "../../tab-manager";
import { Button } from "../../ui/button";

interface MessageMarkdownSqlProps {
  code: string;
  language?: string;
  customStyle?: React.CSSProperties;
  showExecuteButton?: boolean;
  showLineNumbers?: boolean;
  expandable?: boolean;
}

export const MessageMarkdownSql = memo(function MessageMarkdownSql({
  code,
  language = "sql",
  customStyle,
  showExecuteButton = false,
  showLineNumbers,
  expandable = false,
}: MessageMarkdownSqlProps) {
  const { connection } = useConnection();
  const { executionMode } = useSqlExecution();
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryResponse, setQueryResponse] = useState<QueryResponseViewModel | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const queryResponseRef = useRef<HTMLDivElement>(null);

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!connection) {
      toastManager.show("No connection selected", "error");
      return;
    }

    if (executionMode === "tab") {
      TabManager.activateQueryTab({ query: code, execute: true, mode: "insert" });
      return;
    }

    // Inline Execution Logic
    setIsExecuting(true);
    setShowResults(true);

    try {
      const processedSQL = StringUtils.removeComments(code);
      const queryId = uuid();
      // Use JSON format for table view to enable DataTable rendering
      const { response } = connection.query(processedSQL, {
        query_id: queryId,
        default_format: "JSON",
        output_format_json_quote_64bit_integers: 0,
      });

      const apiResponse = await response;
      const responseData = await apiResponse.data.json();

      const responseModel: QueryResponseViewModel = {
        queryId: queryId,
        traceId: null,
        message: null,
        httpStatus: apiResponse.httpStatus,
        httpHeaders: apiResponse.httpHeaders,
        data: responseData,
      };

      setQueryResponse(responseModel);
      // Scroll to the query response after it's rendered
      requestAnimationFrame(() => {
        queryResponseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err: unknown) {
      const queryId = uuid();
      // Handle error
      const apiError = err as QueryError;
      const responseModel: QueryResponseViewModel = {
        queryId: queryId,
        traceId: null,
        message: apiError.message || String(err),
        httpStatus: apiError.httpStatus || 500,
        httpHeaders: apiError.httpHeaders,
        data: apiError.data || null,
      };
      setQueryResponse(responseModel);
      // Scroll to the query response after it's rendered
      requestAnimationFrame(() => {
        queryResponseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div
        className="relative rounded-none my-1 overflow-hidden group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Floating Actions */}
        <div
          className={`absolute top-1 right-2 flex items-center gap-1 z-10 transition-opacity duration-200`}
        >
          {showExecuteButton && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-5 w-5 opacity-60 hover:opacity-100 transition-all",
                isHovered || isExecuting ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
              onClick={handleRun}
              title={executionMode === "inline" ? "Run in place" : "Run in Query Tab"}
              disabled={isExecuting}
            >
              {isExecuting ? (
                <Loader2 className="!h-3 !w-3 animate-spin" />
              ) : (
                <Play className="!h-3 !w-3" />
              )}
            </Button>
          )}
          <CopyButton
            value={code}
            variant="ghost"
            size="icon"
            className={cn(
              "relative !top-auto !right-auto h-5 w-5 opacity-60 hover:opacity-100 transition-all",
              isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          />
        </div>

        <ThemedSyntaxHighlighter
          language={language}
          customStyle={{
            backgroundColor: "rgba(143, 153, 168, 0.15)",
            margin: 0,
            padding: "3px",
            fontSize: "0.800rem",
            lineHeight: "1.5",
            borderRadius: 0,
            ...customStyle,
          }}
          showLineNumbers={showLineNumbers}
          expandable={expandable}
        >
          {code}
        </ThemedSyntaxHighlighter>
      </div>

      {/* Inline Results */}
      {(queryResponse || isExecuting) && showResults && (
        <div
          ref={queryResponseRef}
          className="relative border rounded-sm overflow-hidden bg-background p-1"
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-5 w-5 opacity-60 hover:opacity-100 transition-all z-10"
            onClick={() => setShowResults(false)}
            title="Close results"
          >
            <X className="!h-3 !w-3" />
          </Button>
          {queryResponse && (
            <QueryResponseView
              queryResponse={queryResponse!}
              queryRequest={{
                sql: code,
                queryId: queryResponse!.queryId || uuid(),
                timestamp: Date.now(),
                // other mocks
                rawSQL: code,
                requestServer: "local",
                traceId: null,
                showRequest: "hide",
                params: {},
                onCancel: () => {},
              }}
              view="table"
            />
          )}
          <div className={cn(queryResponse ? "mt-5" : "")}>
            <QueryExecutionTimer isExecuting={isExecuting} />
          </div>
        </div>
      )}
    </div>
  );
});

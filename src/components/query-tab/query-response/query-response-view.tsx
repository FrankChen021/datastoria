import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import type {
  QueryErrorDisplay,
  QueryRequestViewModel,
  QueryResponseViewModel,
  QueryViewType,
} from "../query-view-model";
import { ExplainASTResponseView } from "./explain-ast-response-view";
import { ExplainPipelineResponseView } from "./explain-pipeline-response-view";
import { ExplainQueryResponseView } from "./explain-query-response-view";
import { ExplainSyntaxResponseView } from "./explain-syntax-response-view";
import { QueryResponseErrorView } from "./query-response-error-view";
import { QueryResponseHttpHeaderView } from "./query-response-http-header-view";
import { QueryResponseTableView } from "./query-response-table-view";
import { QueryResponseTextView } from "./query-response-text-view";

interface QueryResponseViewProps {
  queryResponse: QueryResponseViewModel;
  queryRequest: QueryRequestViewModel;
  isLoading?: boolean;
  sql?: string;
  view?: QueryViewType;
  tabId?: string;
}

export function QueryResponseView({
  queryResponse,
  queryRequest,
  isLoading = false,
  sql,
  view = "query",
  tabId: _tabId,
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
            exceptionCode: queryResponse.httpHeaders?.["x-clickhouse-exception-code"],
          },
    [queryResponse.message, queryResponse.data, queryResponse.httpHeaders]
  );

  if (isLoading) {
    return (
      <div className="h-full w-full overflow-auto p-4 flex flex-col items-center justify-center">
        <div className="text-sm text-muted-foreground">Executing query...</div>
      </div>
    );
  }

  // For EXPLAIN AST and Pipeline views, render their tabs directly at the top level
  // This avoids nested tabs (Result -> Graph/Text) and provides better UX
  if (view === "ast") {
    return (
      <ExplainASTResponseView
        queryRequest={queryRequest}
        queryResponse={queryResponse}
        error={error}
      />
    );
  }

  if (view === "pipeline") {
    return (
      <ExplainPipelineResponseView
        queryRequest={queryRequest}
        queryResponse={queryResponse}
        error={error}
      />
    );
  }

  // For all other views, use the standard Result + Response Headers tab structure
  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab}>
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
          <QueryResponseErrorView error={error} sql={sql} />
        </TabsContent>
      )}

      {!error && (
        <TabsContent value="result" className="overflow-auto mt-0">
          <div className="relative">
            {view === "table" ? (
              <QueryResponseTableView queryResponse={queryResponse} />
            ) : view === "plan" || view === "estimate" ? (
              <ExplainQueryResponseView queryRequest={queryRequest} queryResponse={queryResponse} />
            ) : view === "syntax" ? (
              <ExplainSyntaxResponseView
                queryRequest={queryRequest}
                queryResponse={queryResponse}
              />
            ) : (
              <QueryResponseTextView queryResponse={queryResponse} />
            )}
          </div>
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

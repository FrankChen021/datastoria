import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FileText, Loader2, Table } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryExecutor } from "../query-execution/query-executor";
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

type DisplayMode = "text" | "table";

export function QueryResponseView({
  queryResponse,
  queryRequest,
  isLoading = false,
  sql,
  view = "query",
  tabId: _tabId,
}: QueryResponseViewProps) {
  const [selectedTab, setSelectedTab] = useState("result");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("text");
  const { fetchTableData, sqlMessages } = useQueryExecutor();

  // Find loading state for this query
  const isLoadingTableData = useMemo(() => {
    const message = sqlMessages.find((m) => m.id === queryRequest.queryId);
    return message?.isLoadingTableData ?? false;
  }, [sqlMessages, queryRequest.queryId]);

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

  // Check if table view should be available (only for normal queries, not EXPLAIN)
  const canShowTableToggle = view === "query" && !error;

  // Handle display mode change
  const handleDisplayModeChange = useCallback(
    (value: string) => {
      if (!value) return;
      const newMode = value as DisplayMode;
      setDisplayMode(newMode);

      // Fetch table data if switching to table view and not already cached
      if (newMode === "table" && !queryResponse.tableData && !isLoadingTableData) {
        fetchTableData(queryRequest.queryId, queryRequest.sql);
      }
    },
    [
      fetchTableData,
      queryRequest.queryId,
      queryRequest.sql,
      queryResponse.tableData,
      isLoadingTableData,
    ]
  );

  // Auto-switch to table view once table data is loaded
  useEffect(() => {
    if (displayMode === "table" && queryResponse.tableData) {
      // Data is ready, no action needed
    }
  }, [displayMode, queryResponse.tableData]);

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
      <div className="w-full bg-background flex items-center justify-between">
        <TabsList className="inline-flex justify-start rounded-none border-0 h-auto p-0 bg-transparent flex-nowrap">
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

        {/* Text/Table toggle - only show for normal queries */}
        {canShowTableToggle && (
          <ToggleGroup
            type="single"
            value={displayMode}
            onValueChange={handleDisplayModeChange}
            className="h-7"
          >
            <ToggleGroupItem value="text" size="sm" className="h-7 w-7 p-0" title="Text view">
              <FileText className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="table"
              size="sm"
              className="h-7 w-7 p-0"
              title="Table view"
              disabled={isLoadingTableData}
            >
              {isLoadingTableData ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Table className="h-3.5 w-3.5" />
              )}
            </ToggleGroupItem>
          </ToggleGroup>
        )}
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
            ) : view === "plan" ? (
              <ExplainQueryResponseView queryRequest={queryRequest} queryResponse={queryResponse} />
            ) : view === "syntax" ? (
              <ExplainSyntaxResponseView
                queryRequest={queryRequest}
                queryResponse={queryResponse}
              />
            ) : view === "query" && displayMode === "table" ? (
              // Table view for normal query (with cached tableData)
              isLoadingTableData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading table data...</span>
                </div>
              ) : queryResponse.tableData ? (
                <QueryResponseTableView
                  queryResponse={{ ...queryResponse, data: queryResponse.tableData }}
                />
              ) : (
                <div className="py-4 text-sm text-muted-foreground">
                  Click the table icon to load table view.
                </div>
              )
            ) : (
              // Normal SQL Response and EXPLAIN ESTIMATE (text view)
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

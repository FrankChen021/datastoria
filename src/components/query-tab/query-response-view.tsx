import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import type { QueryResponseViewModel } from "./query-view-model";

interface QueryResponseViewProps {
  queryResponse: QueryResponseViewModel;
  isLoading?: boolean;
}

interface ApiErrorResponse {
  errorMessage: string;
  data: unknown;
  httpHeaders?: Record<string, string>;
}

function ApiErrorView({ error }: { error: ApiErrorResponse }) {
  return (
    <div className="text-sm text-destructive p-4">
      <pre className="whitespace-pre-wrap">{error.errorMessage}</pre>
    </div>
  );
}

export function QueryResponseView({ queryResponse, isLoading = false }: QueryResponseViewProps) {
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
      return <pre className="p-1 text-sm whitespace-pre-wrap mb-0">{rawQueryResponse}</pre>;
    }
  };

  const renderResponseHeadersTab = () => {
    const headers = queryResponse.httpHeaders;
    if (!headers) {
      return null;
    }

    return (
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2 whitespace-nowrap">Name</th>
            <th className="text-left p-2 whitespace-nowrap">Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(headers).map(([key, value], index) => (
            <tr key={index} className="border-b">
              <td className="p-2 whitespace-nowrap">{key}</td>
              <td className="p-2">{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mt-2">
      <TabsList>
        {error && <TabsTrigger value="result">Result</TabsTrigger>}
        {!error && rawQueryResponse && <TabsTrigger value="result">Result</TabsTrigger>}
        {queryResponse.httpHeaders && <TabsTrigger value="headers">Response Headers</TabsTrigger>}
      </TabsList>

      {error && (
        <TabsContent value="result">
          <ApiErrorView error={error} />
        </TabsContent>
      )}

      {!error && rawQueryResponse && (
        <TabsContent value="result" className="overflow-auto">
          <div className="relative">{renderResponse()}</div>
        </TabsContent>
      )}

      {queryResponse.httpHeaders && (
        <TabsContent value="headers" className="overflow-auto">
          {renderResponseHeadersTab()}
        </TabsContent>
      )}
    </Tabs>
  );
}

import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { memo } from "react";
import type { QueryResponseViewProps } from "../query-view-model";

const ExplainSyntaxResponseViewComponent = ({
  queryRequest: _queryRequest,
  queryResponse,
}: QueryResponseViewProps) => {
  const text =
    typeof queryResponse.data === "string"
      ? queryResponse.data
      : queryResponse.data !== undefined
        ? JSON.stringify(queryResponse.data, null, 4)
        : "";

  if (!text || text.trim().length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No syntax explanation available. The query syntax is valid.
      </div>
    );
  }

  return (
    <div className="mt-2">
      <ThemedSyntaxHighlighter
        showLineNumbers={true}
        customStyle={{
          backgroundColor: "rgba(143, 153, 168, 0.15)",
          fontSize: "14px",
          margin: 0,
          padding: "1rem",
        }}
        language="sql"
      >
        {text}
      </ThemedSyntaxHighlighter>
    </div>
  );
};

export const ExplainSyntaxResponseView = memo(ExplainSyntaxResponseViewComponent);

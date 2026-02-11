import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { CopyButton } from "@/components/ui/copy-button";
import type { QueryRequestViewModel } from "./query-view-model";

interface QueryRequestViewProps {
  queryRequest: QueryRequestViewModel;
}

export function QueryRequestView({ queryRequest }: QueryRequestViewProps) {
  const sql = queryRequest.sql ?? "";

  return (
    <div className="query-request">
      <div className="relative group">
        <CopyButton
          value={sql}
          className="left-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity"
        />
        <ThemedSyntaxHighlighter
          showLineNumbers={true}
          customStyle={{
            backgroundColor: "rgba(143, 153, 168, 0.15)",
            fontSize: "14px",
            margin: 0,
            padding: "6px",
          }}
          language="sql"
          expandable={true}
        >
          {sql}
        </ThemedSyntaxHighlighter>
      </div>
    </div>
  );
}

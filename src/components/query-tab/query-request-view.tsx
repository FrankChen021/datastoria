import { Button } from "@/components/ui/button";
import { toastManager } from "@/lib/toast";
import { Copy } from "lucide-react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { solarizedDark } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import type { QueryRequestViewModel } from "./query-view-model";

interface QueryRequestViewProps {
  queryRequest: QueryRequestViewModel;
}

export function QueryRequestView({ queryRequest }: QueryRequestViewProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(queryRequest.sql);
      toastManager.show("SQL copied to clipboard", "success");
    } catch (err) {
      console.error("Failed to copy text: ", err);
      toastManager.show("Failed to copy SQL to clipboard", "error");
    }
  };

  return (
    <div className="query-request border-b pb-2 mb-2">
      <div className="relative group">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
          onClick={handleCopy}
        >
          <Copy className="h-3 w-3" />
        </Button>
        <SyntaxHighlighter
          showLineNumbers={true}
          customStyle={{
            backgroundColor: "rgba(143, 153, 168, 0.15)",
            fontSize: "14px",
            margin: 0,
          }}
          language="sql"
          style={solarizedDark}
        >
          {queryRequest.sql}
        </SyntaxHighlighter>
      </div>
      {queryRequest.queryId && (
        <pre className="text-xs text-muted-foreground mt-2 mb-0">
          Query Id: {queryRequest.queryId}
          {queryRequest.traceId && `, Trace Id: ${queryRequest.traceId}`}
        </pre>
      )}
      <pre className="text-xs text-muted-foreground mt-0 mb-0">Request Server: {queryRequest.requestServer}</pre>
    </div>
  );
}

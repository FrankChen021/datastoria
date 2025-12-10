import { Button } from "@/components/ui/button";
import { toastManager } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { solarizedDark } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import type { QueryRequestViewModel } from "./query-view-model";

interface QueryRequestViewProps {
  queryRequest: QueryRequestViewModel;
}

interface CopyButtonProps {
  value: string;
  className?: string;
}

function CopyButton({ value, className }: CopyButtonProps) {
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (hasCopied) {
      const timeout = setTimeout(() => {
        setHasCopied(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [hasCopied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setHasCopied(true);
    } catch {
      toastManager.show("Failed to copy to clipboard", "error");
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "absolute right-2 top-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6",
        className
      )}
      onClick={handleCopy}
    >
      {hasCopied ? <Check className="!h-3 !w-3" /> : <Copy className="!h-3 !w-3" />}
    </Button>
  );
}

export function QueryRequestView({ queryRequest }: QueryRequestViewProps) {
  return (
    <div className="query-request">
      <div className="relative group">
        <CopyButton value={queryRequest.sql} />
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
    </div>
  );
}

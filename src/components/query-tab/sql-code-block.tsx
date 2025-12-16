import { Play } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { ThemedSyntaxHighlighter } from "../themed-syntax-highlighter";
import { Button } from "../ui/button";
import { QueryExecutor } from "./query-execution/query-executor";

interface SqlCodeBlockProps {
  code: string;
  language?: string;
  customStyle?: React.CSSProperties;
  showExecuteButton?: boolean;
  showLineNumbers?: boolean;
}

export function SqlCodeBlock({
  code,
  language = "sql",
  customStyle,
  showExecuteButton = false,
  showLineNumbers,
}: SqlCodeBlockProps) {
  const handleRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    QueryExecutor.sendQueryRequest(code, {
      params: {
        default_format: "PrettyCompactMonoBlock",
        output_format_pretty_color: 0,
        output_format_pretty_max_value_width: 50000,
        output_format_pretty_max_rows: 500,
        output_format_pretty_row_numbers: true,
      },
    });
  };

  return (
    <div className="relative rounded-md my-1 overflow-hidden bg-muted/20 group">
      {/* Floating Actions */}
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
        {showExecuteButton && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-60 hover:opacity-100 transition-all"
            onClick={handleRun}
            title="Execute SQL"
          >
            <Play className="h-3 w-3" />
          </Button>
        )}

        <CopyButton
          value={code}
          className="relative h-6 w-6 opacity-60 hover:opacity-100 transition-all"
        />
      </div>

      <ThemedSyntaxHighlighter
        language={language}
        customStyle={{
          margin: 0,
          fontSize: "0.800rem",
          lineHeight: "1.5",
          padding: "0.5rem",
          ...customStyle,
        }}
        showLineNumbers={showLineNumbers}
      >
        {code}
      </ThemedSyntaxHighlighter>
    </div>
  );
}

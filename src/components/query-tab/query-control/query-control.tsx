import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StringUtils } from "@/lib/string-utils";
import { ChevronDown, Play } from "lucide-react";
import { useCallback } from "react";
import { useQueryExecutor } from "../query-execution/query-executor";
import { useQueryInput } from "../query-input/use-query-input";

export function QueryControl() {
  const { isSqlExecuting, executeQuery } = useQueryExecutor();
  const { connection } = useConnection();
  const { selectedText, text } = useQueryInput();

  const handleRun = useCallback(() => {
    const sql = selectedText || text;

    if (sql.length === 0) return;

    if (!connection) {
      return;
    }

    // executeQuery now handles comment removal and vertical format detection
    executeQuery(sql);
  }, [selectedText, text, executeQuery, connection]);

  const handleExplain = useCallback(
    (type: string) => {
      let rawSQL = StringUtils.removeComments(selectedText || text);
      if (rawSQL.length === 0) {
        return;
      }

      // for EXPLAIN SQL, the trailing \G is not allowed, let's remove it
      if (rawSQL.endsWith("\\G")) {
        rawSQL = rawSQL.substring(0, rawSQL.length - 2);
      }

      // Build the EXPLAIN query - executeQuery will handle comment removal and \G
      let explainSQL: string;
      if (type === "pipeline") {
        explainSQL = `EXPLAIN pipeline graph = 1\n${rawSQL}`;
      } else if (type === "plan-indexes") {
        explainSQL = `EXPLAIN plan indexes = 1\n${rawSQL}`;
      } else if (type === "plan-actions") {
        explainSQL = `EXPLAIN plan actions = 1\n${rawSQL}`;
      } else {
        explainSQL = `EXPLAIN ${type}\n${rawSQL}`;
      }

      // Pass both the EXPLAIN query and the original SQL
      // executeQuery will handle format selection based on the view type
      // For plan-indexes and plan-actions, use "plan" as the view type
      const viewType = type === "plan-indexes" || type === "plan-actions" ? "plan" : type;
      executeQuery(explainSQL, rawSQL, { view: viewType });
    },
    [selectedText, text, executeQuery]
  );

  const isDisabled = isSqlExecuting || (selectedText.length === 0 && text.length === 0);

  return (
    <TooltipProvider>
      <div className="flex h-8 w-full gap-2 rounded-sm items-center px-2 text-xs transition-colors">
        <Button
          disabled={isDisabled}
          onClick={handleRun}
          size="sm"
          variant="ghost"
          className={`h-6 gap-1 px-2 text-xs rounded-sm`}
        >
          <Play className="h-3 w-3" />
          {selectedText ? "Run Selected SQL(Cmd+Enter)" : "Run SQL(Cmd+Enter)"}
        </Button>

        <Separator orientation="vertical" className="h-4" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={isDisabled}
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs rounded-sm"
            >
              {selectedText ? "Explain Selected SQL" : "Explain SQL"}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => handleExplain("ast")}>Explain AST</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExplain("syntax")}>
              Explain Syntax
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExplain("plan-indexes")}>
              Explain Plan (indexes)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExplain("plan-actions")}>
              Explain Plan (actions)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExplain("pipeline")}>
              Explain Pipeline
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExplain("estimate")}>
              Explain Estimate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}

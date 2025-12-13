import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { QueryContextManager } from "@/lib/query-context/query-context-manager";
import { toastManager } from "@/lib/toast";
import { ChevronDown, Play } from "lucide-react";
import { useCallback, useState } from "react";
import { QueryExecutor } from "../query-execution/query-executor";
import { useQueryEditor } from "./use-query-editor";

export interface QueryControlProps {
  isExecuting?: boolean;
  onQuery?: () => void;
  onExplain?: (name: string) => void;
}

export function QueryControl({ isExecuting = false, onQuery, onExplain }: QueryControlProps) {
  const { selectedText, text } = useQueryEditor();
  const [isExplainOpen, setIsExplainOpen] = useState(false);

  const handleQuery = useCallback(() => {
    if (onQuery) {
      onQuery();
      return;
    }

    const queryText = selectedText || text;
    if (!queryText) {
      toastManager.show("No SQL to execute", "error");
      return;
    }

    // Get query context at execution time
    const queryContext = QueryContextManager.getInstance().getContext();

    // Build params from query context
    const params: Record<string, unknown> = {
      default_format: "PrettyCompactMonoBlock",
      //output_format_pretty_max_value_width: 50000,
      output_format_pretty_max_rows: queryContext.output_format_pretty_max_rows || 500,
      output_format_pretty_row_numbers: queryContext.output_format_pretty_row_numbers !== false,
    };

    if (queryContext.max_execution_time) {
      params.max_execution_time = queryContext.max_execution_time;
    }

    QueryExecutor.sendQueryRequest(queryText, { params });
  }, [onQuery, selectedText, text]);

  const removeComments = useCallback((sql: string) => {
    return (
      sql
        // Remove single-line comments
        .replace(/^--.*$/gm, "")
        // Remove multiline comments
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim()
    );
  }, []);

  const handleExplain = useCallback(
    (type: string) => {
      if (onExplain) {
        onExplain(type);
        return;
      }

      let rawSQL = removeComments(selectedText || text);

      // EXPLAINing with ending \G results in error, so clean the sql first
      if (rawSQL.endsWith("\\G")) {
        rawSQL = rawSQL.substring(0, rawSQL.length - 2);
      }

      let sql: string;
      if (type === "pipeline") {
        sql = `EXPLAIN pipeline graph = 1\n${rawSQL}`;
      } else if (type === "plan") {
        sql = `EXPLAIN plan indexes = 1\n${rawSQL}`;
      } else {
        sql = `EXPLAIN ${type}\n${rawSQL}`;
      }

      const params: Record<string, unknown> = {
        default_format: type === "estimate" ? "PrettyCompactMonoBlock" : "TabSeparatedRaw",
      };

      QueryExecutor.sendQueryRequest(sql, {
        view: type,
        params,
      });
    },
    [onExplain, removeComments, selectedText, text]
  );

  const isDisabled = isExecuting || (selectedText.length === 0 && text.length === 0);
  
  return (
    <div className="flex h-8 w-full gap-2 rounded-sm items-center border-b px-2 text-xs transition-colors">
      <Button disabled={isDisabled} onClick={handleQuery} size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs">
        <Play className="h-3 w-3" />
        {selectedText ? "Run Selected (Cmd+Enter)" : "Run (Cmd+Enter)"}
      </Button>

      <Separator orientation="vertical" className="h-4" />

      <DropdownMenu open={isExplainOpen} onOpenChange={setIsExplainOpen}>
        <DropdownMenuTrigger asChild>
          <Button disabled={isDisabled} size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs">
            {selectedText ? "Explain Selected" : "Explain"}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleExplain("ast")}>Explain AST</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExplain("syntax")}>Explain Syntax</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExplain("plan")}>Explain Plan</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExplain("pipeline")}>Explain Pipeline</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExplain("estimate")}>Explain Estimate</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { QueryContext } from "@/lib/query-context/QueryContext";
import { QueryContextManager } from "@/lib/query-context/QueryContextManager";
import { toastManager } from "@/lib/toast";
import { ChevronDown, MoreVertical, Play } from "lucide-react";
import { useCallback, useState } from "react";
import { QueryExecutor } from "../query-execution/query-executor";
import { getSelectedOrAllText } from "../query-input/query-input-view";

export interface QueryControlProps {
  isExecuting?: boolean;
  hasSelectedText?: boolean;
  onQuery?: () => void;
  onExplain?: (name: string) => void;
}

export function QueryControl({
  isExecuting = false,
  hasSelectedText = false,
  onQuery,
  onExplain,
}: QueryControlProps) {
  const [queryContext, setQueryContext] = useState<QueryContext>(() =>
    QueryContextManager.getInstance().getContext()
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExplainOpen, setIsExplainOpen] = useState(false);

  const updateQueryContext = useCallback((updates: Partial<QueryContext>) => {
    const newContext = { ...queryContext, ...updates };
    setQueryContext(newContext);
    QueryContextManager.getInstance().updateContext(updates);
  }, [queryContext]);

  const handleQuery = useCallback(() => {
    if (onQuery) {
      onQuery();
      return;
    }

    const text = getSelectedOrAllText();
    if (!text) {
      toastManager.show("No SQL to execute", "error");
      return;
    }

    // Build params from query context
    const params: Record<string, unknown> = {
      default_format: "PrettyCompactMonoBlock",
      output_format_pretty_color: 0,
      output_format_pretty_max_value_width: 50000,
      output_format_pretty_max_rows: queryContext.maxResultRows || 500,
      output_format_pretty_row_numbers: queryContext.showRowNumber !== false,
    };

    if (queryContext.maxExecutionTime) {
      params.max_execution_time = queryContext.maxExecutionTime;
    }

    QueryExecutor.sendQueryRequest(text, { params });
  }, [onQuery, queryContext]);

  const removeComments = useCallback((sql: string) => {
    return sql
      // Remove single-line comments
      .replace(/^--.*$/gm, "")
      // Remove multiline comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
  }, []);

  const handleExplain = useCallback(
    (type: string) => {
      if (onExplain) {
        onExplain(type);
        return;
      }

      let rawSQL = getSelectedOrAllText();
      if (!rawSQL) {
        toastManager.show("No SQL to execute", "error");
        return;
      }

      // Remove comments and clean up SQL
      rawSQL = removeComments(rawSQL);

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
        output_format_pretty_color: 0,
      };

      QueryExecutor.sendQueryRequest(sql, {
        view: type,
        params,
      });
    },
    [onExplain, removeComments]
  );

  const handleMaxResultRowsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) {
        toastManager.show("max result rows can't be less than 1", "error");
        return;
      }
      if (val > 10000) {
        toastManager.show("max result rows can't be greater than 10000", "error");
        return;
      }
      updateQueryContext({ maxResultRows: val });
    },
    [updateQueryContext]
  );

  const handleMaxExecutionTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) {
        toastManager.show("max execution time can't be less than 1", "error");
        return;
      }
      if (val > 500) {
        toastManager.show("max execution time can't be greater than 500", "error");
        return;
      }
      updateQueryContext({ maxExecutionTime: val });
    },
    [updateQueryContext]
  );

  return (
    <div className="flex items-center gap-2 border-b bg-background px-4 py-2">
      <Button
        disabled={isExecuting}
        onClick={handleQuery}
        size="sm"
        variant="ghost"
        className="gap-2"
      >
        <Play className="h-4 w-4" />
        {hasSelectedText ? "Query Selected (Cmd+Enter)" : "Query (Cmd+Enter)"}
      </Button>

      <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <PopoverTrigger asChild>
          <Button
            disabled={isExecuting}
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold">Query Context</h4>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="tracing-enabled" className="text-sm font-normal">
                Tracing Enabled
              </Label>
              <Switch
                id="tracing-enabled"
                checked={queryContext.isTracingEnabled || false}
                onCheckedChange={(checked) =>
                  updateQueryContext({ isTracingEnabled: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="show-row-number" className="text-sm font-normal">
                Show row number in the result
              </Label>
              <Switch
                id="show-row-number"
                checked={queryContext.showRowNumber !== false}
                onCheckedChange={(checked) =>
                  updateQueryContext({ showRowNumber: checked })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-result-rows">Max result rows</Label>
              <Input
                id="max-result-rows"
                type="number"
                min={1}
                max={10000}
                value={queryContext.maxResultRows || 1000}
                onChange={handleMaxResultRowsChange}
                placeholder="max result rows of a query"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-execution-time">Max execution time(s)</Label>
              <Input
                id="max-execution-time"
                type="number"
                min={1}
                max={500}
                value={queryContext.maxExecutionTime || 60}
                onChange={handleMaxExecutionTimeChange}
                placeholder="max execution time of query"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6" />

      <DropdownMenu open={isExplainOpen} onOpenChange={setIsExplainOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={isExecuting}
            size="sm"
            variant="ghost"
            className="gap-2"
          >
            {hasSelectedText ? "Explain Selected" : "Explain"}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleExplain("ast")}>
            Explain AST
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExplain("syntax")}>
            Explain Syntax
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExplain("plan")}>
            Explain Plan
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
  );
}


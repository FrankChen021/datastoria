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
import { SqlUtils } from "@/lib/sql-utils";
import { Bookmark, ChevronDown, Play } from "lucide-react";
import { useCallback } from "react";
import { useQueryExecutor } from "../query-execution/query-executor";
import { useQueryInput } from "../query-input/use-query-input";
import { openSaveSnippetDialog } from "../snippet/save-snippet-dialog";
import { showMultipleStatementsConfirmDialog } from "./multiple-statements-confirm-dialog";

export function QueryControl() {
  const { isSqlExecuting, executeQuery, executeBatch } = useQueryExecutor();
  const { connection } = useConnection();
  const { selectedText, text, cursorRow, cursorColumn } = useQueryInput();

  const handleRunCurrentLine = useCallback(() => {
    const sql = SqlUtils.resolveExecutionSql({
      selectedText: "",
      text,
      cursorRow,
      cursorColumn,
    });

    if (sql.length === 0) return;

    if (!connection) {
      return;
    }

    // executeQuery now handles comment removal and vertical format detection
    executeQuery(sql);
  }, [text, cursorRow, cursorColumn, executeQuery, connection]);

  const handleRunSelectedText = useCallback(() => {
    const sql = selectedText.trim();
    if (sql.length === 0) {
      return;
    }
    executeQuery(sql);
  }, [selectedText, executeQuery]);

  const handleExplain = useCallback(
    (type: string) => {
      const sql = SqlUtils.resolveExecutionSql({
        selectedText,
        text,
        cursorRow,
        cursorColumn,
      });
      const { explainSQL, rawSQL } = SqlUtils.toExplainSQL(type, sql);
      if (rawSQL.length === 0) {
        return;
      }
      const viewType = type === "plan-indexes" || type === "plan-actions" ? "plan" : type;
      executeQuery(explainSQL, rawSQL, { view: viewType });
    },
    [selectedText, text, cursorRow, cursorColumn, executeQuery]
  );

  const handleRunBatchSqls = useCallback(() => {
    const source = selectedText.trim().length > 0 ? "selection" : "all";
    const sqlText = source === "selection" ? selectedText : text;
    if (sqlText.trim().length === 0) {
      return;
    }
    showMultipleStatementsConfirmDialog({
      source,
      sqlText,
      defaultFailureMode: "abort",
      defaultSplitter: "semicolon",
      onConfirm: (selectedStatements, failureMode) => {
        executeBatch(selectedStatements, { failureMode, source });
      },
    });
  }, [selectedText, text, executeBatch]);

  const hasEditorText = text.trim().length > 0;
  const hasSelectedText = selectedText.trim().length > 0;
  const isRunPrimaryDisabled = isSqlExecuting || (!hasSelectedText && !hasEditorText);
  const isRunBatchDisabled = isSqlExecuting || !hasEditorText;
  const isExplainDisabled = isSqlExecuting || !hasEditorText;
  const isSaveDisabled = isSqlExecuting || !hasEditorText;

  return (
    <TooltipProvider>
      <div className="flex h-8 w-full gap-2 rounded-sm items-center px-2 text-xs transition-colors">
        <div className="flex">
          <Button
            disabled={isRunPrimaryDisabled}
            onClick={hasSelectedText ? handleRunSelectedText : handleRunCurrentLine}
            size="sm"
            variant="ghost"
            className={`h-6 gap-1 px-2 text-xs rounded-sm`}
          >
            <Play className="h-3 w-3" />
            {hasSelectedText ? "Run Selected Text(Cmd+Enter)" : "Run Current Line(Cmd+Enter)"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={isRunBatchDisabled}
                size="sm"
                variant="ghost"
                className="h-6 px-1 text-xs rounded-sm"
                aria-label="Run options"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleRunBatchSqls}>Run Batch SQLs</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Separator orientation="vertical" className="h-4" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={isExplainDisabled}
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs rounded-sm"
            >
              {selectedText ? "Explain Selected SQL" : "Explain Current Line"}
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

        <Separator orientation="vertical" className="h-4" />

        <Button
          disabled={isSaveDisabled}
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs rounded-sm"
          onClick={() => openSaveSnippetDialog({ initialSql: selectedText || text })}
        >
          <Bookmark className="h-3 w-3" />
          Save
        </Button>
      </div>
    </TooltipProvider>
  );
}

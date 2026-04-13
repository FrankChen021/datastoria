import {
  AgentCommandBrowserPanel,
  type AgentCommandBrowserItem,
} from "@/components/chat/agent-command-browser-panel";
import { useAgentCommands } from "@/components/chat/agent-command-context";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import {
  AgentConfigurationManager,
  normalizeAIResponseLanguage,
} from "@/components/settings/agent/agent-manager";
import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import { SqlUtils } from "@/lib/sql-utils";
import { Bookmark, ChevronDown, History, MessageSquare, Play, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useQueryExecutor } from "../query-execution/query-executor";
import { useQueryInput } from "../query-input/use-query-input";
import { openSaveSnippetDialog } from "../snippet/save-snippet-dialog";
import { showMultipleStatementsConfirmDialog } from "./multiple-statements-confirm-dialog";

export function QueryControl({ onOpenHistory }: { onOpenHistory: () => void }) {
  const { isSqlExecuting, executeQuery, executeBatch } = useQueryExecutor();
  const { connection } = useConnection();
  const { postMessage, setDisplayMode } = useChatPanel();
  const { commands } = useAgentCommands();
  const { selectedText, text, cursorRow, cursorColumn } = useQueryInput();
  const sqlEditorCommands = commands.filter((command) => command.showInSqlEditorQuickAction);
  const [isAgentActionsOpen, setIsAgentActionsOpen] = useState(false);

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
      const viewType = type === "plan" ? "plan" : type;
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

  const handleSqlEditorCommand = useCallback(
    (command: CommandDetail) => {
      const sql = SqlUtils.resolveExecutionSql({
        selectedText,
        text,
        cursorRow,
        cursorColumn,
      });
      const normalizedSql = SqlUtils.removeComments(sql);
      if (normalizedSql.length === 0) {
        Dialog.alert({
          title: "No SQL To Send",
          description: "Select a SQL statement or place the cursor on a runnable SQL line first.",
        });
        return;
      }

      const statements = SqlUtils.splitSqlStatements(normalizedSql);
      if (statements.length !== 1) {
        Dialog.alert({
          title: "Single Statement Required",
          description:
            "AI actions from the SQL editor currently support exactly one SQL statement at a time.",
        });
        return;
      }

      const reviewLanguage = normalizeAIResponseLanguage(
        AgentConfigurationManager.getConfiguration().aiResponseLanguage
      );

      postMessage(`/${command.name}\n\n\`\`\`sql\n${statements[0]}\n\`\`\``, {
        forceNewChat: true,
        agentContext: { responseLanguage: reviewLanguage },
      });
    },
    [cursorColumn, cursorRow, postMessage, selectedText, text]
  );

  const handleOpenAgent = useCallback(() => {
    setDisplayMode("panel");
  }, [setDisplayMode]);

  const sqlEditorActionItems = useMemo<AgentCommandBrowserItem[]>(
    () => [
      ...sqlEditorCommands.map((command) => ({
        key: command.name,
        label: `/${command.name}`,
        description: command.description,
      })),
      {
        key: "__toggle-agent__",
        label: "Toggle Agent",
        icon: <MessageSquare className="!h-3.5 !w-3.5" />,
        separatorBefore: true,
        itemClassName: "py-1 my-1",
      },
    ],
    [sqlEditorCommands]
  );
  const hasSqlEditorCommands = sqlEditorCommands.length > 0;

  const hasEditorText = text.trim().length > 0;
  const hasSelectedText = selectedText.trim().length > 0;
  const hasSqlInput = hasSelectedText || hasEditorText;
  const isRunPrimaryDisabled = isSqlExecuting || (!hasSelectedText && !hasEditorText);
  const isRunBatchDisabled = isSqlExecuting || !hasEditorText;
  const isExplainDisabled = isSqlExecuting || !hasEditorText;
  const isSqlEditorActionDisabled = isSqlExecuting;
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
            <DropdownMenuItem onClick={() => handleExplain("plan")}>Explain Plan</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExplain("pipeline")}>
              Explain Pipeline
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExplain("estimate")}>
              Explain Estimate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <>
          <Separator orientation="vertical" className="h-4" />
          <Popover open={isAgentActionsOpen} onOpenChange={setIsAgentActionsOpen}>
            <PopoverTrigger asChild>
              <Button
                disabled={isSqlEditorActionDisabled}
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-xs rounded-sm"
              >
                <Sparkles className="h-3 w-3" />
                AI Actions
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="p-0 w-auto flex items-stretch z-50 bg-transparent border-0 pointer-events-auto"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <AgentCommandBrowserPanel
                items={sqlEditorActionItems}
                onSelectItem={(item) => {
                  setIsAgentActionsOpen(false);
                  if (item.key === "__toggle-agent__") {
                    handleOpenAgent();
                    return;
                  }
                  const command = sqlEditorCommands.find(
                    (candidate) => candidate.name === item.key
                  );
                  if (command) {
                    handleSqlEditorCommand(command);
                  }
                }}
              />
            </PopoverContent>
          </Popover>
        </>

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

        <Separator orientation="vertical" className="h-4" />

        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs rounded-sm"
          onClick={onOpenHistory}
        >
          <History className="h-3 w-3" />
          History
        </Button>
      </div>
    </TooltipProvider>
  );
}

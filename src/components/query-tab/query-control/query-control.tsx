import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toastManager } from "@/lib/toast";
import { cn } from "@/lib/utils";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  AlertCircle,
  ChevronDown,
  Database,
  Info,
  MessageSquare,
  MessageSquarePlus,
  Play,
  Sparkles,
} from "lucide-react";
import { memo, useCallback, useState } from "react";
import { QueryExecutor } from "../query-execution/query-executor";
import { useQueryInput } from "../query-input/use-query-input";
import type { ChatSessionStats } from "../query-list-view";
import { ChatSessionStatus } from "./chat-session-status";
import { ModelSelector } from "./model-selector";

interface NewConversationButtonProps {
  onNewConversation?: () => void;
}

const NewConversationButton = memo(function NewConversationButton({ onNewConversation }: NewConversationButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleConfirm = useCallback(() => {
    setShowConfirm(false);
    if (onNewConversation) {
      onNewConversation();
    }
  }, [onNewConversation]);

  return (
    <Popover open={showConfirm} onOpenChange={setShowConfirm}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" title="Start New Conversation">
          <MessageSquarePlus className="h-3 w-3" />
          New Conversation
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[350px]")} side="top" align="end" sideOffset={0}>
        <PopoverPrimitive.Arrow className={cn("fill-[var(--border)]")} width={12} height={8} />
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm mb-1">Start New Conversation</div>
            <div className="text-xs mb-3">Are you sure you want to start a new conversation?</div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </Button>
              <Button type="button" variant="default" size="sm" className="h-7 text-xs" onClick={handleConfirm}>
                Start New
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});

export interface QueryControlProps {
  mode: "sql" | "chat";
  onModeChange: (mode: "sql" | "chat") => void;
  isExecuting?: boolean;
  onRun?: (text: string) => void;
  onExplain?: (name: string) => void;
  onNewConversation?: () => void;
  sessionStats?: ChatSessionStats;
  currentSessionId?: string;
}

export function QueryControl({
  mode,
  onModeChange,
  isExecuting = false,
  onRun,
  onExplain,
  onNewConversation,
  sessionStats,
  currentSessionId,
}: QueryControlProps) {
  const { selectedText, text } = useQueryInput();
  const [isExplainOpen, setIsExplainOpen] = useState(false);

  const handleQuery = useCallback(() => {
    const queryText = selectedText || text;
    if (!queryText) {
      toastManager.show(mode === "sql" ? "No SQL to execute" : "Please input message", "error");
      return;
    }

    if (onRun) {
      onRun(queryText);
    }
  }, [onRun, selectedText, text, mode]);

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
    <TooltipProvider>
      <div className="flex h-8 w-full gap-2 rounded-sm items-center px-2 text-xs transition-colors">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>CMD+I to switch mode</p>
          </TooltipContent>
        </Tooltip>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(val) => val && onModeChange(val as "sql" | "chat")}
          className="h-7 p-[2px] bg-muted/50 rounded-md"
        >
          <ToggleGroupItem
            value="sql"
            size="sm"
            className="h-6 px-2 text-[10px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground rounded-sm"
            title="Switch to SQL Editor (Cmd+I)"
          >
            <Database className="h-3 w-3 mr-1" />
            SQL
          </ToggleGroupItem>
          <ToggleGroupItem
            value="chat"
            size="sm"
            className="h-6 px-2 text-[10px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground rounded-sm"
            title="Switch to AI Chat (Cmd+I)"
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Chat
          </ToggleGroupItem>
        </ToggleGroup>
        <Separator orientation="vertical" className="h-4" />

        <Button
          disabled={isDisabled}
          onClick={handleQuery}
          size="sm"
          variant="ghost"
          className={`h-6 gap-1 px-2 text-xs`}
        >
          {mode === "sql" ? <Play className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
          {mode === "sql"
            ? selectedText
              ? "Run Selected SQL(Cmd+Enter)"
              : "Run SQL(Cmd+Enter)"
            : "Ask AI (Cmd+Enter)"}
        </Button>

        <Separator orientation="vertical" className="h-4" />

        {mode === "chat" && (
          <>
            <ModelSelector />
            <Separator orientation="vertical" className="h-4" />
          </>
        )}

        {mode === "chat" && sessionStats && sessionStats.messageCount > 0 && (
          <>
            <ChatSessionStatus stats={sessionStats} currentSessionId={currentSessionId} />
            <NewConversationButton onNewConversation={onNewConversation} />
          </>
        )}

        {mode === "sql" && (
          <DropdownMenu open={isExplainOpen} onOpenChange={setIsExplainOpen}>
            <DropdownMenuTrigger asChild>
              <Button disabled={isDisabled} size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs">
                {selectedText ? "Explain Selected SQL" : "Explain SQL"}
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
        )}
      </div>
    </TooltipProvider>
  );
}

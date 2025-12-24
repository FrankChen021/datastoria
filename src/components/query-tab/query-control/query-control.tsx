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
import { ColorGenerator } from "@/lib/color-generator";
import { toastManager } from "@/lib/toast";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, Database, MessageSquare, MessageSquarePlus, Play, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { QueryExecutor } from "../query-execution/query-executor";
import { useQueryEditor } from "./use-query-editor";

// Create a singleton instance for session colors (same as in chat-message-view)
const sessionColorGenerator = new ColorGenerator();

export interface QueryControlProps {
  mode: "sql" | "chat";
  onModeChange: (mode: "sql" | "chat") => void;
  isExecuting?: boolean;
  onRun?: (text: string) => void;
  onExplain?: (name: string) => void;
  onNewConversation?: () => void;
  sessionMessageCount?: number;
  sessionStartTime?: Date;
  currentSessionId?: string;
}

export function QueryControl({
  mode,
  onModeChange,
  isExecuting = false,
  onRun,
  onExplain,
  onNewConversation,
  sessionMessageCount = 0,
  sessionStartTime,
  currentSessionId,
}: QueryControlProps) {
  const { selectedText, text } = useQueryEditor();
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [isSessionPopoverOpen, setIsSessionPopoverOpen] = useState(false);

  // Get session color for the button (same as visual bar in message list)
  const sessionColor = useMemo(() => {
    return currentSessionId ? sessionColorGenerator.getColor(currentSessionId) : null;
  }, [currentSessionId]);

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
    <div className="flex h-8 w-full gap-2 rounded-sm items-center px-2 text-xs transition-colors">
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
          SQL{mode === "chat" ? "(Cmd + I)" : ""}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="chat"
          size="sm"
          className="h-6 px-2 text-[10px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=off]:text-muted-foreground rounded-sm"
          title="Switch to AI Chat (Cmd+I)"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Chat{mode === "sql" ? "(Cmd + I)" : ""}
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
        {mode === "sql" ? <Play className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
        {mode === "sql" ? (selectedText ? "Run Selected SQL(Cmd+Enter)" : "Run SQL(Cmd+Enter)") : "Ask AI (Cmd+Enter)"}
      </Button>

      <Separator orientation="vertical" className="h-4" />

      {mode === "chat" && (
        <>
          {/* Session indicator with popover */}
          <Popover open={isSessionPopoverOpen} onOpenChange={setIsSessionPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={sessionMessageCount === 0}
                className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                style={
                  sessionColor && sessionMessageCount > 0
                    ? {
                        color: `${sessionColor.foreground}`,
                      }
                    : undefined
                }
                title={sessionMessageCount === 0 ? "No messages yet" : "View conversation info"}
              >
                <MessageSquare className="h-3 w-3" />
                {sessionMessageCount} {sessionMessageCount === 1 ? "message" : "messages"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Current Conversation</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Messages:</span>
                    <span className="font-medium text-foreground">{sessionMessageCount}</span>
                  </div>
                  {sessionStartTime && (
                    <>
                      <div className="flex justify-between">
                        <span>Started:</span>
                        <span className="font-medium text-foreground">
                          {formatDistanceToNow(sessionStartTime, { addSuffix: true })}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <Separator className="my-2" />
                <Button
                  onClick={() => {
                    setIsSessionPopoverOpen(false);
                    onNewConversation?.();
                  }}
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs"
                >
                  <MessageSquarePlus className="h-3 w-3 mr-1" />
                  Start New Conversation
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Separator orientation="vertical" className="h-4" />
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
  );
}

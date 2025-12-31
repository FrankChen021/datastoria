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
  onNewConversation?: () => void;
  sessionStats?: ChatSessionStats;
  currentSessionId?: string;
}

export function QueryControl({
  mode,
  onModeChange,
  isExecuting = false,
  onRun,
  onNewConversation,
  sessionStats,
  currentSessionId,
}: QueryControlProps) {
  const { selectedText, text } = useQueryInput();
  const [isExplainOpen, setIsExplainOpen] = useState(false);

  const handleQuery = useCallback(() => {
    if (onRun) {
      onRun(selectedText || text);
    }
  }, [onRun, selectedText, text]);

  const handleExplain = useCallback(
    (type: string) => {
      QueryExecutor.explainQuery(type, selectedText || text);
    },
    [selectedText, text]
  );
  console.log("isExecuting", isExecuting);
  console.log("selectedText", selectedText);
  console.log("text", text);
  const isDisabled = isExecuting || (selectedText.length === 0 && text.length === 0);

  return (
    <TooltipProvider>
      <div className="flex h-8 w-full gap-2 rounded-sm items-center px-2 text-xs transition-colors">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(val) => val && onModeChange(val as "sql" | "chat")}
          className="h-6 gap-0 p-0"
        >
          <ToggleGroupItem
            value="sql"
            size="sm"
            className="h-full px-2 text-[10px] rounded-sm border-r data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=off]:text-muted-foreground hover:bg-muted/50"
            title="SQL Editor/Execution Mode (Cmd+I)"
          >
            <Database className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="chat"
            size="sm"
            className="h-full px-2 text-[10px] rounded-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=off]:text-muted-foreground hover:bg-muted/50"
            title="AI Chat Mode (Cmd+I)"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
        <Separator orientation="vertical" className="h-4" />

        <div>
          <Button
            disabled={isDisabled}
            onClick={handleQuery}
            size="sm"
            variant="ghost"
            className={`h-6 gap-1 px-2 text-xs rounded-sm rounded-r-none`}
          >
            {mode === "sql" ? <Play className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
            {mode === "sql"
              ? selectedText
                ? "Run Selected SQL(Cmd+Enter)"
                : "Run SQL(Cmd+Enter)"
              : "Ask AI (Cmd+Enter)"}
          </Button>

          {mode === "sql" && (
            <DropdownMenu open={isExplainOpen} onOpenChange={setIsExplainOpen}>
              <DropdownMenuTrigger asChild>
                <Button disabled={isDisabled} size="sm" variant="ghost"
                  className="h-6 gap-1 px-2 text-xs rounded-sm rounded-l-none">
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
          )}</div>

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
      </div>
    </TooltipProvider>
  );
}

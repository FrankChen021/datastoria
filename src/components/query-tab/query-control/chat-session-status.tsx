import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { colorGenerator } from "@/lib/color-generator";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatSessionStats } from "../query-list-view";

export interface ChatSessionStatusProps {
  stats?: ChatSessionStats;
  currentSessionId?: string;
}

export function ChatSessionStatus({
  stats: sessionStats,
  currentSessionId,
}: ChatSessionStatusProps) {
  const sessionStartTime = sessionStats?.startTime;
  const [isOpen, setIsOpen] = useState(false);
  const sessionMessageCount = sessionStats?.messageCount ?? 0;
  const totalTokens = sessionStats?.tokens.totalTokens ?? 0;

  // Get session color for the button (same as visual bar in message list)
  const sessionColor = useMemo(() => {
    return currentSessionId ? colorGenerator.getColor(currentSessionId) : null;
  }, [currentSessionId]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
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
          {totalTokens > 0 && (
            <>
              {" "}
              {totalTokens.toLocaleString()} {totalTokens === 1 ? "token" : "tokens"}
            </>
          )}
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
            {sessionStats && (
              <>
                <Separator className="my-1" />
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Total Tokens:</span>
                    <span className="font-medium text-foreground">{sessionStats.tokens.totalTokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Input Tokens:</span>
                    <span className="font-medium text-foreground">{sessionStats.tokens.inputTokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Output Tokens:</span>
                    <span className="font-medium text-foreground">{sessionStats.tokens.outputTokens}</span>
                  </div>
                  {sessionStats.tokens.reasoningTokens > 0 && (
                    <div className="flex justify-between">
                      <span>Reasoning Tokens:</span>
                      <span className="font-medium text-foreground">{sessionStats.tokens.reasoningTokens}</span>
                    </div>
                  )}
                  {sessionStats.tokens.cachedInputTokens > 0 && (
                    <div className="flex justify-between">
                      <span>Cached Tokens:</span>
                      <span className="font-medium text-foreground">{sessionStats.tokens.cachedInputTokens}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import NumberFlow from "@number-flow/react";
import type { LanguageModelUsage } from "ai";
import { Info } from "lucide-react";

interface ChatTokenStatusProps {
  usage: LanguageModelUsage;
}

export function ChatTokenStatus({ usage }: ChatTokenStatusProps) {
  if ((usage.totalTokens ?? 0) === 0) {
    return null;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="View token usage"
        >
          <Info className="h-3 w-3" />
          <NumberFlow value={usage.totalTokens ?? 0} />{" "}
          {(usage.totalTokens ?? 0) === 1 ? "token" : "tokens"}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 px-3 py-2" align="start">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Session Token Usage</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Total Tokens:</span>
              <span className="font-medium text-foreground">
                <NumberFlow value={usage.totalTokens ?? 0} />
              </span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between">
              <span>Input Tokens:</span>
              <span className="font-medium text-foreground">
                <NumberFlow value={usage.inputTokens ?? 0} />
              </span>
            </div>
            {(usage.inputTokenDetails?.cacheReadTokens ?? 0) > 0 && (
              <div className="flex justify-between pl-3">
                <span>Cached Tokens:</span>
                <span className="font-medium text-foreground">
                  <NumberFlow value={usage.inputTokenDetails?.cacheReadTokens ?? 0} />
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Output Tokens:</span>
              <span className="font-medium text-foreground">
                <NumberFlow value={usage.outputTokens ?? 0} />
              </span>
            </div>
            {(usage.outputTokenDetails?.reasoningTokens ?? 0) > 0 && (
              <div className="flex justify-between">
                <span>Reasoning Tokens:</span>
                <span className="font-medium text-foreground">
                  <NumberFlow value={usage.outputTokenDetails?.reasoningTokens ?? 0} />
                </span>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

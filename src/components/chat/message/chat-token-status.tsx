"use client";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import type { TokenUsage } from "@/lib/ai/common-types";
import NumberFlow from "@number-flow/react";
import { Info } from "lucide-react";

interface ChatTokenStatusProps {
  usage: TokenUsage;
}

export function ChatTokenStatus({ usage }: ChatTokenStatusProps) {
  if (usage.totalTokens === 0) {
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
          <NumberFlow value={usage.totalTokens} /> {usage.totalTokens === 1 ? "token" : "tokens"}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Session Token Usage</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Total Tokens:</span>
              <span className="font-medium text-foreground">
                <NumberFlow value={usage.totalTokens} />
              </span>
            </div>
            <div className="flex justify-between">
              <span>Input Tokens:</span>
              <span className="font-medium text-foreground">
                <NumberFlow value={usage.inputTokens} />
              </span>
            </div>
            <div className="flex justify-between">
              <span>Output Tokens:</span>
              <span className="font-medium text-foreground">
                <NumberFlow value={usage.outputTokens} />
              </span>
            </div>
            {usage.reasoningTokens > 0 && (
              <div className="flex justify-between">
                <span>Reasoning Tokens:</span>
                <span className="font-medium text-foreground">
                  <NumberFlow value={usage.reasoningTokens} />
                </span>
              </div>
            )}
            {usage.cachedInputTokens > 0 && (
              <>
                <Separator className="my-1" />
                <div className="flex justify-between">
                  <span>Cached Tokens:</span>
                  <span className="font-medium text-foreground">
                    <NumberFlow value={usage.cachedInputTokens} />
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

import type { AppUIMessage, ToolPart } from "@/lib/ai/chat-types";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";

type SearchFileInput = {
  query?: string;
};

type SearchFileOutput =
  | {
      matches?: Array<unknown>;
      hasMore?: boolean;
    }
  | {
      error?: string;
    };

export const MessageToolSearchFile = memo(function MessageToolSearchFile({
  part,
  isRunning = true,
}: {
  part: AppUIMessage["parts"][0];
  isRunning?: boolean;
}) {
  const toolPart = part as ToolPart;
  const state = toolPart.state;
  const input = (toolPart.input ?? {}) as SearchFileInput;
  const output = toolPart.output as SearchFileOutput | undefined;

  const matchCount =
    output && "matches" in output && Array.isArray(output.matches) ? output.matches.length : null;
  const hasMore = output && "hasMore" in output && output.hasMore === true;
  const error =
    output && "error" in output && typeof output.error === "string" ? output.error : null;

  return (
    <CollapsiblePart
      toolName="Search File"
      headerExtra={input.query ?? ""}
      state={state}
      isRunning={isRunning}
    >
      {error ? (
        <div className="mt-1 text-[10px] text-destructive">{error}</div>
      ) : matchCount != null ? (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {matchCount} match{matchCount === 1 ? "" : "es"}
          {hasMore ? " (more available)" : ""}
        </div>
      ) : null}
    </CollapsiblePart>
  );
});

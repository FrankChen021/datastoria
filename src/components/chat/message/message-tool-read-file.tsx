import type { AppUIMessage, ToolPart } from "@/lib/ai/chat-types";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";

type ReadFileInput = {
  path?: string;
  startLine?: number;
  endLine?: number;
};

type ReadFileOutput =
  | {
      content?: string;
      startLine?: number;
      endLine?: number;
      error?: never;
    }
  | {
      error?: string;
    };

function buildHeader(input: ReadFileInput): string {
  const path = input.path ?? "";
  if (!path) {
    return "";
  }

  if (input.startLine != null && input.endLine != null) {
    return `${path}:${input.startLine}-${input.endLine}`;
  }

  if (input.startLine != null) {
    return `${path}:${input.startLine}`;
  }

  return path;
}

export const MessageToolReadFile = memo(function MessageToolReadFile({
  part,
  isRunning = true,
}: {
  part: AppUIMessage["parts"][0];
  isRunning?: boolean;
}) {
  const toolPart = part as ToolPart;
  const state = toolPart.state;
  const input = (toolPart.input ?? {}) as ReadFileInput;
  const output = toolPart.output as ReadFileOutput | undefined;
  const error =
    output && "error" in output && typeof output.error === "string" ? output.error : null;
  const content =
    output && "content" in output && typeof output.content === "string" ? output.content : null;
  const rowCount = content == null ? null : content.split(/\r?\n/).length;
  const charCount = content?.length ?? null;

  return (
    <CollapsiblePart
      toolName="Read File"
      headerExtra={buildHeader(input)}
      state={state}
      isRunning={isRunning}
    >
      {error ? (
        <div className="mt-1 text-[10px] text-destructive">{error}</div>
      ) : charCount != null && rowCount != null ? (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {charCount} chars, {rowCount} rows
        </div>
      ) : null}
    </CollapsiblePart>
  );
});

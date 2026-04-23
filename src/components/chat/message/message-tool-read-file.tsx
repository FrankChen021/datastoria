import type { AppUIMessage, ToolPart } from "@/lib/ai/ai-types";
import dynamic from "next/dynamic";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";

const ThemedSyntaxHighlighter = dynamic(
  () =>
    import("@/components/shared/themed-syntax-highlighter").then((module) => ({
      default: module.ThemedSyntaxHighlighter,
    })),
  { ssr: false }
);

type ReadFileInput = {
  path?: string;
  startLine?: number;
  endLine?: number;
};

type ReadFileOutput =
  | {
      path?: string;
      content?: string;
      startLine?: number;
      endLine?: number;
      error?: never;
    }
  | {
      error?: string;
    };

function inferLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
    case "xml":
      return "html";
    case "sql":
      return "sql";
    case "yml":
    case "yaml":
      return "yaml";
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
      return "cpp";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "py":
      return "python";
    case "java":
      return "java";
    case "sh":
      return "bash";
    default:
      return "typescript";
  }
}

function buildResolvedHeader(input: ReadFileInput, output?: ReadFileOutput): string {
  const path =
    output && "path" in output && typeof output.path === "string" && output.path.length > 0
      ? output.path
      : (input.path ?? "");
  const startLine =
    output && "startLine" in output && typeof output.startLine === "number"
      ? output.startLine
      : input.startLine;
  const endLine =
    output && "endLine" in output && typeof output.endLine === "number"
      ? output.endLine
      : input.endLine;

  if (!path) {
    return "";
  }

  if (startLine != null && endLine != null) {
    return `${path}:${startLine}-${endLine}`;
  }

  if (startLine != null) {
    return `${path}:${startLine}`;
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
  const resolvedPath =
    output && "path" in output && typeof output.path === "string" && output.path.length > 0
      ? output.path
      : (input.path ?? "");
  const rowCount = content == null ? null : content.split(/\r?\n/).length;
  const charCount = content?.length ?? null;
  const language = inferLanguage(resolvedPath);
  const startingLineNumber =
    output && "startLine" in output && typeof output.startLine === "number" ? output.startLine : 1;

  return (
    <CollapsiblePart
      toolName="Read File"
      headerExtra={buildResolvedHeader(input, output)}
      state={state}
      isRunning={isRunning}
    >
      {error ? (
        <div className="mt-1 text-[10px] text-destructive">{error}</div>
      ) : charCount != null && rowCount != null ? (
        <div className="mt-1 space-y-1">
          <div className="text-[10px] text-muted-foreground">
            {charCount} chars, {rowCount} rows
          </div>
          <div className="max-h-72 overflow-y-auto overflow-x-hidden rounded-sm border bg-muted/20">
            <ThemedSyntaxHighlighter
              language={language}
              showLineNumbers={true}
              startingLineNumber={startingLineNumber}
              customStyle={{
                backgroundColor: "transparent",
                margin: 0,
                padding: "6px",
                fontSize: "0.7rem",
                lineHeight: "1.45",
              }}
              children={content ?? ""}
            />
          </div>
        </div>
      ) : null}
    </CollapsiblePart>
  );
});

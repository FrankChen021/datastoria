"use client";

import { ThemeProvider } from "@/components/shared/theme-provider";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { ExternalLink } from "lucide-react";

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
      return "html";
    case "sql":
      return "sql";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "typescript";
  }
}

export function CodeViewerContent({
  path,
  content,
  startLine,
  endLine,
  highlightedStartLine,
  highlightedEndLine,
  truncated,
}: {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  highlightedStartLine?: number;
  highlightedEndLine?: number;
  truncated: boolean;
}) {
  const language = inferLanguage(path);
  const effectiveHighlightEndLine = highlightedEndLine ?? highlightedStartLine;

  return (
    <ThemeProvider defaultTheme="dark">
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm text-muted-foreground">{path}</div>
                <div className="mt-1 text-sm font-medium">
                  Lines {startLine}-{endLine}
                  {highlightedStartLine != null && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      focus {highlightedStartLine}
                      {effectiveHighlightEndLine &&
                      effectiveHighlightEndLine !== highlightedStartLine
                        ? `-${effectiveHighlightEndLine}`
                        : ""}
                    </span>
                  )}
                </div>
              </div>
              <a
                href="#code"
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Jump to code
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {truncated && (
              <div className="border-b bg-amber-500/10 px-5 py-2 text-sm text-amber-700 dark:text-amber-300">
                This preview was truncated to keep the viewer responsive.
              </div>
            )}
            <div id="code" className="overflow-x-auto p-2">
              <ThemedSyntaxHighlighter
                language={language}
                showLineNumbers={true}
                startingLineNumber={startLine}
                wrapLines={true}
                lineProps={(lineNumber: number) => ({
                  style:
                    highlightedStartLine != null &&
                    lineNumber >= highlightedStartLine &&
                    lineNumber <= (effectiveHighlightEndLine ?? highlightedStartLine)
                      ? {
                          display: "block",
                          backgroundColor: "rgba(250, 204, 21, 0.12)",
                        }
                      : { display: "block" },
                })}
                customStyle={{
                  margin: 0,
                  borderRadius: 12,
                  padding: "1rem",
                  fontSize: "0.9rem",
                }}
              >
                {content}
              </ThemedSyntaxHighlighter>
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

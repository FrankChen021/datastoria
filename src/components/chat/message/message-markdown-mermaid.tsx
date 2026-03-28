"use client";

import { useTheme } from "@/components/shared/theme-provider";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

interface MessageMarkdownMermaidProps {
  chart: string;
}

export function MessageMarkdownMermaid({ chart }: MessageMarkdownMermaidProps) {
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const diagramId = useId();

  const isDark = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.document.documentElement.classList.contains("dark");
    }

    return theme === "dark";
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDark ? "dark" : "default",
        });

        const { svg: renderedSvg } = await renderWithFallback({
          mermaid,
          diagramId,
          chart,
        });

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvg(null);
          setError(renderError instanceof Error ? renderError.message : "Failed to render Mermaid");
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId, isDark]);

  if (error) {
    return (
      <div className="my-2 overflow-hidden rounded-md border border-destructive/40 bg-destructive/5">
        <div className="flex items-center gap-2 border-b border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Unable to render Mermaid diagram</span>
        </div>
        <pre className="overflow-x-auto px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
          {error}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-2 rounded-md bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div className="group relative my-2 rounded-md bg-background/40 p-3">
      <CopyButton
        value={chart}
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 z-10 h-7 w-7 rounded-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:h-4 [&_svg]:w-4"
        aria-label="Copy Mermaid code"
        title="Copy Mermaid code"
      />

      <div
        className={cn(
          "overflow-x-auto",
          "flex min-w-max justify-center",
          "[&_.edgeLabel]:fill-foreground [&_.label]:fill-foreground [&_.node_label]:fill-foreground"
        )}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

async function renderWithFallback({
  mermaid,
  diagramId,
  chart,
}: {
  mermaid: {
    render(id: string, text: string): Promise<{ svg: string }>;
  };
  diagramId: string;
  chart: string;
}) {
  try {
    return await mermaid.render(`chat-mermaid-${diagramId}`, chart);
  } catch (firstError) {
    const normalizedChart = normalizeMermaidChart(chart);

    if (normalizedChart === chart) {
      throw firstError;
    }

    return mermaid.render(`chat-mermaid-${diagramId}-normalized`, normalizedChart);
  }
}

function normalizeMermaidChart(chart: string) {
  return chart
    .split("\n")
    .map((line) => {
      const quotedParticipantLine = quoteSequenceAliasLabel(line);
      return escapeSequenceMessageSemicolons(quotedParticipantLine);
    })
    .join("\n");
}

function quoteSequenceAliasLabel(line: string) {
  const match = line.match(/^(\s*(?:actor|participant)\s+\S+\s+as\s+)(.+)$/);
  if (!match) {
    return line;
  }

  const [, prefix, label] = match;
  const trimmedLabel = label.trim();

  if (
    trimmedLabel.length === 0 ||
    (trimmedLabel.startsWith('"') && trimmedLabel.endsWith('"')) ||
    !/[()/:;]/.test(trimmedLabel)
  ) {
    return line;
  }

  const escapedLabel = trimmedLabel.replaceAll('"', '\\"');
  return `${prefix}"${escapedLabel}"`;
}

function escapeSequenceMessageSemicolons(line: string) {
  if (!/(->>|-->>|->|-->|-x|--x)/.test(line)) {
    return line;
  }

  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return line;
  }

  const prefix = line.slice(0, colonIndex + 1);
  const label = line.slice(colonIndex + 1);

  if (!label.includes(";")) {
    return line;
  }

  return `${prefix}${label.replaceAll(";", "#59;")}`;
}

"use client";

import useIsDarkTheme from "@/components/shared/dashboard/use-is-dark-theme";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import * as VizlayerReact from "@vizlayer/react";
import { toChartSpec, VizlayerDiagram, type ParsedVizlayerSpec } from "@vizlayer/react";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";

interface MessageMarkdownVizlayerProps {
  spec: string;
}

type VizlayerSpec = Parameters<typeof toChartSpec>[0];

type BuiltVizlayerChart =
  | {
      ok: true;
      chart: string;
    }
  | {
      ok: false;
      error: string;
    };

export function MessageMarkdownVizlayer({ spec }: MessageMarkdownVizlayerProps) {
  const isDark = useIsDarkTheme();

  const parsed = useMemo<ParsedVizlayerSpec>(() => parseVizlayerSpec(spec), [spec]);

  const chart = useMemo<BuiltVizlayerChart | null>(() => {
    if (!parsed.ok) {
      return null;
    }

    try {
      return {
        ok: true,
        chart: toChartSpec(parsed.spec),
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to build Mermaid from Vizlayer document.",
      };
    }
  }, [parsed]);

  if (!parsed.ok) {
    return (
      <div className="group relative my-2 rounded-md bg-background/40 p-3">
        <CopyButton
          value={spec}
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10 h-7 w-7 rounded-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:h-4 [&_svg]:w-4"
          aria-label="Copy Vizlayer JSON"
          title="Copy Vizlayer JSON"
        />
        <DiagramError title={parsed.error} message={spec} />
      </div>
    );
  }

  if (chart && !chart.ok) {
    return (
      <div className="group relative my-2 rounded-md bg-background/40 p-3">
        <CopyButton
          value={spec}
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10 h-7 w-7 rounded-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:h-4 [&_svg]:w-4"
          aria-label="Copy Vizlayer JSON"
          title="Copy Vizlayer JSON"
        />
        <DiagramError title={chart.error} message={spec} />
      </div>
    );
  }

  return (
    <div className="group relative my-2 rounded-md bg-background/40 p-3">
      <CopyButton
        value={chart?.ok ? chart.chart : spec}
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 z-10 h-7 w-7 rounded-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:h-4 [&_svg]:w-4"
        aria-label="Copy Mermaid code"
        title="Copy Mermaid code"
      />

      {renderDiagram({
        spec: parsed.spec,
        isDark,
      })}
    </div>
  );
}

function parseVizlayerSpec(spec: string): ParsedVizlayerSpec {
  const vizlayerModule = VizlayerReact as typeof VizlayerReact & {
    Vizlayer?: {
      parse: (input: string) => ParsedVizlayerSpec;
    };
    VizlayerSpecParser?: {
      parseVizlayerSpec: (input: string) => ParsedVizlayerSpec;
    };
  };

  if (vizlayerModule.Vizlayer?.parse) {
    return vizlayerModule.Vizlayer.parse(spec);
  }

  if (vizlayerModule.VizlayerSpecParser?.parseVizlayerSpec) {
    return vizlayerModule.VizlayerSpecParser.parseVizlayerSpec(spec);
  }

  return {
    ok: false,
    error: "Unable to parse Vizlayer payload.",
  };
}

function renderDiagram({ spec, isDark }: { spec: VizlayerSpec; isDark: boolean }) {
  return (
    <VizlayerDiagram
      {...spec}
      className={cn(
        "overflow-x-auto",
        "flex min-w-max justify-center",
        "[&_.edgeLabel]:fill-foreground [&_.label]:fill-foreground [&_.node_label]:fill-foreground"
      )}
      loadingFallback={<DiagramLoadingState />}
      errorFallback={(message: string) => (
        <DiagramError title="Unable to render Vizlayer diagram" message={message} />
      )}
      invalidDocumentFallback={(message: string) => (
        <DiagramError title="Invalid Vizlayer document" message={message} />
      )}
      theme={isDark ? "dark" : "default"}
    />
  );
}

function DiagramLoadingState() {
  return (
    <div className="rounded-md bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
      Rendering diagram...
    </div>
  );
}

function DiagramError({ title, message }: { title: string; message: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-destructive/40 bg-destructive/5">
      <div className="flex items-center gap-2 border-b border-destructive/20 px-3 py-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
        {message}
      </pre>
    </div>
  );
}

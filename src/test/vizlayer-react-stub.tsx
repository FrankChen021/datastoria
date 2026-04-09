import type { ReactNode } from "react";

export type ParsedVizlayerSpec =
  | {
      ok: true;
      spec: {
        kind: "flowchart" | "sequenceDiagram" | "classDiagram";
        document: Record<string, unknown>;
      };
    }
  | {
      ok: false;
      error: string;
    };

type VizlayerSpec = {
  kind: "flowchart" | "sequenceDiagram" | "classDiagram";
  document: Record<string, unknown>;
};

type VizlayerDiagramProps = VizlayerSpec & {
  className?: string;
  theme?: "dark" | "default";
  loadingFallback?: ReactNode;
  errorFallback?: (message: string) => ReactNode;
  invalidDocumentFallback?: (message: string) => ReactNode;
};

export function toChartSpec(spec: VizlayerSpec): string {
  return JSON.stringify(spec);
}

export function VizlayerDiagram(_props: VizlayerDiagramProps) {
  return null;
}

function parseVizlayerSpec(input: string): ParsedVizlayerSpec {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        error: "Vizlayer payload must be a JSON object.",
      };
    }

    const maybeSpec = parsed as { kind?: unknown; document?: unknown };
    if (
      maybeSpec.kind !== "flowchart" &&
      maybeSpec.kind !== "sequenceDiagram" &&
      maybeSpec.kind !== "classDiagram"
    ) {
      return {
        ok: false,
        error:
          "Unified Vizlayer payloads must include `kind` set to `flowchart`, `sequenceDiagram`, or `classDiagram`.",
      };
    }

    if (
      !maybeSpec.document ||
      typeof maybeSpec.document !== "object" ||
      Array.isArray(maybeSpec.document)
    ) {
      return {
        ok: false,
        error: "Unified Vizlayer payloads must include an object `document` field.",
      };
    }

    return {
      ok: true,
      spec: maybeSpec as VizlayerSpec,
    };
  } catch {
    return {
      ok: false,
      error: "Diagram is incomplete. Maybe it's still streaming?",
    };
  }
}

export const Vizlayer = {
  parse: parseVizlayerSpec,
};

export const VizlayerSpecParser = {
  parseVizlayerSpec,
};

import { useConnection } from "@/components/connection/connection-context";
import { GraphvizComponent } from "@/components/shared/graphviz/GraphvizComponent";
import { useTheme } from "@/components/shared/theme-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type QueryError, type QueryResponse } from "@/lib/connection/connection";
import { toastManager } from "@/lib/toast";
import { memo, useEffect, useMemo, useState } from "react";
import type { QueryResponseViewProps } from "../query-view-model";
import { QueryResponseErrorView } from "./query-response-error-view";
import { QueryResponseHttpHeaderView } from "./query-response-http-header-view";

/** Convert an rgb() string from getComputedStyle to a hex color string. */
function rgbStringToHex(rgb: string): string {
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return "";
  return `#${parseInt(match[1]).toString(16).padStart(2, "0")}${parseInt(match[2]).toString(16).padStart(2, "0")}${parseInt(match[3]).toString(16).padStart(2, "0")}`;
}

/**
 * Resolve a CSS custom property as a hex color by letting the browser apply
 * the value via a hidden DOM element. Works for any color format the browser
 * supports (OKLCH, HSL, hex, etc.).
 */
function getCSSColorAsHex(cssVar: string): string {
  if (typeof window === "undefined") return "";
  const el = document.createElement("div");
  el.style.backgroundColor = `var(${cssVar})`;
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  const computed = getComputedStyle(el).backgroundColor;
  document.body.removeChild(el);
  return rgbStringToHex(computed);
}

/**
 * Adjust the brightness of a hex color
 * @param hex - Hex color string (e.g., "#ffffff")
 * @param percent - Percentage to adjust (-100 to 100, negative = darker, positive = lighter)
 * @returns Adjusted hex color string
 */
function adjustBrightness(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace("#", "");

  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Adjust brightness
  const adjust = (value: number) => {
    const newValue = Math.round(value * (1 + percent / 100));
    return Math.min(255, Math.max(0, newValue));
  };

  const newR = adjust(r);
  const newG = adjust(g);
  const newB = adjust(b);

  // Convert back to hex
  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

/**
 * ClickHouse has bug that returns extra string before the 'digraph'.
 * We have to clean up these invalid string
 */
function cleanGraphviz(graph: string): string {
  if (!graph) {
    return "";
  }
  const index = graph.indexOf("digraph");
  if (index > 0) {
    return graph.substring(index);
  } else {
    return graph;
  }
}

/**
 * Apply the same styling as dependency-view.tsx to the graphviz dot string
 * Applies styling to both the main graph and all subgraphs for consistency
 */
function applyGraphvizStyling(dot: string, bgColor: string): string {
  if (!dot || dot.trim().length === 0) {
    return dot;
  }

  try {
    // Find the position of the opening brace after digraph declaration
    const digraphMatch = dot.match(/^(digraph(?:\s+\w+)?)\s*\{/m);
    if (!digraphMatch) {
      return dot;
    }

    // Remove existing styling attributes using regex
    let cleaned = dot;

    // Remove existing styling from both main graph and subgraphs
    // (be careful not to remove node/edge definitions)
    cleaned = cleaned.replace(/^\s*bgcolor\s*=\s*"[^"]*"\s*;?\s*$/gm, "");
    cleaned = cleaned.replace(/^\s*fontsize\s*=\s*"[^"]*"\s*;?\s*$/gm, "");
    cleaned = cleaned.replace(/^\s*rankdir\s*=\s*"[^"]*"\s*;?\s*$/gm, "");
    // Remove color and style properties that can override bgcolor in subgraphs
    cleaned = cleaned.replace(/^\s*color\s*=\s*[^;]*\s*;?\s*$/gm, "");
    cleaned = cleaned.replace(/^\s*style\s*=\s*[^;]*\s*;?\s*$/gm, "");
    // Only remove edge/node declarations that are on a single line and standalone
    cleaned = cleaned.replace(/^\s*edge\s*\[[^\]]*\]\s*;?\s*$/gm, "");
    cleaned = cleaned.replace(/^\s*node\s*\[[^\]]*\]\s*;?\s*$/gm, "");

    // Clean up extra blank lines
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

    // Calculate node background color - nodes should be distinct from both main graph and subgraphs
    // For dark themes, nodes should be slightly lighter than main but darker than subgraphs
    // For light themes, nodes should be slightly darker than main but lighter than subgraphs
    const isDark =
      bgColor === "#1a1a2e" ||
      bgColor === "#002B36" ||
      parseInt(bgColor.replace("#", ""), 16) < parseInt("808080", 16);

    // Subgraphs should be much more distinct - make them significantly lighter/darker
    const subgraphBgColor = isDark
      ? adjustBrightness(bgColor, 40) // Much lighter for dark themes
      : adjustBrightness(bgColor, -40); // Much darker for light themes

    // Nodes should have their own background that's between main graph and subgraph
    // This creates a visual hierarchy: main (darkest) < nodes (medium) < subgraphs (lightest for dark theme)
    const nodeBgColor = isDark
      ? adjustBrightness(bgColor, 15) // Nodes are lighter than main but darker than subgraphs
      : adjustBrightness(bgColor, -15); // Nodes are darker than main but lighter than subgraphs

    // Calculate edge color that works for both main graph and subgraphs
    // Edges need to be visible against the main graph background (dark) and subgraph backgrounds (lighter/darker)
    // Use a color that contrasts well with both - for dark themes, use a lighter color; for light themes, use a darker color
    const edgeColor = isDark ? "#a0b0b2" : "#4a5a5c"; // Lighter for dark theme (visible on dark main and light subgraphs), darker for light theme

    // Define styling for main graph (includes rankdir and global edge/node styles)
    // Note: nodes get their own bgcolor to distinguish them from subgraphs
    // Use a thicker penwidth for edges to ensure visibility in subgraphs
    const mainGraphStyling = `\nbgcolor="${bgColor}"\nfontsize="9"\nrankdir="LR";\nedge [arrowhead="normal" fontsize="10" fontcolor="#D3E4E6" color="${edgeColor}" penwidth=2.5 style=solid];\nnode [shape=record fontsize="10" fontcolor="#D3E4E6" color="#839496" style=filled fillcolor="${nodeBgColor}"];\n`;

    // Define styling for subgraphs with very distinct background and border
    // Subgraphs should be clearly visible as containers
    // Note: d3-graphviz doesn't support edge styling in subgraphs, so edges use the global edge color
    const subgraphStyling = `\nstyle=filled\nbgcolor="${subgraphBgColor}"\ncolor="#839496"\npenwidth=2\n`;

    // Apply styling to main graph
    const mainBraceIndex = cleaned.indexOf("{");
    if (mainBraceIndex === -1) {
      return dot;
    }

    let result =
      cleaned.substring(0, mainBraceIndex + 1) +
      mainGraphStyling +
      cleaned.substring(mainBraceIndex + 1);

    // Find and style all subgraphs
    // Match patterns like: subgraph cluster_123 { or subgraph { or subgraph "name" {
    const subgraphRegex = /(subgraph(?:\s+cluster_\w+|\s+"[^"]*"|\s+\w+)?\s*\{)/g;
    let match;

    // Find all subgraph declarations and add styling after each
    // We need to collect all matches first, then process from end to start to avoid offset issues
    const matches: Array<{ index: number; length: number }> = [];
    while ((match = subgraphRegex.exec(result)) !== null) {
      matches.push({ index: match.index, length: match[0].length });
    }

    // Process matches from end to start to avoid index shifting issues
    for (let i = matches.length - 1; i >= 0; i--) {
      const subgraphStart = matches[i].index + matches[i].length;

      // Insert styling right after the opening brace of the subgraph
      const before = result.substring(0, subgraphStart);
      const after = result.substring(subgraphStart);

      result = before + subgraphStyling + after;
    }

    return result;
  } catch {
    // Return original if styling fails
    return dot;
  }
}

interface ExplainPipeGraphViewProps {
  sql: string;
  isActive: boolean;
}

const ExplainPipeCompleteGraphView = memo(
  ({ sql, isActive }: ExplainPipeGraphViewProps) => {
    const { connection } = useConnection();
    const { theme } = useTheme();
    const [rawGraphviz, setRawGraphviz] = useState("");
    const [result, setResult] = useState("");
    const [loadError, setLoadError] = useState<QueryError | null>(null);
    const [bgColor, setBgColor] = useState("#002B36");

    // Update background color based on current theme
    useEffect(() => {
      const isDark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ||
        (typeof window !== "undefined" && document.documentElement.classList.contains("dark"));

      if (isDark) {
        setBgColor(getCSSColorAsHex("--background") || "#1a1a2e");
      } else {
        setBgColor(getCSSColorAsHex("--background") || "#ffffff");
      }
    }, [theme]);

    // Re-apply styling when bgColor changes and we have raw graphviz
    useEffect(() => {
      if (rawGraphviz.length > 0) {
        try {
          const styled = applyGraphvizStyling(rawGraphviz, bgColor);
          setResult(styled);
        } catch {
          // Fallback to un-styled version if styling fails
          setResult(rawGraphviz);
        }
      } else {
        // Reset result when rawGraphviz is cleared
        setResult("");
      }
    }, [bgColor, rawGraphviz]);

    useEffect(() => {
      if (!isActive) {
        return;
      }
      if (rawGraphviz.length > 0) {
        // has been loaded
        return;
      }

      //
      // execute EXPLAIN query to get the text
      //
      if (connection === null || connection === undefined) {
        toastManager.show(
          "No connection selected. Please select a connection to run EXPLAIN.",
          "error"
        );
        return;
      }

      const { response, abortController } = connection.query(sql, {
        default_format: "TSVRaw",
      });

      response
        .then((apiResponse: QueryResponse) => {
          const cleaned = cleanGraphviz(apiResponse.data.text());
          setRawGraphviz(cleaned);
          // Don't set result here - let the useEffect handle styling
          // This ensures styling is applied correctly even if bgColor changes
          setLoadError(null);
        })
        .catch((error: QueryError) => {
          // Ignore abort errors
          const errorMessage = error.message || "Unknown error occurred";
          const lowerErrorMessage = errorMessage.toLowerCase();
          if (
            lowerErrorMessage.includes("cancel") ||
            lowerErrorMessage.includes("abort") ||
            lowerErrorMessage.includes("signal is aborted without reason")
          ) {
            return;
          }

          setRawGraphviz("");
          setResult("");
          setLoadError(error);
        });

      return () => {
        abortController.abort();
      };
    }, [isActive, sql, connection, rawGraphviz.length]);

    if (loadError) {
      return (
        <div className="text-sm text-destructive p-4">
          <pre className="whitespace-pre-wrap">{loadError.message}</pre>
        </div>
      );
    }

    if (result.length > 0) {
      // Validate that result contains valid graphviz before rendering
      if (!result.includes("digraph") || !result.includes("{")) {
        return (
          <div className="text-sm text-destructive p-4">
            <pre className="whitespace-pre-wrap">Invalid graphviz format</pre>
          </div>
        );
      }
      return <GraphvizComponent dot={result} style={{ width: "100%", height: "100%" }} />;
    }

    return <div className="text-sm text-muted-foreground p-4">Loading...</div>;
  },
  (prevProps, nextProps) => {
    // Only re-render if sql prop changes
    return prevProps.sql === nextProps.sql;
  }
);

interface ExplainPipeLineTextViewProps {
  sql: string;
  isActive: boolean;
}

const ExplainPipeLineTextView = memo(
  ({ sql, isActive }: ExplainPipeLineTextViewProps) => {
    const { connection } = useConnection();
    const [result, setResult] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<QueryError | null>(null);

    useEffect(() => {
      if (!isActive) {
        return;
      }
      if (result != null) {
        // has been loaded
        return;
      }

      //
      // execute EXPLAIN query to get the text
      //
      if (connection === null || connection === undefined) {
        toastManager.show(
          "No connection selected. Please select a connection to run EXPLAIN.",
          "error"
        );
        return;
      }

      const { response, abortController } = connection.query(sql, {
        default_format: "TSVRaw",
      });

      response
        .then((apiResponse: QueryResponse) => {
          setResult(apiResponse.data.text() === "" ? null : apiResponse.data.text());
          setLoadError(null);
        })
        .catch((error: QueryError) => {
          // Ignore abort errors
          const errorMessage = error.message || "Unknown error occurred";
          const lowerErrorMessage = errorMessage.toLowerCase();
          if (
            lowerErrorMessage.includes("cancel") ||
            lowerErrorMessage.includes("abort") ||
            lowerErrorMessage.includes("signal is aborted without reason")
          ) {
            return;
          }

          setResult(null);
          setLoadError(error);
        });

      return () => {
        abortController.abort();
      };
    }, [isActive, sql, connection, result]);

    if (loadError) {
      return (
        <div className="text-sm text-destructive p-4">
          <pre className="whitespace-pre-wrap text-xs">{loadError.message}</pre>
        </div>
      );
    }

    if (result) {
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs" style={{ overflowX: "auto" }}>
          {result}
        </pre>
      );
    }

    return <div className="text-sm text-muted-foreground p-4">Loading...</div>;
  },
  (prevProps, nextProps) => {
    // Only re-render if sql prop changes
    return prevProps.sql === nextProps.sql;
  }
);

const ExplainPipelineResponseViewComponent = ({
  queryRequest,
  queryResponse,
  error,
}: QueryResponseViewProps) => {
  const [selectedSubView, setSelectedSubView] = useState(error ? "result" : "compactGraph");
  const { theme } = useTheme();
  const [bgColor, setBgColor] = useState("#002B36");

  // Update background color based on current theme
  useEffect(() => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ||
      (typeof window !== "undefined" && document.documentElement.classList.contains("dark"));

    if (isDark) {
      setBgColor(getCSSColorAsHex("--background") || "#1a1a2e");
    } else {
      setBgColor(getCSSColorAsHex("--background") || "#ffffff");
    }
  }, [theme]);

  const graphModeResult = useMemo(() => {
    if (typeof queryResponse.data !== "string") {
      return undefined;
    }
    try {
      const cleaned = cleanGraphviz(queryResponse.data);
      if (!cleaned || cleaned.trim().length === 0) {
        return undefined;
      }
      return applyGraphvizStyling(cleaned, bgColor);
    } catch {
      const cleaned = cleanGraphviz(queryResponse.data);
      return cleaned && cleaned.trim().length > 0 ? cleaned : undefined;
    }
  }, [queryResponse.data, bgColor]);

  // Extract the raw SQL from the query request
  // The queryRequest.sql might be "EXPLAIN pipeline graph = 1\nSELECT ..."
  // We need to extract just the SELECT part for the other views
  let rawSQL = queryRequest.rawSQL || queryRequest.sql;

  // If rawSQL contains the EXPLAIN prefix, extract the original SQL
  // Remove "EXPLAIN pipeline graph = 1\n" or "EXPLAIN pipeline graph = 1 " prefix if present
  const explainPrefixRegex = /^EXPLAIN\s+pipeline\s+graph\s*=\s*1[\s\n]+/i;
  if (explainPrefixRegex.test(rawSQL)) {
    rawSQL = rawSQL.replace(explainPrefixRegex, "");
  }

  return (
    <Tabs value={selectedSubView} onValueChange={setSelectedSubView} className="mt-2">
      <div className="w-full bg-background">
        <TabsList className="inline-flex min-w-full justify-start rounded-none border-0 h-auto p-0 bg-transparent flex-nowrap">
          {error && (
            <TabsTrigger
              value="result"
              className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Result
            </TabsTrigger>
          )}
          {!error && graphModeResult && (
            <TabsTrigger
              value="compactGraph"
              className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Compact Graph
            </TabsTrigger>
          )}
          {!error && (
            <>
              <TabsTrigger
                value="completeGraph"
                className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Complete Graph
              </TabsTrigger>
              <TabsTrigger
                value="text"
                className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Text
              </TabsTrigger>
            </>
          )}
          {queryResponse.httpHeaders && (
            <TabsTrigger
              value="headers"
              className="rounded-none text-xs border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              Response Headers
            </TabsTrigger>
          )}
        </TabsList>
      </div>
      {error && (
        <TabsContent value="result">
          <QueryResponseErrorView
            error={error}
            queryId={queryRequest.queryId}
            sql={queryRequest.sql}
          />
        </TabsContent>
      )}
      {!error && graphModeResult && (
        <TabsContent value="compactGraph" className="overflow-auto">
          <GraphvizComponent dot={graphModeResult} style={{ width: "100%", height: "100%" }} />
        </TabsContent>
      )}
      {!error && (
        <>
          <TabsContent value="completeGraph" className="overflow-auto">
            <ExplainPipeCompleteGraphView
              isActive={selectedSubView === "completeGraph"}
              sql={`EXPLAIN pipeline graph = 1, compact = 0 ${rawSQL}`}
            />
          </TabsContent>
          <TabsContent value="text" className="overflow-auto">
            <ExplainPipeLineTextView
              isActive={selectedSubView === "text"}
              sql={`EXPLAIN pipeline ${rawSQL}`}
            />
          </TabsContent>
        </>
      )}
      {queryResponse.httpHeaders && (
        <TabsContent value="headers" className="overflow-auto">
          <QueryResponseHttpHeaderView headers={queryResponse.httpHeaders} />
        </TabsContent>
      )}
    </Tabs>
  );
};

export const ExplainPipelineResponseView = memo(ExplainPipelineResponseViewComponent);

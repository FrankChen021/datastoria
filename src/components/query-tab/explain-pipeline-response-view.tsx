import { GraphvizComponent } from "@/components/graphviz-component/GraphvizComponent";
import { useTheme } from "@/components/theme-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ApiErrorResponse, ApiResponse } from "@/lib/api";
import { Api } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { toastManager } from "@/lib/toast";
import { memo, useEffect, useMemo, useState } from "react";
import type { QueryResponseViewProps } from "./query-view-model";

// Convert HSL color (from CSS variable) to hex
function hslToHex(hsl: string): string {
  // Parse HSL string like "222.2 84% 9%"
  const match = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+)%\s+(\d+(?:\.\d+)?)%/);
  if (!match) return "#000000";

  const h = parseFloat(match[1]);
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Get computed CSS variable value
function getCSSVariable(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
  const index = graph.indexOf("digraph");
  if (index > 0) {
    return graph.substring(index);
  } else {
    return graph;
  }
}

/**
 * Apply the same styling as dependency-tab.tsx to the graphviz dot string
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
      console.warn("Could not find digraph declaration in graphviz string");
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
    const isDark = bgColor === "#1a1a2e" || bgColor === "#002B36" || 
                   (parseInt(bgColor.replace("#", ""), 16) < parseInt("808080", 16));
    
    // Subgraphs should be much more distinct - make them significantly lighter/darker
    const subgraphBgColor = isDark 
      ? adjustBrightness(bgColor, 40)  // Much lighter for dark themes
      : adjustBrightness(bgColor, -40); // Much darker for light themes
    
    // Nodes should have their own background that's between main graph and subgraph
    // This creates a visual hierarchy: main (darkest) < nodes (medium) < subgraphs (lightest for dark theme)
    const nodeBgColor = isDark
      ? adjustBrightness(bgColor, 15)  // Nodes are lighter than main but darker than subgraphs
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
      console.warn("Could not find opening brace in graphviz string");
      return dot;
    }

    let result = cleaned.substring(0, mainBraceIndex + 1) + mainGraphStyling + cleaned.substring(mainBraceIndex + 1);

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
  } catch (error) {
    console.error("Error in applyGraphvizStyling:", error);
    // Return original if styling fails
    return dot;
  }
}

interface ExplainPipeGraphViewProps {
  sql: string;
  isActive: boolean;
}

function ExplainPipeCompleteGraphView({ sql, isActive }: ExplainPipeGraphViewProps) {
  const { selectedConnection } = useConnection();
  const { theme } = useTheme();
  const [rawGraphviz, setRawGraphviz] = useState("");
  const [result, setResult] = useState("");
  const [loadError, setLoadError] = useState<ApiErrorResponse | null>(null);
  const [bgColor, setBgColor] = useState("#002B36");

  // Update background color based on current theme
  useEffect(() => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ||
      (typeof window !== "undefined" && document.documentElement.classList.contains("dark"));

    if (isDark) {
      // Dark mode
      const bgHsl = getCSSVariable("--background");
      setBgColor(bgHsl ? hslToHex(bgHsl) : "#1a1a2e");
    } else {
      // Light mode
      const bgHsl = getCSSVariable("--background");
      setBgColor(bgHsl ? hslToHex(bgHsl) : "#ffffff");
    }
  }, [theme]);

  // Re-apply styling when bgColor changes and we have raw graphviz
  useEffect(() => {
    if (rawGraphviz.length > 0) {
      try {
        const styled = applyGraphvizStyling(rawGraphviz, bgColor);
        setResult(styled);
      } catch (error) {
        console.error("Error applying graphviz styling:", error);
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
    const connection = selectedConnection;
    if (connection === null) {
      toastManager.show("No connection selected.", "error");
      return;
    }

    const api = Api.create(connection);

    const canceller = api.executeSQL(
      {
        sql: sql,
        params: {
          default_format: "TSVRaw",
        },
      },
      (response: ApiResponse) => {
        const cleaned = response.data === "" ? "" : cleanGraphviz(response.data);
        setRawGraphviz(cleaned);
        // Don't set result here - let the useEffect handle styling
        // This ensures styling is applied correctly even if bgColor changes
        setLoadError(null);
      },
      (error: ApiErrorResponse) => {
        setRawGraphviz("");
        setResult("");
        setLoadError(error);
      },
      () => {
        // Query execution finished
      }
    );

    return () => {
      canceller.cancel();
    };
  }, [isActive, sql, selectedConnection, rawGraphviz.length]);

  if (loadError) {
    return (
      <div className="text-sm text-destructive p-4">
        <pre className="whitespace-pre-wrap">{loadError.errorMessage}</pre>
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
}

interface ExplainPipeLineTextViewProps {
  sql: string;
  isActive: boolean;
}

function ExplainPipeLineTextView({ sql, isActive }: ExplainPipeLineTextViewProps) {
  const { selectedConnection } = useConnection();
  const [result, setResult] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<ApiErrorResponse | null>(null);

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
    const connection = selectedConnection;
    if (connection === null) {
      toastManager.show("No connection selected.", "error");
      return;
    }

    const api = Api.create(connection);

    const canceller = api.executeSQL(
      {
        sql: sql,
        params: {
          default_format: "TSVRaw",
        },
      },
      (response: ApiResponse) => {
        setResult(response.data === "" ? null : response.data);
        setLoadError(null);
      },
      (error: ApiErrorResponse) => {
        setResult(null);
        setLoadError(error);
      },
      () => {
        // Query execution finished
      }
    );

    return () => {
      canceller.cancel();
    };
  }, [isActive, sql, selectedConnection, result]);

  if (loadError) {
    return (
      <div className="text-sm text-destructive p-4">
        <pre className="whitespace-pre-wrap">{loadError.errorMessage}</pre>
      </div>
    );
  }

  if (result) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap" style={{ overflowX: "auto" }}>
        {result}
      </pre>
    );
  }

  return <div className="text-sm text-muted-foreground p-4">Loading...</div>;
}

const ExplainPipelineResponseViewComponent = ({ queryRequest, queryResponse }: QueryResponseViewProps) => {
  const [selectedSubView, setSelectedSubView] = useState("compactGraph");
  const { theme } = useTheme();
  const [bgColor, setBgColor] = useState("#002B36");

  // Update background color based on current theme
  useEffect(() => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ||
      (typeof window !== "undefined" && document.documentElement.classList.contains("dark"));

    if (isDark) {
      // Dark mode
      const bgHsl = getCSSVariable("--background");
      setBgColor(bgHsl ? hslToHex(bgHsl) : "#1a1a2e");
    } else {
      // Light mode
      const bgHsl = getCSSVariable("--background");
      setBgColor(bgHsl ? hslToHex(bgHsl) : "#ffffff");
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
    } catch (error) {
      console.error("Error processing compact graph:", error);
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
      <TabsList>
        {graphModeResult && <TabsTrigger value="compactGraph">Compact Graph</TabsTrigger>}
        <TabsTrigger value="completeGraph">Complete Graph</TabsTrigger>
        <TabsTrigger value="text">Text</TabsTrigger>
      </TabsList>
      {graphModeResult && (
        <TabsContent value="compactGraph" className="overflow-auto">
          <GraphvizComponent dot={graphModeResult} style={{ width: "100%", height: "100%" }} />
        </TabsContent>
      )}
      <TabsContent value="completeGraph" className="overflow-auto">
        <ExplainPipeCompleteGraphView
          isActive={selectedSubView === "completeGraph"}
          sql={`EXPLAIN pipeline graph = 1, compact = 0 ${rawSQL}`}
        />
      </TabsContent>
      <TabsContent value="text" className="overflow-auto">
        <ExplainPipeLineTextView isActive={selectedSubView === "text"} sql={`EXPLAIN pipeline ${rawSQL}`} />
      </TabsContent>
    </Tabs>
  );
};

export const ExplainPipelineResponseView = memo(ExplainPipelineResponseViewComponent);

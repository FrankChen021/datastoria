import FloatingProgressBar from "@/components/floating-progress-bar";
import { GraphvizComponent } from "@/components/graphviz-component/GraphvizComponent";
import { TabManager } from "@/components/tab-manager";
import { useTheme } from "@/components/theme-provider";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import type { ApiErrorResponse, ApiResponse } from "@/lib/api";
import { Api } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { StringUtils } from "@/lib/string-utils";
import { toastManager } from "@/lib/toast";
import { ExternalLink, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { DependencyBuilder } from "./DependencyBuilder";

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

// The response data object
interface Table {
  id: string;
  database: string;
  name: string;
  engine: string;
  tableQuery: string;

  dependenciesDatabase: string[];
  dependenciesTable: string[];

  serverVersion: string;

  isTargetDatabase: boolean;
}

interface DependencyGraphNode {
  id: string;

  type: "Internal" | "External";

  database: string;
  name: string;
  engine: string;
  query: string;

  // ids of target nodes
  targets: string[];
}

function toTableNode(node: DependencyGraphNode): string {
  return node.engine === ""
    ? `${node.id}[color=red,label="{NOT FOUND}|${node.database}|${node.name}"];\n`
    : `${node.id}[label="{&lt;&lt;${node.engine}&gt;&gt;}|${node.database}|${node.name}" id="${node.id}" ];\n`;
}

export interface DependencyTabProps {
  database: string;
  tabId?: string;
}

const DependencyTabComponent = ({ database }: DependencyTabProps) => {
  const { selectedConnection } = useConnection();
  const [queryResponse, setQueryResponse] = useState<{
    data?: unknown;
    errorMessage?: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasExecutedRef = useRef(false);

  const [showTableNode, setShowTableNode] = useState<DependencyGraphNode | undefined>(undefined);
  const { theme } = useTheme();
  
  // Compute initial background color from theme
  const [bgColor, setBgColor] = useState(() => {
    if (typeof window === "undefined") return "#ffffff";
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ||
      document.documentElement.classList.contains("dark");
    const bgHsl = getCSSVariable("--background");
    return bgHsl ? hslToHex(bgHsl) : (isDark ? "#1a1a2e" : "#ffffff");
  });

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

  useEffect(() => {
    if (!selectedConnection) {
      toastManager.show("No connection selected", "error");
      return;
    }

    // Prevent duplicate execution
    if (hasExecutedRef.current) {
      return;
    }
    hasExecutedRef.current = true;

    setIsLoading(true);
    setQueryResponse(null);

    // Execute the dependency query directly (without version)
    const api = Api.create(selectedConnection);
    const dependencySql = `
SELECT
    concat(database, '_', name) AS id,
    database,
    name,
    engine,
    create_table_query AS tableQuery,
    dependencies_database AS dependenciesDatabase,
    dependencies_table AS dependenciesTable,
    database = '${database}' AS isTargetDatabase
FROM system.tables`;

    api.executeSQL(
      {
        sql: dependencySql,
        params: {
          default_format: "JSON",
          output_format_json_quote_64bit_integers: 0,
        },
      },
      (response: ApiResponse) => {
        setQueryResponse({
          data: response.data,
          errorMessage: null,
        });
        setIsLoading(false);
      },
      (error: ApiErrorResponse) => {
        setQueryResponse({
          data: error.data,
          errorMessage: error.errorMessage || "Unknown error occurred",
        });
        setIsLoading(false);
        toastManager.show(`Dependency query failed: ${error.errorMessage}`, "error");
      },
      () => {
        // Query execution finished
      }
    );

    // Reset the ref when database or connection changes
    return () => {
      hasExecutedRef.current = false;
    };
  }, [selectedConnection, database]);

  const { graphviz, nodes } = useMemo(() => {
    if (!queryResponse) {
      return { graphviz: "", nodes: new Map<string, DependencyGraphNode>() };
    }

    const responseData = queryResponse.data as { data?: Table[] } | undefined;
    const tables = responseData?.data;
    if (!tables || tables.length === 0) {
      return { graphviz: "", nodes: new Map<string, DependencyGraphNode>() };
    }

    const builder = new DependencyBuilder(tables);
    builder.build();

    if (builder.getNodes().size === 0) {
      return { graphviz: "", nodes: new Map<string, DependencyGraphNode>() };
    }

    //
    // to GraphViz format
    //
    let graphText = "digraph struct {\n";
    graphText += `bgcolor="${bgColor}"\n`;
    graphText += 'fontsize="9"\n';
    graphText += 'rankdir="LR";\n';
    graphText += 'edge [arrowhead="oopen" fontsize="10" fontcolor="#D3E4E6" color="#839496"];\n';
    graphText += 'node [shape=record fontsize="10" fontcolor="#D3E4E6" color="#839496"];\n';

    builder.getNodes().forEach((node) => {
      graphText += toTableNode(node);
    });

    builder.getEdges().forEach((edge) => {
      graphText += `${edge.source} -> ${edge.target}`;
      if (edge.label !== undefined) {
        graphText += `[label="${edge.label}"]`;
      }
      graphText += "\n";
    });
    graphText += "}";

    return { graphviz: graphText, nodes: builder.getNodes() };
  }, [queryResponse, bgColor]);

  const onGraphAction = useCallback((action: string, _x: number, _y: number, _type: string, key: string) => {
    if (action !== "click") {
      return;
    }

    const graphNode = nodes.get(key);
    if (graphNode === undefined) {
      return;
    }

    setShowTableNode(graphNode);
  }, [nodes]);

  const handleOpenTableTab = useCallback(() => {
    if (!showTableNode) return;
    TabManager.sendOpenTableTabRequest(showTableNode.database, showTableNode.name, showTableNode.engine);
  }, [showTableNode]);

  const handleCloseTableNode = useCallback(() => {
    setShowTableNode(undefined);
  }, []);

  if (!queryResponse && !isLoading) {
    return null;
  }

  return (
    <PanelGroup direction="horizontal" className="h-full w-full relative">
      <FloatingProgressBar show={isLoading} />
      {graphviz.length > 0 && (
        <>
          {/* Left Panel: Dependency View */}
          <Panel defaultSize={showTableNode ? 60 : 100} minSize={showTableNode ? 30 : 0} className="bg-background">
            <GraphvizComponent dot={graphviz} style={{ width: "100%", height: "100%" }} onGraphAction={onGraphAction} />
          </Panel>

          {/* Splitter */}
          {showTableNode && (
            <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors cursor-col-resize" />
          )}

          {/* Right Panel: DDL View */}
          {showTableNode && (
            <Panel defaultSize={40} minSize={5} maxSize={70} className="bg-background border-l shadow-lg flex flex-col">
              {/* Header with close button */}
              <div className="flex items-center justify-between px-2 py-1 border-b flex-shrink-0">
                <Button
                  variant="link"
                  className="font-semibold h-auto p-0 text-left flex items-center"
                  onClick={handleOpenTableTab}
                  title={`Open table ${showTableNode.database}.${showTableNode.name}`}
                >
                  <h4 className="truncate">{showTableNode.database + "." + showTableNode.name}</h4>
                  <ExternalLink className="h-4 w-4 flex-shrink-0" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCloseTableNode} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* DDL content */}
              <div className="flex-1 overflow-auto p-4">
                <ThemedSyntaxHighlighter
                  customStyle={{ fontSize: "14px", margin: 0 }}
                  language="sql"
                  showLineNumbers={true}
                >
                  {StringUtils.prettyFormatQuery(showTableNode.query)}
                </ThemedSyntaxHighlighter>
              </div>
            </Panel>
          )}
        </>
      )}
      {!isLoading && graphviz.length === 0 && (
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Tables under this database have no dependencies.</div>
        </div>
      )}
    </PanelGroup>
  );
};

export const DependencyTab = memo(DependencyTabComponent);

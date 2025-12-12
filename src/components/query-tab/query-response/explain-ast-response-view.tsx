import { GraphvizComponent } from "@/components/shared/graphviz/GraphvizComponent";
import { useTheme } from "@/components/theme-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stack } from "@/lib/stack";
import { memo, useEffect, useState } from "react";
import type { QueryResponseViewProps } from "../query-view-model";

interface ASTNode {
  id: string;
  text: string;
  level: number;
}

interface ASTNodeEdge {
  from: string;
  to: string;
}

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ExplainASTResponseViewComponent = ({ queryRequest: _queryRequest, queryResponse }: QueryResponseViewProps) => {
  const text = typeof queryResponse.data === "string" ? queryResponse.data : String(queryResponse.data || "");
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

  /**
   * Although ClickHouse can generate graph directly by setting graph = 1, it uses the default visual style.
   * To make the result more controllable, we generate the graph by ourselves
   *
   * Input:
   *     SelectWithUnionQuery (children 1)
   *      ExpressionList (children 1)
   *      SelectQuery (children 4)
   *       ExpressionList (children 2)
   *        Identifier table
   *        Function count (children 1)
   *         ExpressionList
   *       TablesInSelectQuery (children 1)
   *        TablesInSelectQueryElement (children 1)
   *         TableExpression (children 1)
   *          TableIdentifier system.parts
   *       Identifier active
   *       ExpressionList (children 1)
   *        Identifier table
   *
   * Output:
   *    digraph {
   *        _background="c 7 -#ff0000 p 4 4 4 36 4 36 36 4 36";
   *        node [margin=0 fontcolor=blue fontsize=32 width=0.5 shape=circle style=filled]
   *        n4752328920[label="SelectWithUnionQuery (children 1)"];
   *        n4988202216[label="ExpressionList (children 1)"];
   *        n5003235576[label="SelectQuery (children 4)"];
   *        n4989427352[label="ExpressionList (children 2)"];
   *        ...
   *        n4987340568 -> n5038776808;
   *        ...
   *    }
   */
  const toGraphvizFormat = (text: string, bgColor: string): string | undefined => {
    if (text.length === 0) {
      return undefined;
    }

    const nodes = new Array<ASTNode>();
    const edges = new Array<ASTNodeEdge>();

    // intermediate state
    const stack = new Stack<ASTNode>();
    let nodeId = new Date().getTime();

    //
    // to graph
    //
    const lines = text.split("\n");
    lines.forEach((line) => {
      if (line.length === 0) {
        return;
      }

      let i = 0;
      while (line.charAt(i) === " ") i++;

      const nodeText = line.substring(i);
      const nodeLevel = i;
      while (stack.isNotEmpty() && stack.peek().level >= nodeLevel) {
        stack.pop();
      }

      // create a new node
      const node: ASTNode = {
        // assign a unique id
        id: "n" + nodeId++,
        text: nodeText,
        level: nodeLevel,
      };

      if (stack.isNotEmpty()) {
        edges.push({
          from: stack.peek().id,
          to: node.id,
        });
      }
      nodes.push(node);
      stack.push(node);
    });

    //
    // to GraphViz format
    let graphText = "digraph struct {\n";
    graphText += `bgcolor="${bgColor}"\n`;
    graphText += 'fontsize="9"\n';
    graphText += 'edge [arrowhead="oopen" fontsize="10" fontcolor="#D3E4E6" color="#839496"];\n';
    graphText += 'node [shape=record fontsize="10" fontcolor="#D3E4E6" color="#839496"];\n';
    nodes.forEach((node) => {
      // n4752328920[label="SelectWithUnionQuery (children 1)"];
      graphText += `${node.id}[label="${node.text}"];\n`;
    });
    edges.forEach((edge) => {
      // n4987340568 -> n5038776808;
      graphText += `${edge.from} -> ${edge.to}\n`;
    });
    graphText += "}";

    return graphText;
  };

  const graphModeResult = toGraphvizFormat(text, bgColor);
  const textModeResult = text;

  return (
    <Tabs defaultValue="graph" className="mt-2">
      <TabsList>
        {graphModeResult && <TabsTrigger value="graph">Graph Mode</TabsTrigger>}
        {textModeResult && <TabsTrigger value="text">Text Mode</TabsTrigger>}
      </TabsList>
      {graphModeResult && (
        <TabsContent value="graph" className="overflow-auto">
          <GraphvizComponent dot={graphModeResult} style={{ width: "100%", height: "100%" }} />
        </TabsContent>
      )}
      {textModeResult && (
        <TabsContent value="text" className="overflow-auto">
          <pre className="whitespace-pre-wrap text-xs">{textModeResult}</pre>
        </TabsContent>
      )}
    </Tabs>
  );
};

export const ExplainASTResponseView = memo(ExplainASTResponseViewComponent);

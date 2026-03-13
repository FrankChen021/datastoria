import { useTheme } from "@/components/shared/theme-provider";
import { useEffect, useMemo, useRef, useState } from "react";
import { Prism as SyntaxHighlighter, type SyntaxHighlighterProps } from "react-syntax-highlighter";
import {
  vscDarkPlus as darkStyle,
  vs as lightStyle,
} from "react-syntax-highlighter/dist/cjs/styles/prism";

const SEARCH_HIGHLIGHT_ATTR = "data-search-highlight";

interface ThemedSyntaxHighlighterProps extends Omit<SyntaxHighlighterProps, "style"> {
  language?: string;
  children: string;
  customStyle?: React.CSSProperties;
  highlightQuery?: string;
  /**
   * If true, the highlighter will collapse long content and show an expandable
   * control. Default: false.
   */
  expandable?: boolean;
  /**
   * Number of lines to show when collapsed. Only used when `expandable` is true.
   */
  collapseLines?: number;
  /**
   * Line height in pixels used to compute collapsed height. Default: 20.
   */
  lineHeightPx?: number;
}

export function ThemedSyntaxHighlighter({
  language = "sql",
  children,
  customStyle,
  highlightQuery,
  expandable = false,
  collapseLines = 8,
  lineHeightPx = 20,
  ...props
}: ThemedSyntaxHighlighterProps) {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return window.document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    // Check if dark mode is active by looking at the DOM
    const checkTheme = () => {
      const root = window.document.documentElement;
      const darkMode = root.classList.contains("dark");
      setIsDark(darkMode);
    };

    // Initial check
    checkTheme();

    // Watch for theme changes via DOM class changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Also update when theme context changes
    if (theme === "dark") {
      setIsDark(true);
    } else if (theme === "light") {
      setIsDark(false);
    } else if (theme === "system") {
      // For system theme, check the actual rendered theme
      const root = window.document.documentElement;
      setIsDark(root.classList.contains("dark"));
    }

    return () => observer.disconnect();
  }, [theme]);

  // Read theme directly from DOM on every render to ensure accuracy
  // This handles cases where state might not be in sync yet
  const currentDarkMode =
    typeof window !== "undefined"
      ? window.document.documentElement.classList.contains("dark")
      : isDark;

  // Use memoized style that updates when theme actually changes
  const syntaxStyle = useMemo(() => {
    return currentDarkMode ? darkStyle : lightStyle;
  }, [currentDarkMode]);
  const highlightRootRef = useRef<HTMLDivElement | null>(null);
  const sql = children ?? "";
  const sqlLines = useMemo(() => String(sql).split(/\r\n|\r|\n/).length, [sql]);
  const isOverflowing = useMemo(() => sqlLines > collapseLines, [sqlLines, collapseLines]);
  const collapsedHeight = collapseLines * lineHeightPx;
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = highlightRootRef.current;
    if (!root) {
      return;
    }

    clearSearchHighlights(root);

    const query = highlightQuery?.trim();
    if (!query) {
      return;
    }

    applySearchHighlights(root, query, currentDarkMode);

    return () => {
      clearSearchHighlights(root);
    };
  }, [children, currentDarkMode, highlightQuery]);

  // If not expandable, render as before
  if (!expandable) {
    return (
      <div ref={highlightRootRef}>
        <SyntaxHighlighter
          key={`${currentDarkMode ? "dark" : "light"}-${theme}`}
          customStyle={{ background: "transparent", ...customStyle }}
          language={language}
          style={syntaxStyle}
          {...props}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={wrapperRef}
        aria-expanded={expanded}
        style={{
          maxHeight: !expanded && isOverflowing ? `${collapsedHeight}px` : undefined,
          overflow: "hidden",
          position: "relative",
          transition: "max-height 220ms ease",
        }}
      >
        <div ref={highlightRootRef}>
          <SyntaxHighlighter
            key={`${currentDarkMode ? "dark" : "light"}-${theme}`}
            customStyle={{ background: "transparent", ...customStyle }}
            language={language}
            style={syntaxStyle}
            {...props}
          >
            {children}
          </SyntaxHighlighter>
        </div>

        {!expanded && isOverflowing && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 48,
              background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(17,24,39,0.7) 100%)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {isOverflowing && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((prev) => {
              if (prev) {
                // Current is expanded, it will be collapsed, scroll to the end to show the 'truncated'
                requestAnimationFrame(() => {
                  const wrapper = wrapperRef.current;
                  if (wrapper) {
                    wrapper.scrollIntoView({ behavior: "smooth", block: "end" });
                  }
                });
              }
              return !prev;
            });
          }}
          className="absolute right-2 bottom-2 z-10 text-muted-foreground text-sm rounded px-2 py-1"
          style={{ position: "absolute", right: 8, bottom: 8 }}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

function applySearchHighlights(root: HTMLElement, query: string, isDark: boolean) {
  const normalizedQuery = query.toLocaleLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text) || node.nodeValue == null || node.nodeValue.length === 0) {
        return NodeFilter.FILTER_REJECT;
      }

      const parentElement = node.parentElement;
      if (!parentElement || parentElement.closest(`[${SEARCH_HIGHLIGHT_ATTR}]`)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  const nodeRanges: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;

  for (const textNode of textNodes) {
    const source = textNode.nodeValue ?? "";
    nodeRanges.push({
      node: textNode,
      start: cursor,
      end: cursor + source.length,
    });
    cursor += source.length;
  }

  const fullText = nodeRanges.map(({ node }) => node.nodeValue ?? "").join("");
  const normalizedFullText = fullText.toLocaleLowerCase();
  const matches: Array<{ start: number; end: number }> = [];

  let searchFrom = 0;
  while (searchFrom < normalizedFullText.length) {
    const matchIndex = normalizedFullText.indexOf(normalizedQuery, searchFrom);
    if (matchIndex === -1) {
      break;
    }

    matches.push({
      start: matchIndex,
      end: matchIndex + query.length,
    });
    searchFrom = matchIndex + query.length;
  }

  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index];
    if (!match) {
      continue;
    }

    for (let rangeIndex = nodeRanges.length - 1; rangeIndex >= 0; rangeIndex--) {
      const range = nodeRanges[rangeIndex];
      if (!range || match.end <= range.start || match.start >= range.end) {
        continue;
      }

      const node = range.node;
      const source = node.nodeValue ?? "";
      const localStart = Math.max(0, match.start - range.start);
      const localEnd = Math.min(source.length, match.end - range.start);

      if (localStart >= localEnd) {
        continue;
      }

      let targetNode = node;
      if (localEnd < targetNode.length) {
        targetNode.splitText(localEnd);
      }
      if (localStart > 0) {
        targetNode = targetNode.splitText(localStart);
      }

      const mark = document.createElement("mark");
      mark.setAttribute(SEARCH_HIGHLIGHT_ATTR, "true");
      mark.style.backgroundColor = isDark ? "rgba(250, 204, 21, 0.28)" : "rgba(250, 204, 21, 0.42)";
      mark.style.color = "inherit";
      mark.style.padding = "0";
      mark.style.borderRadius = "2px";
      targetNode.parentNode?.replaceChild(mark, targetNode);
      mark.appendChild(targetNode);
    }
  }
}

function clearSearchHighlights(root: HTMLElement) {
  const highlights = root.querySelectorAll<HTMLElement>(`mark[${SEARCH_HIGHLIGHT_ATTR}]`);

  for (const highlight of highlights) {
    const parent = highlight.parentNode;
    if (!parent) {
      continue;
    }

    parent.replaceChild(document.createTextNode(highlight.textContent ?? ""), highlight);
    parent.normalize();
  }
}

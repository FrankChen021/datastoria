import { useTheme } from "@/components/shared/theme-provider";
import { useEffect, useMemo, useRef, useState } from "react";
import { Prism as SyntaxHighlighter, type SyntaxHighlighterProps } from "react-syntax-highlighter";
import {
  vscDarkPlus as darkStyle,
  vs as lightStyle,
} from "react-syntax-highlighter/dist/cjs/styles/prism";

interface ThemedSyntaxHighlighterProps extends Omit<SyntaxHighlighterProps, "style"> {
  language?: string;
  children: string;
  customStyle?: React.CSSProperties;
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
  // If not expandable, render as before
  if (!expandable) {
    return (
      <SyntaxHighlighter
        key={`${currentDarkMode ? "dark" : "light"}-${theme}`}
        customStyle={{ background: "transparent", ...customStyle }}
        language={language}
        style={syntaxStyle}
        {...props}
      >
        {children}
      </SyntaxHighlighter>
    );
  }

  // Expandable behavior: compute line count and collapse height
  const sql = children ?? "";
  const sqlLines = useMemo(() => String(sql).split(/\r\n|\r|\n/).length, [sql]);
  const isOverflowing = useMemo(() => sqlLines > collapseLines, [sqlLines, collapseLines]);
  const collapsedHeight = collapseLines * lineHeightPx;

  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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
        <SyntaxHighlighter
          key={`${currentDarkMode ? "dark" : "light"}-${theme}`}
          customStyle={{ background: "transparent", ...customStyle }}
          language={language}
          style={syntaxStyle}
          {...props}
        >
          {children}
        </SyntaxHighlighter>

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

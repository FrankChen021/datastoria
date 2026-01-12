import { useTheme } from "@/components/theme-provider";
import { useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter, type SyntaxHighlighterProps } from "react-syntax-highlighter";
import {
  vscDarkPlus as darkStyle,
  vs as lightStyle,
} from "react-syntax-highlighter/dist/cjs/styles/prism";

interface ThemedSyntaxHighlighterProps extends Omit<SyntaxHighlighterProps, "style"> {
  language?: string;
  children: string;
  customStyle?: React.CSSProperties;
}

export function ThemedSyntaxHighlighter({
  language = "sql",
  children,
  customStyle,
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

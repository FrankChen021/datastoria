"use client";

import { useConnection } from "@/components/connection/connection-context";
import { QuerySuggestionManager } from "@/components/query-tab/query-input/completion/query-suggestion-manager";
import { useTheme } from "@/components/shared/theme-provider";
import type { Ace } from "ace-builds";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// Dynamically import AceEditor (same pattern as query-input-view.tsx)
const AceEditor = dynamic(
  async () => {
    const { initAce } = await import("@/components/query-tab/query-input/ace-setup");
    await initAce();

    await import("ace-builds/src-noconflict/ext-language_tools");
    await import("ace-builds/src-noconflict/mode-sql");
    await import("ace-builds/src-noconflict/theme-xcode");
    await import("ace-builds/src-noconflict/theme-solarized_dark");
    await import("@/components/query-tab/query-input/completion/clickhouse-sql");

    const ReactAce = await import("react-ace");
    return ReactAce.default;
  },
  { ssr: false }
);

type ExtendedEditor = {
  completer?: Ace.Autocomplete;
} & Ace.Editor;

interface PanelEditSqlEditorProps {
  initialSql: string;
  onSqlChange: (sql: string) => void;
  onRunQuery: () => void;
}

const TEMPLATE_VARS = [
  "{timeFilter}",
  "{filterExpression}",
  "{from:String}",
  "{to:String}",
  "{rounding:UInt32}",
  "{seconds:UInt32}",
  "{startTimestamp:UInt32}",
  "{endTimestamp:UInt32}",
];

function PanelEditSqlEditorComponent({
  initialSql,
  onSqlChange,
  onRunQuery,
}: PanelEditSqlEditorProps) {
  const { connection } = useConnection();
  const { theme } = useTheme();
  const editorRef = useRef<ExtendedEditor | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(200);
  const [editorWidth, setEditorWidth] = useState(800);
  const latestOnRunQuery = useRef(onRunQuery);
  const latestOnSqlChange = useRef(onSqlChange);

  useEffect(() => {
    latestOnRunQuery.current = onRunQuery;
  }, [onRunQuery]);

  useEffect(() => {
    latestOnSqlChange.current = onSqlChange;
  }, [onSqlChange]);

  // Dark mode detection (same pattern as query-input-view)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return window.document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    const checkTheme = () => {
      if (typeof window !== "undefined") {
        setIsDark(window.document.documentElement.classList.contains("dark"));
      }
    };
    checkTheme();

    const observer = new MutationObserver(checkTheme);
    if (typeof window !== "undefined") {
      observer.observe(window.document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    if (theme === "dark") setIsDark(true);
    else if (theme === "light") setIsDark(false);
    else if (theme === "system" && typeof window !== "undefined") {
      setIsDark(window.document.documentElement.classList.contains("dark"));
    }

    return () => observer.disconnect();
  }, [theme]);

  const currentDarkMode =
    typeof window !== "undefined"
      ? window.document.documentElement.classList.contains("dark")
      : isDark;

  const aceTheme = useMemo(() => (currentDarkMode ? "solarized_dark" : "xcode"), [currentDarkMode]);

  // Initialize completions when connection changes
  useEffect(() => {
    if (connection) {
      QuerySuggestionManager.getInstance().onConnectionSelected(connection);
    }
  }, [connection]);

  // Update editor theme when it changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setTheme(`ace/theme/${aceTheme}`);
    }
  }, [aceTheme]);

  // Handle editor resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length !== 1) return;
      const entry = entries[0];
      setEditorHeight(entry.contentRect.height);
      setEditorWidth(entry.contentRect.width);
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const handleEditorLoad = useCallback(
    (editor: Ace.Editor) => {
      const extendedEditor = editor as ExtendedEditor;

      // Set initial value
      editor.setValue(initialSql);
      editor.renderer.setScrollMargin(5, 10, 0, 0);

      // Set up completers
      editor.completers = QuerySuggestionManager.getInstance().getCompleters(editor.completers);

      // Clear selection and move cursor to end
      editor.clearSelection();
      const session = editor.getSession();
      const lines = session.getLength();
      if (lines > 0) {
        const lastLine = session.getLine(lines - 1);
        editor.moveCursorTo(lines - 1, lastLine.length);
      }

      // Add Run Query command (Ctrl+Enter / Cmd+Enter)
      editor.commands.addCommand({
        name: "runQuery",
        bindKey: { win: "Ctrl-Enter", mac: "Command-Enter" },
        exec: () => {
          latestOnRunQuery.current();
        },
      });

      editorRef.current = extendedEditor;
    },
    [initialSql]
  );

  const handleChange = useCallback((text: string) => {
    latestOnSqlChange.current(text);
  }, []);

  const keyBindings = useMemo(() => {
    if (typeof window === "undefined") return "Ctrl+Enter";
    const isMac =
      window.navigator.platform.toLowerCase().includes("mac") ||
      window.navigator.userAgent.toLowerCase().includes("mac");
    return isMac ? "⌘+Enter" : "Ctrl+Enter";
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* SQL editor label */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Query
        </span>
        <span className="text-xs text-muted-foreground/60">{keyBindings} to run</span>
      </div>

      {/* Editor */}
      <div ref={containerRef} className="flex-1 min-h-0">
        <AceEditor
          mode="sql"
          theme={aceTheme}
          className="no-background h-full w-full"
          name="panel-edit-ace-editor"
          fontSize={13}
          showPrintMargin={false}
          editorProps={{ $blockScrolling: Infinity }}
          highlightActiveLine={true}
          setOptions={{
            showLineNumbers: true,
            tabSize: 2,
            newLineMode: "auto",
            foldStyle: "markbeginend",
            showFoldWidgets: true,
          }}
          enableBasicAutocompletion={true}
          enableLiveAutocompletion={true}
          enableSnippets={true}
          width={`${editorWidth}px`}
          height={`${editorHeight}px`}
          placeholder="Write your SQL query here..."
          onLoad={handleEditorLoad}
          onChange={handleChange}
        />
      </div>

      {/* Template variables reference */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-t bg-muted/20 shrink-0 overflow-x-auto">
        <span className="text-[10px] text-muted-foreground/60 shrink-0">Variables:</span>
        {TEMPLATE_VARS.map((v) => (
          <code
            key={v}
            className="text-[10px] text-muted-foreground bg-muted/50 px-1 py-0.5 rounded shrink-0"
          >
            {v}
          </code>
        ))}
      </div>
    </div>
  );
}

PanelEditSqlEditorComponent.displayName = "PanelEditSqlEditor";

export const PanelEditSqlEditor = memo(PanelEditSqlEditorComponent);

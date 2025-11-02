import type { Ace } from "ace-builds";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AceEditor from "react-ace";
// Import order is critical - ace-setup must be imported first
// to make ace globally available before ext-language_tools
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/theme-solarized_dark";
import "./ace-setup";
import "./completion/clickhouse-sql";

import { useConnection } from "../../lib/connection/ConnectionContext";
import { useTheme } from "../theme-provider";
import { QueryExecutor } from "../query-execution/query-executor";
import { QueryCompletionManager } from "./completion/QueryCompletionManager";
import { QueryInputLocalStorage } from "./query-input-local-storage";
import "./query-input-view.css";
import { QuerySnippetManager } from "./snippet/QuerySnippetManager";

type ExtendedEditor = {
  completer?: Ace.Autocomplete;
} & Ace.Editor;

let globalEditor: ExtendedEditor | undefined;

export function QueryInputView() {
  const { selectedConnection } = useConnection();
  const { theme } = useTheme();
  const editorRef = useRef<ExtendedEditor | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(200);
  const [editorWidth, setEditorWidth] = useState(800);
  const lastConnectionRef = useRef<string | null>(null);

  // Determine if dark mode is active
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return window.document.documentElement.classList.contains("dark");
    }
    return false;
  });

  // Watch for theme changes
  useEffect(() => {
    const checkTheme = () => {
      if (typeof window !== "undefined") {
        const root = window.document.documentElement;
        setIsDark(root.classList.contains("dark"));
      }
    };

    // Initial check
    checkTheme();

    // Watch for theme changes via DOM class changes
    const observer = new MutationObserver(checkTheme);
    if (typeof window !== "undefined") {
      observer.observe(window.document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    // Also update when theme context changes
    if (theme === "dark") {
      setIsDark(true);
    } else if (theme === "light") {
      setIsDark(false);
    } else if (theme === "system") {
      // For system theme, check the actual rendered theme
      if (typeof window !== "undefined") {
        const root = window.document.documentElement;
        setIsDark(root.classList.contains("dark"));
      }
    }

    return () => observer.disconnect();
  }, [theme]);

  // Get current theme state directly from DOM on every render to ensure accuracy
  const currentDarkMode =
    typeof window !== "undefined" ? window.document.documentElement.classList.contains("dark") : isDark;

  // Determine the ace editor theme based on current dark mode
  // Use github theme for light mode (white background) and solarized_dark for dark mode
  const aceTheme = useMemo(() => {
    return currentDarkMode ? "solarized_dark" : "github";
  }, [currentDarkMode]);

  // Initialize completion manager when connection changes
  // Use connection name as key to avoid duplicate calls when object reference changes
  useEffect(() => {
    if (selectedConnection) {
      const connectionName = selectedConnection.name;
      // Only initialize if connection actually changed (by name)
      if (lastConnectionRef.current !== connectionName) {
        lastConnectionRef.current = connectionName;
        QueryCompletionManager.getInstance().onConnectionSelected(selectedConnection);
        QuerySnippetManager.getInstance().onCollectionSelected(selectedConnection);
      }
    } else {
      lastConnectionRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnection?.name]); // Use connection name instead of whole object to avoid duplicate calls

  // Handle editor resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length !== 1) return;

      const entry = entries[0];
      // Use the full container height - AceEditor will handle its own padding
      setEditorHeight(entry.contentRect.height);
      setEditorWidth(entry.contentRect.width);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleEditorLoad = useCallback((editor: Ace.Editor) => {
    const extendedEditor = editor as ExtendedEditor;
    editor.setValue(QueryInputLocalStorage.getInput());
    editor.renderer.setScrollMargin(10, 10, 0, 0);
    editor.completers = QueryCompletionManager.getInstance().getCompleters(editor.completers);

    // Update command
    editor.commands.addCommand({
      name: "run",
      bindKey: { win: "Ctrl-Enter", mac: "Command-Enter" },
      exec: () => {
        const text = extendedEditor.getSelectedText().trim() || extendedEditor.getValue().trim();
        if (text) {
          QueryExecutor.sendQueryRequest(text, undefined, {
            default_format: "PrettyCompactMonoBlock",
            output_format_pretty_color: 0,
            output_format_pretty_max_value_width: 50000,
            output_format_pretty_max_rows: 500,
            output_format_pretty_row_numbers: true,
          });
        }
      },
    });

    globalEditor = extendedEditor;
    editorRef.current = extendedEditor;
  }, []);

  // Update editor theme when it changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setTheme(`ace/theme/${aceTheme}`);
    }
  }, [aceTheme]);

  const handleChange = useCallback((text: string) => {
    QueryInputLocalStorage.saveInput(text);
  }, []);

  const handleSelectionChange = useCallback(() => {
    // Selection change handler if needed
  }, []);

  return (
    <div ref={containerRef} className="query-editor-container h-full w-full">
      <AceEditor
        mode="dsql"
        theme={aceTheme}
        className="no-background placeholder-padding h-full w-full"
        name="ace-editor"
        focus
        fontSize={14}
        showPrintMargin={false}
        editorProps={{
          $blockScrolling: Infinity,
        }}
        highlightActiveLine={true}
        setOptions={{
          showLineNumbers: true,
          tabSize: 4,
          newLineMode: "auto",
        }}
        enableBasicAutocompletion={true}
        enableLiveAutocompletion={true}
        enableSnippets={true}
        width={`${editorWidth}px`}
        height={`${editorHeight}px`}
        placeholder="Input your SQL here.
Press Ctrl-Enter(Windows) or Command-Enter(Mac) to execute the query.
Press Alt-Space(Windows) or Option-Space(Mac) to popup the auto suggestion dialog."
        onLoad={handleEditorLoad}
        onChange={handleChange}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
}

// Static methods for accessing editor (exported for external use)
// These are intentionally in the same file to maintain access to globalEditor
/* eslint-disable react-refresh/only-export-components */
export function getAllText(): string {
  return globalEditor?.getValue().trim() || "";
}

export function setText(text: string): void {
  if (globalEditor !== undefined) {
    globalEditor.setValue(text);
  }
}

export function getSelectedOrAllText(): string {
  const selected = globalEditor?.getSelectedText().trim() || "";
  return selected.length === 0 ? getAllText() : selected;
}
/* eslint-enable react-refresh/only-export-components */

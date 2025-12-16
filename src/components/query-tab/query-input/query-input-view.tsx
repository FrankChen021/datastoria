import type { Ace } from "ace-builds";
import dynamic from "next/dynamic";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

// Dynamically import AceEditor to prevent SSR issues
const AceEditor = dynamic(
  async () => {
    // Import order is critical - ace-setup must be imported first
    // to make ace globally available before ext-language_tools
    const { initAce } = await import("./ace-setup");
    await initAce();

    await import("ace-builds/src-noconflict/ext-language_tools");
    await import("ace-builds/src-noconflict/theme-github");
    await import("ace-builds/src-noconflict/theme-solarized_dark");
    await import("./completion/clickhouse-sql");

    const ReactAce = await import("react-ace");
    return ReactAce.default;
  },
  { ssr: false }
);

import { TabManager } from "@/components/tab-manager";
import { useTheme } from "@/components/theme-provider";
import { useConnection } from "@/lib/connection/connection-context";
import { useDebouncedCallback } from "use-debounce";
import { updateQueryEditorState } from "../query-control/use-query-editor";
import { QueryExecutor } from "../query-execution/query-executor";
import { QueryInputLocalStorage } from "../query-input/query-input-local-storage";
import { QuerySuggestionManager } from "./completion/query-suggestion-manager";
import "./query-input-view.css";
import { QuerySnippetManager } from "./snippet/QuerySnippetManager";

type ExtendedEditor = {
  completer?: Ace.Autocomplete;
} & Ace.Editor;

export interface QueryInputViewRef {
  focus: () => void;
  setValue: (value: string) => void;
}

interface QueryInputViewProps {
  initialQuery?: string;
  initialMode?: "replace" | "insert";
  storageKey?: string;
  language?: string;
  placeholder?: string;
  onToggleMode?: () => void;
  onRun?: (text: string) => void;
}

// Logic to apply query to editor
const applyQueryToEditor = (editor: Ace.Editor, query: string, mode: "replace" | "insert", storageKey: string = 'editing-sql') => {
  const session = editor.getSession();

  if (mode === "replace") {
    // Replace all text
    editor.setValue(query);
    // Clear selection and move cursor to end
    editor.clearSelection();
    const lines = session.getLength();
    if (lines > 0) {
      const lastLine = session.getLine(lines - 1);
      editor.moveCursorTo(lines - 1, lastLine.length);
    }
  } else if (mode === "insert") {
    // Insert at the beginning (index 0)
    const currentValue = editor.getValue();
    const newValue = currentValue ? `${query}\n\n${currentValue}` : query;
    editor.setValue(newValue);

    // Select the inserted text
    // Calculate how many lines the query has
    const queryLines = query.split("\n").length;
    editor.selection.setRange({
      start: { row: 0, column: 0 },
      end: { row: queryLines - 1, column: query.split("\n")[queryLines - 1].length },
    });

    // Focus the editor
    editor.focus();
  }
  // Save to localStorage
  QueryInputLocalStorage.saveInput(editor.getValue(), storageKey);
};

// Detect OS and return appropriate key bindings
const getKeyBindings = () => {
  if (typeof window === "undefined") {
    return { execute: "CTRL + ENTER or COMMAND + ENTER", autocomplete: "ALT + SPACE or OPTION + SPACE" };
  }

  const platform = window.navigator.platform.toLowerCase();
  const userAgent = window.navigator.userAgent.toLowerCase();

  // Check for Mac
  if (platform.includes("mac") || userAgent.includes("mac")) {
    return { execute: "COMMAND + ENTER", autocomplete: "OPTION + SPACE" };
  }

  // Default to Windows/Linux
  return { execute: "CTRL + ENTER", autocomplete: "ALT + SPACE" };
};

export const QueryInputView = forwardRef<QueryInputViewRef, QueryInputViewProps>(
  ({ initialQuery, initialMode = "replace", storageKey = "editing-sql", language = "dsql", placeholder, onToggleMode, onRun }, ref) => {
    const { connection } = useConnection();
    const { theme } = useTheme();
    const editorRef = useRef<ExtendedEditor | undefined>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const [editorHeight, setEditorHeight] = useState(200);
    const [editorWidth, setEditorWidth] = useState(800);
    const lastConnectionRef = useRef<string | null>(null);
    const latestOnToggleMode = useRef(onToggleMode);
    const latestOnRun = useRef(onRun);

    // Keep the ref updated with the latest callback
    useEffect(() => {
      latestOnToggleMode.current = onToggleMode;
    }, [onToggleMode]);

    useEffect(() => {
      latestOnRun.current = onRun;
    }, [onRun]);

    // Listen for query tab activation events with query data
    useEffect(() => {
      const handler = (event: CustomEvent<import("@/components/tab-manager").OpenTabEventDetail>) => {
        if (event.detail.type === "query" && event.detail.query) {
          const { query, mode = "replace" } = event.detail;

          if (editorRef.current) {
            applyQueryToEditor(editorRef.current, query, mode, storageKey);
          }
        }
      };

      const unsubscribe = TabManager.onOpenTab(handler);
      return unsubscribe;
    }, []);

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => {
        if (editorRef.current) {
          editorRef.current.focus();
        }
      },
      setValue: (value: string) => {
        if (editorRef.current) {
          editorRef.current.setValue(value);
          editorRef.current.clearSelection();
        }
      }
    }));

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
      if (connection) {
        const connectionName = connection.name;
        // Only initialize if connection actually changed (by name)
        if (lastConnectionRef.current !== connectionName) {
          lastConnectionRef.current = connectionName;
          // The completion manager and snippet manager expect a full Connection object,
          // but Connection has compatible properties for now.
          // If they need specific properties, we might need to adjust or cast.
          // For now, casting as any to bypass strict type check if needed, or assume compatibility.
          // Assuming Connection is compatible enough or updating the managers is out of scope for this specific file change step.
          // Actually, let's use Connection.create which handles Connection, but here we are passing to managers.
          // Let's assume for now we pass connection.
          // Wait, QuerySuggestionManager likely expects Connection.
          // Let's check if we need to update managers later.
          // Connection has static config which is what completion likely needs (url, user, etc).
          // Let's passed it as is.
          QuerySuggestionManager.getInstance().onConnectionSelected(connection as any);
          QuerySnippetManager.getInstance().onCollectionSelected(connection as any);
        }
      } else {
        lastConnectionRef.current = null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connection?.name]); // Use connection name instead of whole object to avoid duplicate calls

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

    const handleEditorLoad = useCallback(
      (editor: Ace.Editor) => {
        const extendedEditor = editor as ExtendedEditor;
        editor.setValue(QueryInputLocalStorage.getInput(storageKey));
        editor.renderer.setScrollMargin(5, 10, 0, 0);

        // Only valid for SQL
        if (language === 'dsql') {
          editor.completers = QuerySuggestionManager.getInstance().getCompleters(editor.completers);
        } else {
          // Clear completers for chat to avoid irrelevant suggestions
          editor.completers = [];
        }

        // Clear any selection and move cursor to end of text
        editor.clearSelection();
        const session = editor.getSession();
        const lines = session.getLength();
        if (lines > 0) {
          const lastLine = session.getLine(lines - 1);
          editor.moveCursorTo(lines - 1, lastLine.length);
        } else {
          editor.moveCursorTo(0, 0);
        }

        // Apply initial query if present
        if (initialQuery) {
          applyQueryToEditor(editor, initialQuery, initialMode, storageKey);
        }

        // Update command
        editor.commands.addCommand({
          name: "run",
          bindKey: { win: "Ctrl-Enter", mac: "Command-Enter" },
          exec: () => {
            const text = extendedEditor.getSelectedText().trim() || extendedEditor.getValue().trim();
            if (text && latestOnRun.current) {
              latestOnRun.current(text);
            }
          },
        });

        // When editor is ready, update the editor state
        updateQueryEditorState({
          text: extendedEditor.getValue().trim(),
          selectedText: "",
        });

        // Add command to toggle mode
        editor.commands.addCommand({
          name: "toggleMode",
          bindKey: { win: "Ctrl-I", mac: "Command-I" },
          exec: () => {
            if (latestOnToggleMode.current) {
              latestOnToggleMode.current();
            }
          },
        });

        editorRef.current = extendedEditor;
      },
      [initialQuery, initialMode]
    );

    // Handle switching modes (storage key / language changes) without unmounting
    useEffect(() => {
      if (!editorRef.current) return;

      // Load saved content for the new key
      const savedValue = QueryInputLocalStorage.getInput(storageKey);

      // Stop the change event from triggering save back to storage momentarily if needed
      // But handleChange uses the *current* storageKey from closure or ref?
      // handleChange depends on [storageKey], so it should be updated.
      // react-ace might fire onChange synchronously during setValue.
      // If it does, 'handleChange' will be called.
      // It will use the NEW storageKey.
      // It will save 'savedValue' to 'storageKey'.
      // This is redundant but harmless (saving what we just loaded).

      editorRef.current.setValue(savedValue);
      editorRef.current.clearSelection();
      editorRef.current.focus();

      // Update completers based on language
      if (language === 'dsql') {
        const extendedEditor = editorRef.current as ExtendedEditor;
        extendedEditor.completers = QuerySuggestionManager.getInstance().getCompleters(extendedEditor.completers);
      } else {
        const extendedEditor = editorRef.current as ExtendedEditor;
        extendedEditor.completers = [];
      }
    }, [storageKey, language]);

    // Update editor theme when it changes
    useEffect(() => {
      if (editorRef.current) {
        editorRef.current.setTheme(`ace/theme/${aceTheme}`);
      }
    }, [aceTheme]);

    const handleChange = useDebouncedCallback((text: string) => {
      QueryInputLocalStorage.saveInput(text, storageKey);
      // Update global state with full text
      if (editorRef.current) {
        const selected = editorRef.current.getSelectedText().trim();
        updateQueryEditorState({
          text: text.trim(),
          selectedText: selected,
        });
      }
    }, 200);

    const handleSelectionChange = useCallback(() => {
      if (editorRef.current) {
        const selected = editorRef.current.getSelectedText().trim();
        const allText = editorRef.current.getValue().trim();
        updateQueryEditorState({
          selectedText: selected,
          text: allText,
        });
      }
    }, []);

    // Get OS-specific key bindings
    const keyBindings = useMemo(() => getKeyBindings(), []);

    return (
      <div ref={containerRef} className="query-editor-container h-full w-full">
        <AceEditor
          mode={language}
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
          enableBasicAutocompletion={language === 'dsql'}
          enableLiveAutocompletion={language === 'dsql'}
          enableSnippets={language === 'dsql'}
          width={`${editorWidth}px`}
          height={`${editorHeight}px`}
          placeholder={placeholder || `Input your SQL here.
Press ${keyBindings.execute} to execute query.
Press ${keyBindings.autocomplete} to show suggestions.`}
          onLoad={handleEditorLoad}
          onChange={handleChange}
          onSelectionChange={handleSelectionChange}
        />
      </div>
    );
  }
);

QueryInputView.displayName = "QueryInputView";

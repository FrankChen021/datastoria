import {
  AgentCommandBrowserPanel,
  type AgentCommandBrowserItem,
} from "@/components/chat/agent-command-browser-panel";
import { useAgentCommands } from "@/components/chat/agent-command-context";
import { sqlSnippetTokenCodec } from "@/components/chat/input/sql-snippet-token";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { useConnection } from "@/components/connection/connection-context";
import {
  AgentConfigurationManager,
  normalizeAIResponseLanguage,
} from "@/components/settings/agent/agent-manager";
import { useTheme } from "@/components/shared/theme-provider";
import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import { SqlUtils } from "@/lib/sql-utils";
import type { Ace } from "ace-builds";
import { ChevronDown, Play, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDebouncedCallback } from "use-debounce";
import { useQueryExecutor } from "../query-execution/query-executor";
import { QueryInputLocalStorage } from "../query-input/query-input-local-storage";
import { QuerySuggestionManager } from "./completion/query-suggestion-manager";
import "./query-input-view.css";
import { QuerySnippetManager } from "../snippet/query-snippet-manager";
import { updateQueryInputState } from "./use-query-input";

// Dynamically import AceEditor to prevent SSR issues
const AceEditor = dynamic(
  async () => {
    // Import order is critical - ace-setup must be imported first
    // to make ace globally available before ext-language_tools
    const { initAce } = await import("./ace-setup");
    await initAce();

    await import("ace-builds/src-noconflict/ext-language_tools");
    await import("ace-builds/src-noconflict/mode-sql");
    await import("ace-builds/src-noconflict/theme-xcode");
    await import("ace-builds/src-noconflict/theme-solarized_dark");
    await import("./completion/clickhouse-sql");

    const ReactAce = await import("react-ace");
    return ReactAce.default;
  },
  { ssr: false }
);

type ExtendedEditor = {
  completer?: Ace.Autocomplete;
} & Ace.Editor;

export interface QueryInputViewRef {
  focus: () => void;
  setValue: (value: string) => void;
  setQuery: (query: string, mode: "replace" | "insert") => void;
}

interface QueryInputViewProps {
  initialQuery?: string;
  initialMode?: "replace" | "insert";
  storageKey?: string;
  language?: string;
  onRun?: (sql: string) => void;
}

type SelectionActionState = {
  sql: string;
  top: number;
  left: number;
  placement: "above" | "below";
  align: "start" | "center" | "end";
};

const FLOATING_ACTION_HEIGHT = 28;
const FLOATING_ACTION_GAP = 8;
const FLOATING_ACTION_ESTIMATED_WIDTH = 420;

// Logic to apply query to editor
const applyQueryToEditor = (
  editor: Ace.Editor,
  query: string,
  mode: "replace" | "insert",
  storageKey: string = "editor"
) => {
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
    return {
      execute: "CTRL + ENTER or COMMAND + ENTER",
      autocomplete: "ALT + SPACE or OPTION + SPACE",
    };
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
  (
    { initialQuery, initialMode = "replace", storageKey = "editor", language = "dsql", onRun },
    ref
  ) => {
    const { connection } = useConnection();
    const { postMessage, setDisplayMode, setInitialInput } = useChatPanel();
    const { commands } = useAgentCommands();
    const { isSqlExecuting, executeQuery } = useQueryExecutor();
    const { theme } = useTheme();
    const editorRef = useRef<ExtendedEditor | undefined>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const [editorHeight, setEditorHeight] = useState(200);
    const [editorWidth, setEditorWidth] = useState(800);
    const [selectionAction, setSelectionAction] = useState<SelectionActionState | null>(null);
    const [isAgentActionsOpen, setIsAgentActionsOpen] = useState(false);
    const lastConnectionRef = useRef<string | null>(null);
    const latestOnRun = useRef(onRun);
    const isMouseSelectingRef = useRef(false);
    const sqlEditorCommands = commands.filter((command) => command.showInSqlEditorQuickAction);

    useEffect(() => {
      latestOnRun.current = onRun;
    }, [onRun]);

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
      },
      setQuery: (query: string, mode: "replace" | "insert") => {
        if (editorRef.current) {
          applyQueryToEditor(editorRef.current, query, mode, storageKey);
        }
      },
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
      typeof window !== "undefined"
        ? window.document.documentElement.classList.contains("dark")
        : isDark;

    // Determine the ace editor theme based on current dark mode
    // Use xcode theme for light mode (better syntax highlighting) and solarized_dark for dark mode
    const aceTheme = useMemo(() => {
      return currentDarkMode ? "solarized_dark" : "xcode";
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
          QuerySuggestionManager.getInstance().onConnectionSelected(connection);
          QuerySnippetManager.getInstance().onConnectionChanged(connection);
        }
      } else {
        lastConnectionRef.current = null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connection?.name]); // Use connection name instead of whole object to avoid duplicate calls

    // Subscribe to snippet changes and refresh completers
    useEffect(() => {
      const unsubscribe = QuerySnippetManager.getInstance().subscribe(() => {
        if (editorRef.current && language === "dsql") {
          const extendedEditor = editorRef.current as ExtendedEditor;
          // Detach the existing completer to clear its cache
          if (extendedEditor.completer) {
            extendedEditor.completer.detach();
          }
          // Reassign completers to force ACE to use fresh data
          extendedEditor.completers = QuerySuggestionManager.getInstance().getCompleters(
            extendedEditor.completers
          );
        }
      });

      return unsubscribe;
    }, [language]);

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

    const updateSelectionAction = useCallback(() => {
      if (isMouseSelectingRef.current) {
        setSelectionAction(null);
        return;
      }

      const editor = editorRef.current;
      const container = containerRef.current;

      if (!editor || !container) {
        setSelectionAction(null);
        return;
      }

      const selectedSql = editor.getSelectedText().trim();
      if (selectedSql.length === 0) {
        setSelectionAction(null);
        return;
      }

      const range = editor.getSelectionRange();
      if (
        !range ||
        (range.start.row === range.end.row && range.start.column === range.end.column)
      ) {
        setSelectionAction(null);
        return;
      }

      const startCoords = editor.renderer.textToScreenCoordinates(
        range.start.row,
        range.start.column
      );
      const endCoords =
        range.start.row === range.end.row
          ? editor.renderer.textToScreenCoordinates(range.end.row, range.end.column)
          : startCoords;
      const containerRect = container.getBoundingClientRect();
      const rawLeft =
        (startCoords.pageX + endCoords.pageX) / 2 - window.scrollX - containerRect.left;
      const lineHeight = editor.renderer.lineHeight ?? 16;
      const anchorTop = startCoords.pageY - window.scrollY - containerRect.top;
      const canRenderAbove = anchorTop >= FLOATING_ACTION_HEIGHT + FLOATING_ACTION_GAP + 4;
      const placement = canRenderAbove ? "above" : "below";
      const top = canRenderAbove
        ? anchorTop - FLOATING_ACTION_HEIGHT - FLOATING_ACTION_GAP
        : anchorTop + lineHeight + FLOATING_ACTION_GAP;
      const minCenteredLeft = FLOATING_ACTION_ESTIMATED_WIDTH / 2 + 8;
      const maxCenteredLeft = containerRect.width - FLOATING_ACTION_ESTIMATED_WIDTH / 2 - 8;
      const align =
        rawLeft < minCenteredLeft ? "start" : rawLeft > maxCenteredLeft ? "end" : "center";
      const left =
        align === "start"
          ? Math.max(startCoords.pageX - window.scrollX - containerRect.left, 8)
          : align === "end"
            ? Math.min(
                endCoords.pageX - window.scrollX - containerRect.left,
                containerRect.width - 8
              )
            : rawLeft;

      setSelectionAction({
        sql: selectedSql,
        top: Math.max(top, 8),
        left,
        placement,
        align,
      });
    }, []);

    // Cleanup scroll event listeners when component unmounts
    useEffect(() => {
      return () => {
        if (editorRef.current) {
          const cleanup = (editorRef.current as { __scrollCleanup?: () => void }).__scrollCleanup;
          if (cleanup) {
            cleanup();
          }
        }
      };
    }, []);

    const handleEditorLoad = useCallback(
      (editor: Ace.Editor) => {
        const extendedEditor = editor as ExtendedEditor;
        const session = editor.getSession();
        editor.setValue(QueryInputLocalStorage.getInput(storageKey));
        editor.renderer.setScrollMargin(5, 10, 0, 0);

        // Prevent scroll event propagation from tooltip description to suggestion list
        // The CSS overscroll-behavior: contain should handle most cases,
        // but we also stop wheel event propagation as a backup
        const attachScrollPrevention = (element: HTMLElement) => {
          const preventPropagation = (e: WheelEvent) => {
            // Stop propagation in the bubble phase (after the scroll has happened)
            // This allows the scroll to work within the description div,
            // but prevents it from bubbling up to the suggestion list
            e.stopPropagation();
          };

          // Don't use capture - let the event reach the element first so it can scroll
          // Then stop it from bubbling up to parent elements
          element.addEventListener("wheel", preventPropagation, { passive: false });
        };

        // Watch for tooltip scrollable divs and attach scroll prevention
        const observer = new MutationObserver(() => {
          const scrollableDivs = document.querySelectorAll(".ace-tooltip-scrollable");
          scrollableDivs.forEach((div) => {
            if (!(div as HTMLElement).dataset.scrollPrevented) {
              attachScrollPrevention(div as HTMLElement);
              (div as HTMLElement).dataset.scrollPrevented = "true";
            }
          });
        });

        // Observe document body for tooltip additions
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        // Also attach to any existing scrollable divs
        const existingDivs = document.querySelectorAll(".ace-tooltip-scrollable");
        existingDivs.forEach((div) => attachScrollPrevention(div as HTMLElement));

        const syncSelectionAction = () => {
          updateSelectionAction();
        };

        const handleMouseDown = (event: MouseEvent) => {
          if (event.button !== 0) {
            return;
          }

          isMouseSelectingRef.current = true;
          setSelectionAction(null);
        };

        const handleMouseUp = () => {
          if (!isMouseSelectingRef.current) {
            return;
          }

          isMouseSelectingRef.current = false;
          requestAnimationFrame(() => {
            updateSelectionAction();
          });
        };

        session.on("changeScrollTop", syncSelectionAction);
        session.on("changeScrollLeft", syncSelectionAction);
        extendedEditor.selection.on("changeSelection", syncSelectionAction);
        editor.container.addEventListener("mousedown", handleMouseDown);
        window.addEventListener("mouseup", handleMouseUp);

        // Store cleanup function
        (extendedEditor as { __scrollCleanup?: () => void }).__scrollCleanup = () => {
          observer.disconnect();
          session.off("changeScrollTop", syncSelectionAction);
          session.off("changeScrollLeft", syncSelectionAction);
          extendedEditor.selection.off("changeSelection", syncSelectionAction);
          editor.container.removeEventListener("mousedown", handleMouseDown);
          window.removeEventListener("mouseup", handleMouseUp);
        };

        // Only valid for SQL
        if (language === "dsql") {
          editor.completers = QuerySuggestionManager.getInstance().getCompleters(editor.completers);
        } else {
          // Clear completers for other modes
          editor.completers = [];
        }

        // Clear any selection and move cursor to end of text
        editor.clearSelection();
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
            if (extendedEditor.getValue().trim().length > 0 && latestOnRun.current) {
              const cursor = extendedEditor.getCursorPosition();
              const sql = SqlUtils.resolveExecutionSql({
                selectedText: extendedEditor.getSelectedText(),
                text: extendedEditor.getValue(),
                cursorRow: cursor.row,
                cursorColumn: cursor.column,
              });
              if (sql.length > 0) {
                latestOnRun.current(sql);
              }
            }
          },
        });

        // When editor is ready, update the editor state
        const initialCursor = extendedEditor.getCursorPosition();
        updateQueryInputState({
          text: extendedEditor.getValue(),
          selectedText: "",
          cursorRow: initialCursor.row,
          cursorColumn: initialCursor.column,
        });

        // Add command to toggle mode
        // editor.commands.addCommand({
        //   name: "toggleMode",
        //   bindKey: { win: "Ctrl-I", mac: "Command-I" },
        //   exec: () => {
        //     if (latestOnToggleMode.current) {
        //       latestOnToggleMode.current();
        //     }
        //   },
        // });

        editorRef.current = extendedEditor;
        updateSelectionAction();
      },
      [initialQuery, initialMode, language, storageKey, updateSelectionAction]
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
      if (language === "dsql") {
        const extendedEditor = editorRef.current as ExtendedEditor;
        extendedEditor.completers = QuerySuggestionManager.getInstance().getCompleters(
          extendedEditor.completers
        );
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
        const cursor = editorRef.current.getCursorPosition();
        updateQueryInputState({
          text,
          selectedText: selected,
          cursorRow: cursor.row,
          cursorColumn: cursor.column,
        });
      }
    }, 200);

    const handleSelectionChange = useCallback(() => {
      if (editorRef.current) {
        const selected = editorRef.current.getSelectedText().trim();
        const allText = editorRef.current.getValue();
        const cursor = editorRef.current.getCursorPosition();
        updateQueryInputState({
          selectedText: selected,
          text: allText,
          cursorRow: cursor.row,
          cursorColumn: cursor.column,
        });
        updateSelectionAction();
      }
    }, [updateSelectionAction]);

    const handleCursorChange = useCallback(() => {
      if (editorRef.current) {
        const selected = editorRef.current.getSelectedText().trim();
        const allText = editorRef.current.getValue();
        const cursor = editorRef.current.getCursorPosition();
        updateQueryInputState({
          selectedText: selected,
          text: allText,
          cursorRow: cursor.row,
          cursorColumn: cursor.column,
        });
        updateSelectionAction();
      }
    }, [updateSelectionAction]);

    const handleAddSelectionToChat = useCallback(() => {
      if (!selectionAction?.sql) {
        return;
      }

      setSelectionAction(null);
      setInitialInput(
        `${sqlSnippetTokenCodec.createToken(selectionAction.sql)} `,
        undefined,
        "append"
      );
      setDisplayMode("panel");
    }, [selectionAction, setDisplayMode, setInitialInput]);

    const handleRunSelectedText = useCallback(() => {
      const sql = selectionAction?.sql?.trim();
      if (!sql) {
        return;
      }
      setSelectionAction(null);
      executeQuery(sql);
    }, [executeQuery, selectionAction?.sql]);

    const handleExplain = useCallback(
      (type: string) => {
        const sql = selectionAction?.sql?.trim();
        if (!sql) {
          return;
        }

        const { explainSQL, rawSQL } = SqlUtils.toExplainSQL(type, sql);
        if (rawSQL.length === 0) {
          return;
        }

        const viewType = type === "plan" ? "plan" : type;
        setSelectionAction(null);
        executeQuery(explainSQL, rawSQL, { view: viewType });
      },
      [executeQuery, selectionAction?.sql]
    );

    const handleSqlEditorCommand = useCallback(
      (command: CommandDetail) => {
        const sql = selectionAction?.sql?.trim();
        if (!sql) {
          Dialog.alert({
            title: "No SQL To Send",
            description: "Select a SQL statement before running an AI action.",
          });
          return;
        }

        const normalizedSql = SqlUtils.removeComments(sql);
        if (normalizedSql.length === 0) {
          Dialog.alert({
            title: "No SQL To Send",
            description: "Select a SQL statement before running an AI action.",
          });
          return;
        }

        const statements = SqlUtils.splitSqlStatements(normalizedSql);
        if (statements.length !== 1) {
          Dialog.alert({
            title: "Single Statement Required",
            description:
              "AI actions from the SQL editor currently support exactly one SQL statement at a time.",
          });
          return;
        }

        const reviewLanguage = normalizeAIResponseLanguage(
          AgentConfigurationManager.getConfiguration().aiResponseLanguage
        );

        setSelectionAction(null);
        setIsAgentActionsOpen(false);
        postMessage(`/${command.name}\n\n\`\`\`sql\n${statements[0]}\n\`\`\``, {
          forceNewChat: true,
          agentContext: { responseLanguage: reviewLanguage },
        });
      },
      [postMessage, selectionAction?.sql]
    );

    const sqlEditorActionItems = useMemo<AgentCommandBrowserItem[]>(
      () =>
        sqlEditorCommands.map((command) => ({
          key: command.name,
          label: `/${command.name}`,
          description: command.description,
        })),
      [sqlEditorCommands]
    );

    // Get OS-specific key bindings
    const keyBindings = useMemo(() => getKeyBindings(), []);
    let placeholderText = "";
    if (language === "dsql") {
      placeholderText = `Input your SQL here.
Press ${keyBindings.execute} to execute query.
Press ${keyBindings.autocomplete} to show suggestions.
  `;
    }

    return (
      <div ref={containerRef} className="query-editor-container relative h-full w-full">
        {selectionAction ? (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              top: selectionAction.top,
              left: selectionAction.left,
              transform:
                selectionAction.align === "start"
                  ? "translateX(0)"
                  : selectionAction.align === "end"
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            <div className="pointer-events-auto flex items-center gap-0 rounded-sm border border-border bg-background/95 px-1 py-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/85">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 rounded-sm px-2 text-[11px]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleRunSelectedText}
                disabled={isSqlExecuting}
              >
                <Play className="h-3 w-3" />
                Run
              </Button>
              <div className="mx-1 h-4 w-px bg-border" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-0.5 rounded-sm px-2 text-[11px]"
                    onMouseDown={(event) => event.preventDefault()}
                    disabled={isSqlExecuting}
                  >
                    Explain
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleExplain("ast")}>
                    Explain AST
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExplain("syntax")}>
                    Explain Syntax
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExplain("plan")}>
                    Explain Plan
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExplain("pipeline")}>
                    Explain Pipeline
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExplain("estimate")}>
                    Explain Estimate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 rounded-sm px-2 text-[11px]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleAddSelectionToChat}
              >
                Add to Chat
              </Button>
              {sqlEditorActionItems.length > 0 ? (
                <>
                  <div className="mx-1 h-4 w-px bg-border" />
                  <Popover open={isAgentActionsOpen} onOpenChange={setIsAgentActionsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-0.5 rounded-sm px-2 text-[11px]"
                        onMouseDown={(event) => event.preventDefault()}
                        disabled={isSqlExecuting}
                      >
                        <Sparkles className="h-3 w-3" />
                        AI Commands
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="z-30 w-auto border-0 bg-transparent p-0"
                      onOpenAutoFocus={(event) => event.preventDefault()}
                    >
                      <AgentCommandBrowserPanel
                        items={sqlEditorActionItems}
                        onSelectItem={(item) => {
                          setIsAgentActionsOpen(false);
                          const command = sqlEditorCommands.find(
                            (candidate) => candidate.name === item.key
                          );
                          if (command) {
                            handleSqlEditorCommand(command);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
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
            foldStyle: "markbeginend",
            showFoldWidgets: true,
          }}
          enableBasicAutocompletion={language === "dsql"}
          enableLiveAutocompletion={language === "dsql"}
          enableSnippets={language === "dsql"}
          width={`${editorWidth}px`}
          height={`${editorHeight}px`}
          placeholder={placeholderText}
          onLoad={handleEditorLoad}
          onChange={handleChange}
          onSelectionChange={handleSelectionChange}
          onCursorChange={handleCursorChange}
        />
      </div>
    );
  }
);

QueryInputView.displayName = "QueryInputView";

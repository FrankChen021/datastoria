"use client";

import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import type { LanguageModelUsage } from "ai";
import { MessageSquarePlus, Send, Square } from "lucide-react";
import * as React from "react";
import { useChatCommands } from "../command-context";
import { ChatTokenStatus } from "../message/chat-token-status";
import { ChatInputCommands, type ChatInputCommandsType } from "./chat-input-commands";
import {
  ChatInputSuggestions,
  type ChatInputSuggestionItem,
  type ChatInputSuggestionsType,
} from "./chat-input-suggestions";
import { replaceLeadingCommand } from "./command-utils";
import { ModelSelector } from "./model-selector";

export { replaceLeadingCommand } from "./command-utils";

const MIN_CHAT_INPUT_HEIGHT = 116;
const MAX_CHAT_INPUT_HEIGHT = 360;
const TEXTAREA_MIN_HEIGHT = 80;

interface ChatInputProps {
  onSubmit: (text: string) => void;
  onStop?: () => void;
  isRunning: boolean;
  hasMessages?: boolean;
  tokenUsage?: LanguageModelUsage;
  onNewChat?: () => void;
  externalInput?: string;
}

export interface ChatInputHandle {
  getInput: () => string;
  focus: () => void;
}

export const ChatInput = React.forwardRef<ChatInputHandle, ChatInputProps>(
  (
    { onSubmit, onStop, isRunning, hasMessages = false, tokenUsage, onNewChat, externalInput },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const suggestionRef = React.useRef<ChatInputSuggestionsType>(null);
    const commandRef = React.useRef<ChatInputCommandsType>(null);
    const dragStateRef = React.useRef<{
      startY: number;
      startHeight: number;
      nextHeight: number;
    } | null>(null);
    const resizeFrameRef = React.useRef<number | null>(null);
    const [input, setInput] = React.useState("");
    const [resizedHeight, setResizedHeight] = React.useState<number | null>(null);
    const [isDraggingResizeHandle, setIsDraggingResizeHandle] = React.useState(false);
    const prevExternalInputRef = React.useRef<string | undefined>(undefined);

    // Mention state
    const [suggestionStartPos, setSuggestionStartPos] = React.useState(0);

    const { connection } = useConnection();
    const { commands } = useChatCommands();
    const isResizable = resizedHeight !== null;

    const applyContainerHeight = React.useCallback((height: number | null) => {
      const container = containerRef.current;
      if (!container) return;
      container.style.height = height === null ? "" : `${height}px`;
    }, []);

    const handleMouseMove = React.useCallback(
      (moveEvent: MouseEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState) return;

        dragState.nextHeight = Math.max(
          MIN_CHAT_INPUT_HEIGHT,
          Math.min(
            MAX_CHAT_INPUT_HEIGHT,
            dragState.startHeight - (moveEvent.clientY - dragState.startY)
          )
        );

        if (resizeFrameRef.current !== null) {
          return;
        }

        resizeFrameRef.current = window.requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          if (!dragStateRef.current) return;
          applyContainerHeight(dragStateRef.current.nextHeight);
        });
      },
      [applyContainerHeight]
    );

    const cleanupResizeDrag = React.useCallback(() => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setIsDraggingResizeHandle(false);
    }, [handleMouseMove]);

    const handleMouseUp = React.useCallback(() => {
      const finalHeight = dragStateRef.current?.nextHeight ?? null;
      cleanupResizeDrag();
      setResizedHeight(finalHeight);
    }, [cleanupResizeDrag]);

    React.useEffect(() => {
      return () => {
        cleanupResizeDrag();
      };
    }, [cleanupResizeDrag]);

    // Handle external input (e.g., from prompt clicks)
    React.useEffect(() => {
      if (externalInput && externalInput !== prevExternalInputRef.current) {
        setInput(externalInput);
        prevExternalInputRef.current = externalInput;
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }
    }, [externalInput]);

    const handleNewChat = React.useCallback(() => {
      if (onNewChat) {
        onNewChat();
      }
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [onNewChat]);

    const handleStopChat = React.useCallback(() => {
      if (onStop) {
        onStop();
      }
    }, [onStop]);

    // Auto-resize textarea
    React.useEffect(() => {
      if (isResizable) {
        if (textareaRef.current) {
          textareaRef.current.style.height = "";
        }
        return;
      }

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
      }
    }, [input, isResizable]);

    // Focus textarea on mount
    React.useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, []);

    const tableSuggestions = React.useMemo((): ChatInputSuggestionItem[] => {
      if (!connection?.metadata?.tableNames) return [];
      return Array.from(connection.metadata.tableNames.values()).map((tableInfo) => {
        const database = tableInfo.database || "";
        const table = tableInfo.table || "";
        const engine = tableInfo.engine || "";

        const description = (
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-muted-foreground mb-0.5">Database</div>
              <div className="text-foreground whitespace-pre-wrap break-all">{database || "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Table</div>
              <div className="text-foreground whitespace-pre-wrap break-all">{table}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Engine</div>
              <div className="text-foreground whitespace-pre-wrap break-all">{engine || "-"}</div>
            </div>
            {tableInfo.comment ? (
              <div>
                <div className="text-muted-foreground mb-0.5">Comment</div>
                <div className="text-foreground whitespace-pre-wrap break-all">
                  {tableInfo.comment}
                </div>
              </div>
            ) : null}
          </div>
        );

        return {
          name: table,
          type: "table",
          description,
          search: table,
          group: database || "Global",
        } satisfies ChatInputSuggestionItem;
      });
    }, [connection?.metadata?.tableNames]);

    const handleSelectTable = React.useCallback(
      (group: string, tableName: string) => {
        const fullName = `${group}.${tableName}`;
        const beforeMention = input.substring(0, suggestionStartPos);
        const afterMention = input.substring(textareaRef.current?.selectionStart || input.length);
        const newText = beforeMention + `@${fullName} ` + afterMention;
        setInput(newText);
        suggestionRef.current?.close();

        setTimeout(() => {
          const newCursorPos = suggestionStartPos + fullName.length + 2;
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            textareaRef.current.focus();
          }
        }, 0);
      },
      [input, suggestionStartPos]
    );

    const handleSelectCommand = React.useCallback(
      (command: CommandDetail) => {
        // Replace the /name portion with /name + space, keeping any args already typed
        const newText = replaceLeadingCommand(input, command.name);
        setInput(newText);
        commandRef.current?.close();

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(newText.length, newText.length);
            textareaRef.current.focus();
          }
        }, 0);
      },
      [input]
    );

    /**
     * Check '@' input for table suggestions and '/' at start for slash commands.
     */
    const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      const cursorPos = e.target.selectionStart;
      setInput(text);

      const textBeforeCursor = text.substring(0, cursorPos);

      // Slash command: only trigger when / is the very first character
      if (text.startsWith("/")) {
        const afterSlash = textBeforeCursor.substring(1);
        // While the user is still typing the command name (no space yet), keep popover open
        if (!afterSlash.includes(" ") && !afterSlash.includes("\n")) {
          commandRef.current?.open(afterSlash);
          suggestionRef.current?.close();
          return;
        }
        // Space typed — command name is locked in, close popover
        commandRef.current?.close();
        suggestionRef.current?.close();
        return;
      }

      commandRef.current?.close();

      // Table mention
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");
      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
          suggestionRef.current?.open(textAfterAt);
          setSuggestionStartPos(lastAtIndex);
          return;
        }
      }
      suggestionRef.current?.close();
    }, []);

    const handleSubmit = React.useCallback(() => {
      const message = input.trim();
      if (!message) return;
      onSubmit(message);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [input, onSubmit]);

    const handleResizeStart = React.useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const container = containerRef.current;
        if (!container) return;

        e.preventDefault();

        const startHeight = Math.max(
          MIN_CHAT_INPUT_HEIGHT,
          Math.min(MAX_CHAT_INPUT_HEIGHT, container.getBoundingClientRect().height)
        );

        dragStateRef.current = {
          startY: e.clientY,
          startHeight,
          nextHeight: startHeight,
        };

        applyContainerHeight(startHeight);
        setResizedHeight(startHeight);
        setIsDraggingResizeHandle(true);
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", handleMouseMove, { passive: true });
        window.addEventListener("mouseup", handleMouseUp, { once: true });
      },
      [applyContainerHeight, handleMouseMove, handleMouseUp]
    );

    const handleResizeReset = React.useCallback(() => {
      cleanupResizeDrag();
      setResizedHeight(null);
      applyContainerHeight(null);
    }, [applyContainerHeight, cleanupResizeDrag]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Delegate to command popover first, then mention popover
      if (commandRef.current?.handleKeyDown(e)) return;
      if (suggestionRef.current?.handleKeyDown(e)) return;

      // Send on Cmd/Ctrl + Enter
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
        return;
      }
    };

    // Expose getInput and focus methods via ref
    React.useImperativeHandle(
      ref,
      () => ({
        getInput: () => input,
        focus: () => {
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
        },
      }),
      [input]
    );

    return (
      <div className="px-3 pb-3">
        <div
          ref={containerRef}
          data-testid="chat-input-container"
          className={`relative group border rounded-md bg-muted/30 focus-within:bg-background focus-within:ring-1 focus-within:ring-ring ${
            isDraggingResizeHandle ? "" : "transition-all duration-200"
          }`}
        >
          {/* Resize Handler */}
          <div
            role="separator"
            aria-label="Resize chat input"
            aria-orientation="horizontal"
            className="absolute inset-x-0 top-0 z-10 h-3 -translate-y-1/2 cursor-row-resize touch-none"
            onMouseDown={handleResizeStart}
            onDoubleClick={handleResizeReset}
          ></div>

          {/* Input Container */}
          <div className={isResizable ? "flex h-full flex-col overflow-hidden" : undefined}>
            <ChatInputSuggestions
              ref={suggestionRef}
              suggestions={tableSuggestions}
              onSelect={handleSelectTable}
              onInteractOutside={(target) => target !== textareaRef.current}
            />

            <ChatInputCommands
              ref={commandRef}
              commands={commands}
              onSelect={handleSelectCommand}
              onInteractOutside={(target) => target !== textareaRef.current}
            />

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              placeholder={`Press Enter for new line, ${typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"} + Enter to send. Use @ to mention tables, / for commands.`}
              aria-label="Chat input. Press Enter for new line, use Cmd/Ctrl + Enter to send. Use @ to mention tables, / for commands."
              className={`w-full resize-none border-0 bg-transparent py-3 pl-3 pr-10 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 overflow-y-auto ${
                isResizable ? "h-full min-h-0 flex-1 max-h-none" : "min-h-[80px] max-h-[200px]"
              }`}
              style={isResizable ? { minHeight: `${TEXTAREA_MIN_HEIGHT}px` } : undefined}
              disabled={isRunning}
              onKeyDown={handleKeyDown}
            />
            <div className="mt-[-4px] flex shrink-0 items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <ModelSelector className="bg-muted" />
                {hasMessages && (
                  <>
                    {onNewChat && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-2 text-xs"
                        title="Start New Chat"
                        onClick={handleNewChat}
                      >
                        <MessageSquarePlus className="h-3 w-3" />
                        New
                      </Button>
                    )}
                    {tokenUsage && <ChatTokenStatus usage={tokenUsage} />}
                  </>
                )}
              </div>
              {isRunning ? (
                <Button
                  onClick={handleStopChat}
                  size="icon"
                  variant="destructive"
                  className="h-6 w-6 rounded-md shadow-sm"
                  title="Stop generating"
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  size="icon"
                  className="h-6 w-6 rounded-md shadow-sm"
                  title={`Send (${typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter)`}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ChatInput.displayName = "ChatInput";

"use client";

import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LanguageModelUsage } from "ai";
import { MessageSquarePlus, Send, Square } from "lucide-react";
import * as React from "react";
import { ChatTokenStatus } from "../message/chat-token-status";
import {
  ChatInputSuggestions,
  type ChatInputSuggestionItem,
  type ChatInputSuggestionsType,
} from "./chat-input-suggestions";
import { ModelSelector } from "./model-selector";

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
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const suggestionRef = React.useRef<ChatInputSuggestionsType>(null);
    const [input, setInput] = React.useState("");
    const prevExternalInputRef = React.useRef<string | undefined>(undefined);

    // Mention state
    const [suggestionStartPos, setSuggestionStartPos] = React.useState(0);
    const { connection } = useConnection();

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
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
      }
    }, [input]);

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

    /**
     * Check '@' input and show suggestions
     */
    const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      const cursorPos = e.target.selectionStart;
      setInput(text);

      const textBeforeCursor = text.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        // Check if there are spaces between @ and cursor
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
      // Reset textarea height after submit
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [input, onSubmit]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Delegate navigation and selection to mention popover
      if (suggestionRef.current?.handleKeyDown(e)) {
        return;
      }

      // Send on Enter
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleSubmit();
      }

      // New line on Cmd/Ctrl + Enter
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        const start = e.currentTarget.selectionStart;
        const end = e.currentTarget.selectionEnd;
        const value = e.currentTarget.value;
        setInput(value.substring(0, start) + "\n" + value.substring(end));
        // Re-position cursor after state update
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
          }
        }, 0);
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
        <div className="relative group border rounded-md bg-muted/30 focus-within:bg-background focus-within:ring-1 focus-within:ring-ring transition-all duration-200">
          <ChatInputSuggestions
            ref={suggestionRef}
            suggestions={tableSuggestions}
            onSelect={handleSelectTable}
            onInteractOutside={(target) => target !== textareaRef.current}
          />

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            placeholder={`Press Enter to send, ${typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"} + Enter for new line. Use @ to mention tables.`}
            aria-label="Chat input. Press Enter to send, use Cmd/Ctrl + Enter for new line. Use @ to mention tables."
            className="w-full min-h-[80px] max-h-[200px] resize-none border-0 bg-transparent py-3 pl-3 pr-10 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 overflow-y-auto"
            disabled={isRunning}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center justify-between px-2 pb-2 mt-[-4px]">
            <div className="flex items-center gap-1">
              <ModelSelector className="bg-muted" />
              {hasMessages && (
                <>
                  {onNewChat && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-xs"
                      title="Start New Conversation"
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
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ChatInput.displayName = "ChatInput";

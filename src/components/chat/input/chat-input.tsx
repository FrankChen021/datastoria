"use client";

import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import { BasePath } from "@/lib/base-path";
import type { LanguageModelUsage } from "ai";
import { MessageSquarePlus, Send, Square } from "lucide-react";
import * as React from "react";
import { ChatTokenStatus } from "../message/chat-token-status";
import { ChatInputCommands, type ChatInputCommandsType } from "./chat-input-commands";
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
    const commandRef = React.useRef<ChatInputCommandsType>(null);
    const [input, setInput] = React.useState("");
    const prevExternalInputRef = React.useRef<string | undefined>(undefined);

    // Mention state
    const [suggestionStartPos, setSuggestionStartPos] = React.useState(0);

    // Command state
    const [commands, setCommands] = React.useState<CommandDetail[]>([]);
    const commandsFetchedRef = React.useRef(false);

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

    const handleSelectCommand = React.useCallback(
      (command: CommandDetail) => {
        // Replace the /name portion with /name + space, keeping any args already typed
        const match = /^\/[a-z][a-z0-9_]*/.exec(input);
        const argsStart = match ? match[0].length : input.length;
        const existingArgs = input.slice(argsStart);
        const newText = `/${command.name}${existingArgs || " "}`;
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

    const fetchCommands = React.useCallback(async () => {
      if (commandsFetchedRef.current) return;
      commandsFetchedRef.current = true;
      try {
        const res = await fetch(BasePath.getURL("/api/ai/commands"));
        if (res.ok) {
          const data = (await res.json()) as CommandDetail[];
          setCommands(data);
        }
      } catch {
        // non-fatal: slash commands just won't appear
      }
    }, []);

    /**
     * Check '@' input for table suggestions and '/' at start for slash commands.
     */
    const handleInputChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        const cursorPos = e.target.selectionStart;
        setInput(text);

        const textBeforeCursor = text.substring(0, cursorPos);

        // Slash command: only trigger when / is the very first character
        if (text.startsWith("/")) {
          const afterSlash = textBeforeCursor.substring(1);
          // While the user is still typing the command name (no space yet), keep popover open
          if (!afterSlash.includes(" ") && !afterSlash.includes("\n")) {
            void fetchCommands();
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
      },
      [fetchCommands]
    );

    const handleSubmit = React.useCallback(() => {
      const message = input.trim();
      if (!message) return;
      onSubmit(message);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [input, onSubmit]);

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
        <div className="relative group border rounded-md bg-muted/30 focus-within:bg-background focus-within:ring-1 focus-within:ring-ring transition-all duration-200">
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
    );
  }
);

ChatInput.displayName = "ChatInput";

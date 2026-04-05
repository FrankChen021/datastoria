"use client";

import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import { cn } from "@/lib/utils";
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
import { getLeadingCommand, removeLeadingCommand, replaceLeadingCommand } from "./command-utils";
import { getTableMentionMatches, removeTableMentionAt } from "./mention-utils";
import { ModelSelector } from "./model-selector";

export { replaceLeadingCommand } from "./command-utils";

const MIN_CHAT_INPUT_HEIGHT = 116;
const MAX_CHAT_INPUT_HEIGHT = 360;
const EDITOR_MIN_HEIGHT = 80;
// Subtract the container's 1px top + 1px bottom border from total min height.
const CHAT_INPUT_CONTENT_MIN_HEIGHT = MIN_CHAT_INPUT_HEIGHT - 2;
const RESIZE_DRAG_THRESHOLD = 2;

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

type TokenSegment =
  | {
      kind: "command";
      rawText: string;
      start: number;
      end: number;
      label: string;
    }
  | {
      kind: "mention";
      rawText: string;
      start: number;
      end: number;
      label: string;
    };

type RenderSegment = { kind: "text"; text: string; start: number; end: number } | TokenSegment;

function createTextNodeSegment(documentRef: Document, text: string) {
  return documentRef.createTextNode(text);
}

function createTokenNodeSegment(
  documentRef: Document,
  segment: TokenSegment,
  onRemove: () => void
) {
  const token = documentRef.createElement("span");
  token.dataset.rawText = segment.rawText;
  token.contentEditable = "false";
  token.className = cn(
    "mx-[1px] inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-xs",
    segment.kind === "command"
      ? "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/50 dark:text-cyan-100"
      : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-100"
  );

  const icon = documentRef.createElement("span");
  icon.className = "shrink-0";
  icon.textContent = segment.kind === "command" ? "/" : "@";

  const label = documentRef.createElement("span");
  label.className = "max-w-[240px] truncate font-medium";
  label.textContent = segment.label;

  const remove = documentRef.createElement("button");
  remove.setAttribute("type", "button");
  remove.setAttribute("tabindex", "-1");
  remove.setAttribute("aria-label", `Remove ${segment.kind} ${segment.label}`);
  remove.className =
    "inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-current/70 hover:bg-black/5 hover:text-current dark:hover:bg-white/10";
  remove.textContent = "×";
  remove.addEventListener("mousedown", (event) => event.preventDefault());
  remove.addEventListener("click", onRemove);

  token.append(icon, label, remove);
  return token;
}

function getSegmentLength(node: ChildNode): number {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const rawText = (node as HTMLElement).dataset.rawText;
    if (rawText !== undefined) {
      return rawText.length;
    }
  }

  return node.textContent?.length ?? 0;
}

function getDirectChild(root: HTMLElement, node: Node | null): ChildNode | null {
  let current = node;

  while (current && current.parentNode !== root) {
    current = current.parentNode;
  }

  return current instanceof Node ? (current as ChildNode) : null;
}

function getOffsetFromDomPosition(root: HTMLElement, node: Node | null, offset: number): number {
  if (node === root) {
    let total = 0;
    for (let index = 0; index < Math.min(offset, root.childNodes.length); index++) {
      total += getSegmentLength(root.childNodes[index]);
    }
    return total;
  }

  const directChild = getDirectChild(root, node);
  if (!directChild) {
    return 0;
  }

  let total = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child === directChild) {
      if (directChild.nodeType === Node.ELEMENT_NODE) {
        const element = directChild as HTMLElement;
        const rawText = element.dataset.rawText;
        if (rawText !== undefined) {
          return total + (offset > 0 ? rawText.length : 0);
        }

        let nestedOffset = 0;
        for (let index = 0; index < Math.min(offset, element.childNodes.length); index++) {
          nestedOffset += getSegmentLength(element.childNodes[index]);
        }

        if (element.childNodes.length > 0) {
          return total + nestedOffset;
        }

        return total + Math.min(offset, directChild.textContent?.length ?? 0);
      }

      return total + Math.min(offset, directChild.textContent?.length ?? 0);
    }

    total += getSegmentLength(child);
  }

  return total;
}

function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const start = getOffsetFromDomPosition(root, range.startContainer, range.startOffset);
  const end = getOffsetFromDomPosition(root, range.endContainer, range.endOffset);

  return start <= end ? { start, end } : { start: end, end: start };
}

function setCaretAtOffset(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let remaining = Math.max(0, offset);

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as HTMLElement;
      const rawText = element.dataset.rawText;

      if (rawText !== undefined) {
        if (remaining === 0) {
          range.setStartBefore(child);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }

        if (remaining <= rawText.length) {
          range.setStartAfter(child);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }

        remaining -= rawText.length;
        continue;
      }

      const textNode = element.firstChild;
      const textLength = textNode?.textContent?.length ?? 0;
      if (remaining <= textLength && textNode) {
        range.setStart(textNode, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }

      remaining -= textLength;
      continue;
    }

    const textLength = child.textContent?.length ?? 0;
    if (remaining <= textLength) {
      range.setStart(child, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    remaining -= textLength;
  }

  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function serializeEditor(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        const rawText = element.dataset.rawText;
        if (rawText !== undefined) {
          return rawText;
        }
      }

      return child.textContent ?? "";
    })
    .join("");
}

function buildRenderSegments(input: string, command: CommandDetail | null): RenderSegment[] {
  const tokenSegments: TokenSegment[] = [];

  const leadingCommand = getLeadingCommand(input);
  if (command && leadingCommand) {
    tokenSegments.push({
      kind: "command",
      rawText: leadingCommand.commandText,
      start: 0,
      end: leadingCommand.commandText.length,
      label: leadingCommand.commandName,
    });
  }

  for (const mention of getTableMentionMatches(input)) {
    tokenSegments.push({
      kind: "mention",
      rawText: mention.text,
      start: mention.start,
      end: mention.end,
      label: mention.value,
    });
  }

  tokenSegments.sort((left, right) => left.start - right.start);

  const segments: RenderSegment[] = [];
  let cursor = 0;

  for (const token of tokenSegments) {
    if (token.start > cursor) {
      segments.push({
        kind: "text",
        text: input.slice(cursor, token.start),
        start: cursor,
        end: token.start,
      });
    }

    segments.push(token);
    cursor = token.end;
  }

  if (cursor < input.length || segments.length === 0) {
    segments.push({
      kind: "text",
      text: input.slice(cursor),
      start: cursor,
      end: input.length,
    });
  }

  return segments.filter((segment) => segment.kind !== "text" || segment.text.length > 0);
}

export const ChatInput = React.forwardRef<ChatInputHandle, ChatInputProps>(
  (
    { onSubmit, onStop, isRunning, hasMessages = false, tokenUsage, onNewChat, externalInput },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const editorRef = React.useRef<HTMLDivElement>(null);
    const suggestionRef = React.useRef<ChatInputSuggestionsType>(null);
    const commandRef = React.useRef<ChatInputCommandsType>(null);
    const dragStateRef = React.useRef<{
      startY: number;
      startHeight: number;
      nextHeight: number;
      didResize: boolean;
    } | null>(null);
    const resizeFrameRef = React.useRef<number | null>(null);
    const pendingSelectionOffsetRef = React.useRef<number | null>(null);
    const cursorOffsetRef = React.useRef(0);
    const [input, setInput] = React.useState("");
    const [resizedHeight, setResizedHeight] = React.useState<number | null>(null);
    const [isDraggingResizeHandle, setIsDraggingResizeHandle] = React.useState(false);
    const prevExternalInputRef = React.useRef<string | undefined>(undefined);

    // Mention state
    const [suggestionStartPos, setSuggestionStartPos] = React.useState(0);

    const { connection } = useConnection();
    const { commands, commandsByName } = useChatCommands();
    const isResizable = resizedHeight !== null;
    const leadingCommand = React.useMemo(() => getLeadingCommand(input), [input]);
    const selectedCommand = React.useMemo(
      () => (leadingCommand ? (commandsByName.get(leadingCommand.commandName) ?? null) : null),
      [commandsByName, leadingCommand]
    );
    const renderSegments = React.useMemo(
      () => buildRenderSegments(input, selectedCommand),
      [input, selectedCommand]
    );

    const applyContainerHeight = React.useCallback((height: number | null) => {
      const container = containerRef.current;
      if (!container) return;
      container.style.height = height === null ? "" : `${height}px`;
    }, []);

    const updateSuggestions = React.useCallback((text: string, cursorPos: number) => {
      cursorOffsetRef.current = cursorPos;
      const textBeforeCursor = text.substring(0, cursorPos);

      if (text.startsWith("/")) {
        const afterSlash = textBeforeCursor.substring(1);
        if (!afterSlash.includes(" ") && !afterSlash.includes("\n")) {
          commandRef.current?.open(afterSlash);
          suggestionRef.current?.close();
          return;
        }
      }

      commandRef.current?.close();

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

    const setInputAndSelection = React.useCallback(
      (nextText: string, nextSelectionOffset: number) => {
        pendingSelectionOffsetRef.current = nextSelectionOffset;
        setInput(nextText);
        updateSuggestions(nextText, nextSelectionOffset);
      },
      [updateSuggestions]
    );

    const handleMouseMove = React.useCallback(
      (moveEvent: MouseEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState) return;

        const nextHeight = Math.max(
          MIN_CHAT_INPUT_HEIGHT,
          Math.min(
            MAX_CHAT_INPUT_HEIGHT,
            dragState.startHeight - (moveEvent.clientY - dragState.startY)
          )
        );
        const hasExceededThreshold =
          Math.abs(moveEvent.clientY - dragState.startY) >= RESIZE_DRAG_THRESHOLD;

        if (!dragState.didResize) {
          if (!hasExceededThreshold) {
            return;
          }
          dragState.didResize = true;
          setResizedHeight(dragState.startHeight);
          setIsDraggingResizeHandle(true);
        }

        dragState.nextHeight = nextHeight;

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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- drag cleanup and mouse-up handlers intentionally reference each other
    }, [handleMouseMove]);

    const handleMouseUp = React.useCallback(() => {
      const dragState = dragStateRef.current;
      cleanupResizeDrag();
      setResizedHeight((previousHeight) =>
        dragState?.didResize ? dragState.nextHeight : previousHeight
      );
    }, [cleanupResizeDrag]);

    React.useEffect(() => {
      return () => {
        cleanupResizeDrag();
      };
    }, [cleanupResizeDrag]);

    React.useEffect(() => {
      if (externalInput && externalInput !== prevExternalInputRef.current) {
        prevExternalInputRef.current = externalInput;
        pendingSelectionOffsetRef.current = externalInput.length;
        setInput(externalInput);
        updateSuggestions(externalInput, externalInput.length);
        if (editorRef.current) {
          editorRef.current.focus();
        }
      }
    }, [externalInput, updateSuggestions]);

    const handleNewChat = React.useCallback(() => {
      onNewChat?.();
      editorRef.current?.focus();
    }, [onNewChat]);

    const handleStopChat = React.useCallback(() => {
      onStop?.();
    }, [onStop]);

    React.useEffect(() => {
      editorRef.current?.focus();
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
        const selectionOffset = cursorOffsetRef.current;
        const beforeMention = input.substring(0, suggestionStartPos);
        const afterMention = input.substring(selectionOffset);
        const newText = beforeMention + `@${fullName} ` + afterMention;
        const newCursorPos = suggestionStartPos + fullName.length + 2;

        suggestionRef.current?.close();
        setInputAndSelection(newText, newCursorPos);
        editorRef.current?.focus();
      },
      [input, setInputAndSelection, suggestionStartPos]
    );

    const handleSelectCommand = React.useCallback(
      (command: CommandDetail) => {
        const newText = replaceLeadingCommand(input, command.name);
        commandRef.current?.close();
        setInputAndSelection(newText, newText.length);
        editorRef.current?.focus();
      },
      [input, setInputAndSelection]
    );

    const handleDismissCommand = React.useCallback(() => {
      const newText = removeLeadingCommand(input);
      commandRef.current?.close();
      setInputAndSelection(newText, 0);
      editorRef.current?.focus();
    }, [input, setInputAndSelection]);

    const handleDismissMention = React.useCallback(
      (start: number, end: number) => {
        const newText = removeTableMentionAt(input, start, end);
        suggestionRef.current?.close();
        setInputAndSelection(newText, Math.min(start, newText.length));
        editorRef.current?.focus();
      },
      [input, setInputAndSelection]
    );

    React.useLayoutEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;

      const fragment = document.createDocumentFragment();

      for (const segment of renderSegments) {
        if (segment.kind === "text") {
          fragment.appendChild(createTextNodeSegment(document, segment.text));
          continue;
        }

        fragment.appendChild(
          createTokenNodeSegment(document, segment, () => {
            if (segment.kind === "command") {
              handleDismissCommand();
              return;
            }

            handleDismissMention(segment.start, segment.end);
          })
        );
      }

      editor.replaceChildren(fragment);

      const nextSelectionOffset = pendingSelectionOffsetRef.current;
      if (nextSelectionOffset !== null) {
        setCaretAtOffset(editor, nextSelectionOffset);
        pendingSelectionOffsetRef.current = null;
      }
    }, [handleDismissCommand, handleDismissMention, renderSegments]);

    const handleSubmit = React.useCallback(() => {
      const message = input.trim();
      if (!message) return;

      onSubmit(message);
      pendingSelectionOffsetRef.current = 0;
      setInput("");
      updateSuggestions("", 0);
    }, [input, onSubmit, updateSuggestions]);

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
          didResize: false,
        };

        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", handleMouseMove, { passive: true });
        window.addEventListener("mouseup", handleMouseUp, { once: true });
      },
      [handleMouseMove, handleMouseUp]
    );

    const handleResizeReset = React.useCallback(() => {
      cleanupResizeDrag();
      setResizedHeight(null);
      applyContainerHeight(null);
    }, [applyContainerHeight, cleanupResizeDrag]);

    const handleEditorInput = React.useCallback(
      (event: React.FormEvent<HTMLDivElement>) => {
        const editor = event.currentTarget;
        const nextText = serializeEditor(editor);
        const selection = getSelectionOffsets(editor);
        const nextOffset = selection?.end ?? nextText.length;

        setInputAndSelection(nextText, nextOffset);
      },
      [setInputAndSelection]
    );

    const syncSelectionState = React.useCallback(() => {
      const editor = editorRef.current;
      if (!editor || document.activeElement !== editor) return;

      const selection = getSelectionOffsets(editor);
      if (!selection) return;

      updateSuggestions(input, selection.end);
    }, [input, updateSuggestions]);

    const handleEditorKeyUp = React.useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "PageUp" ||
          event.key === "PageDown" ||
          event.key === "Enter" ||
          event.key === "Escape"
        ) {
          return;
        }

        syncSelectionState();
      },
      [syncSelectionState]
    );

    const removeTokenAtCaret = React.useCallback(
      (key: "Backspace" | "Delete") => {
        const editor = editorRef.current;
        if (!editor) return false;

        const selection = getSelectionOffsets(editor);
        if (!selection) return false;

        if (selection.start !== selection.end) {
          const newText = input.slice(0, selection.start) + input.slice(selection.end);
          setInputAndSelection(newText, selection.start);
          return true;
        }

        const commandEnd =
          selectedCommand && leadingCommand ? leadingCommand.commandText.length : -1;
        if (key === "Backspace" && commandEnd === selection.start) {
          const newText = removeLeadingCommand(input);
          setInputAndSelection(newText, 0);
          return true;
        }

        if (key === "Delete" && selection.start === 0 && commandEnd > 0) {
          const newText = removeLeadingCommand(input);
          setInputAndSelection(newText, 0);
          return true;
        }

        for (const mention of getTableMentionMatches(input)) {
          if (
            (key === "Backspace" && mention.end === selection.start) ||
            (key === "Delete" && mention.start === selection.start)
          ) {
            const newText = removeTableMentionAt(input, mention.start, mention.end);
            setInputAndSelection(newText, Math.min(mention.start, newText.length));
            return true;
          }
        }

        return false;
      },
      [input, leadingCommand, selectedCommand, setInputAndSelection]
    );

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (commandRef.current?.handleKeyDown(e)) return;
        if (suggestionRef.current?.handleKeyDown(e)) return;

        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleSubmit();
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          const editor = editorRef.current;
          if (!editor) return;

          const selection = getSelectionOffsets(editor);
          if (!selection) return;

          const newText = input.slice(0, selection.start) + "\n" + input.slice(selection.end);
          setInputAndSelection(newText, selection.start + 1);
          return;
        }

        if (e.key === "Backspace" || e.key === "Delete") {
          const removedToken = removeTokenAtCaret(e.key);
          if (removedToken) {
            e.preventDefault();
          }
        }
      },
      [handleSubmit, input, removeTokenAtCaret, setInputAndSelection]
    );

    React.useImperativeHandle(
      ref,
      () => ({
        getInput: () => input,
        focus: () => {
          editorRef.current?.focus();
        },
      }),
      [input]
    );

    return (
      <div className="px-3 pb-3">
        <div
          ref={containerRef}
          data-testid="chat-input-container"
          className={cn(
            "relative group border rounded-md bg-muted/30 focus-within:bg-background focus-within:ring-1 focus-within:ring-ring",
            isDraggingResizeHandle ? "" : "transition-all duration-200"
          )}
          style={{ minHeight: `${MIN_CHAT_INPUT_HEIGHT}px` }}
        >
          <div
            role="separator"
            aria-label="Resize chat input"
            aria-orientation="horizontal"
            className="absolute inset-x-0 top-0 z-10 h-3 -translate-y-1/2 cursor-row-resize touch-none"
            onMouseDown={handleResizeStart}
            onDoubleClick={handleResizeReset}
          ></div>

          <div
            className={cn("flex flex-col overflow-hidden", isResizable ? "h-full" : "")}
            style={{ minHeight: `${CHAT_INPUT_CONTENT_MIN_HEIGHT}px` }}
          >
            <ChatInputSuggestions
              ref={suggestionRef}
              suggestions={tableSuggestions}
              onSelect={handleSelectTable}
              onInteractOutside={(target) =>
                target instanceof Node ? !editorRef.current?.contains(target) : false
              }
            />

            <ChatInputCommands
              ref={commandRef}
              commands={commands}
              onSelect={handleSelectCommand}
              onInteractOutside={(target) =>
                target instanceof Node ? !editorRef.current?.contains(target) : false
              }
            />

            <div className="relative flex-1">
              {!input && (
                <div className="text-muted-foreground pointer-events-none absolute left-3 right-10 top-3 text-sm">
                  Press Enter for new line,{" "}
                  {typeof navigator !== "undefined" && navigator.platform.includes("Mac")
                    ? "Cmd"
                    : "Ctrl"}{" "}
                  + Enter to send. Use @ to mention tables, / for commands.
                </div>
              )}

              <div
                ref={editorRef}
                role="textbox"
                aria-multiline="true"
                aria-label="Chat input. Press Enter for new line, use Cmd/Ctrl + Enter to send. Use @ to mention tables, / for commands."
                contentEditable={!isRunning}
                suppressContentEditableWarning
                className={cn(
                  "w-full bg-transparent py-3 pl-3 pr-10 text-sm outline-none overflow-y-auto whitespace-pre-wrap break-words",
                  isResizable ? "h-full min-h-0 flex-1 max-h-none" : "min-h-[80px] max-h-[200px]"
                )}
                style={isResizable ? { minHeight: `${EDITOR_MIN_HEIGHT}px` } : undefined}
                onInput={handleEditorInput}
                onKeyDown={handleKeyDown}
                onKeyUp={handleEditorKeyUp}
                onMouseUp={syncSelectionState}
                onFocus={syncSelectionState}
              ></div>
            </div>

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

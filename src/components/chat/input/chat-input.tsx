"use client";

import { useConnection } from "@/components/connection/connection-context";
import { ClickHouseSettingDescription } from "@/components/settings/query-context/settings-description";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useModelConfig } from "@/hooks/use-model-config";
import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import { resolveModelSupportsImageInput } from "@/lib/ai/llm/llm-provider-factory";
import type { ClickHouseSettingInfo } from "@/lib/clickhouse/clickhouse-settings";
import { cn } from "@/lib/utils";
import type { LanguageModelUsage } from "ai";
import { ImagePlus, MessageSquarePlus, Plus, Send, Square, X } from "lucide-react";
import * as React from "react";
import { useAgentCommands } from "../agent-command-context";
import { ChatTokenStatus } from "../message/chat-token-status";
import { useClickHouseSettings } from "../use-clickhouse-settings";
import type { ChatComposerInput } from "../view/use-chat-panel";
import { ChatInputCommands, type ChatInputCommandsType } from "./chat-input-commands";
import {
  ChatInputSuggestions,
  type ChatInputSuggestionItem,
  type ChatInputSuggestionsType,
} from "./chat-input-suggestions";
import { getLeadingCommand, removeLeadingCommand, replaceLeadingCommand } from "./command-utils";
import {
  getDatabaseMentionMatches,
  getTableMentionMatches,
  removeTableMentionAt,
} from "./mention-utils";
import { ModelSelector } from "./model-selector";
import { getSettingTokenMatches, removeSettingTokenAt } from "./setting-token-utils";
import { sqlSnippetTokenCodec } from "./sql-snippet-token";

export { replaceLeadingCommand } from "./command-utils";

const MIN_CHAT_INPUT_HEIGHT = 116;
const MAX_CHAT_INPUT_HEIGHT = 360;
const EDITOR_MIN_HEIGHT = 80;
// Subtract the container's 1px top + 1px bottom border from total min height.
const CHAT_INPUT_CONTENT_MIN_HEIGHT = MIN_CHAT_INPUT_HEIGHT - 2;
const RESIZE_DRAG_THRESHOLD = 2;
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
// Keep inline data URLs below the API's 10 MB JSON request limit after base64 expansion.
const MAX_TOTAL_IMAGE_FILE_SIZE_BYTES = 7 * 1024 * 1024;
const UNSUPPORTED_IMAGE_MODEL_MESSAGE = "Select a vision-capable model before sending images.";
const REMOVED_IMAGE_ATTACHMENTS_MESSAGE =
  "Attached images were removed because the selected model does not support image input.";
const TOKEN_HOVER_CARD_OPEN_DELAY_MS = 180;
const TOKEN_HOVER_CARD_CLOSE_DELAY_MS = 120;
export type ChatInputImageAttachment = {
  id: string;
  mediaType: string;
  url: string;
  filename: string;
  sizeBytes: number;
};

interface ChatInputProps {
  onSubmit: (payload: { text: string; files: ChatInputImageAttachment[] }) => void;
  onStop?: () => void;
  isRunning: boolean;
  hasMessages?: boolean;
  tokenUsage?: LanguageModelUsage;
  onNewChat?: () => void;
  externalInput?: ChatComposerInput;
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
    }
  | {
      kind: "setting";
      rawText: string;
      start: number;
      end: number;
      label: string;
    }
  | {
      kind: "sqlSnippet";
      rawText: string;
      start: number;
      end: number;
      label: string;
      sql: string;
    };

type RenderSegment = { kind: "text"; text: string; start: number; end: number } | TokenSegment;
type HoveredCodeToken = {
  code: string;
  rect: { top: number; left: number; width: number; height: number };
};

function createTextNodeSegment(documentRef: Document, text: string) {
  return documentRef.createTextNode(text);
}

function createTrailingBreakSegment(documentRef: Document) {
  return documentRef.createElement("br");
}

function scrollCaretIntoView(scrollContainer: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);

  const clientRects =
    typeof range.getClientRects === "function" ? Array.from(range.getClientRects()) : [];
  const fallbackRect =
    typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
  const rect = clientRects[0] ?? fallbackRect;
  if (!rect || (rect.height === 0 && rect.width === 0)) {
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const padding = 8;

  if (rect.bottom > containerRect.bottom - padding) {
    scrollContainer.scrollTop += rect.bottom - containerRect.bottom + padding;
  } else if (rect.top < containerRect.top + padding) {
    scrollContainer.scrollTop -= containerRect.top + padding - rect.top;
  }
}

function createAttachmentId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function createTokenNodeSegment(
  documentRef: Document,
  segment: TokenSegment,
  onRemove: () => void,
  options?: {
    onHoverStart?: (element: HTMLElement, segment: TokenSegment) => void;
    onHoverEnd?: (segment: TokenSegment) => void;
  }
) {
  const token = documentRef.createElement("span");
  token.dataset.rawText = segment.rawText;
  token.contentEditable = "false";
  token.className = cn(
    "mx-[1px] inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-xs",
    segment.kind === "command"
      ? "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/50 dark:text-cyan-100"
      : segment.kind === "sqlSnippet"
        ? "border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100"
        : segment.kind === "setting"
          ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100"
          : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-100"
  );

  const icon = documentRef.createElement("span");
  icon.className = "shrink-0";
  icon.textContent =
    segment.kind === "command"
      ? "/"
      : segment.kind === "sqlSnippet"
        ? "SQL:"
        : segment.kind === "setting"
          ? "S:"
          : "@";

  const label = documentRef.createElement("span");
  label.className = "max-w-[240px] truncate font-medium";
  label.textContent = segment.label;

  const remove = documentRef.createElement("button");
  remove.setAttribute("type", "button");
  remove.setAttribute("tabindex", "-1");
  remove.setAttribute(
    "aria-label",
    `Remove ${segment.kind === "sqlSnippet" ? "SQL selection" : segment.kind} ${segment.label}`
  );
  remove.className =
    "inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-current/70 hover:bg-black/5 hover:text-current dark:hover:bg-white/10";
  remove.textContent = "×";
  remove.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove();
  });
  remove.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  if (segment.kind === "sqlSnippet" && options?.onHoverStart && options?.onHoverEnd) {
    token.addEventListener("pointerenter", () => options.onHoverStart?.(token, segment));
    token.addEventListener("pointerleave", () => options.onHoverEnd?.(segment));
  }

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

function isKeyboardEventComposing(event: React.KeyboardEvent<HTMLDivElement>) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

function TokenHoverCard({
  hoveredToken,
  containerWidth,
  onPointerEnter,
  onPointerLeave,
}: {
  hoveredToken: HoveredCodeToken | null;
  containerWidth: number | undefined;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  if (!hoveredToken) {
    return null;
  }

  const hoverCardWidth = 360;
  const hoverCardLeft = Math.max(
    12,
    Math.min(hoveredToken.rect.left, (containerWidth ?? hoverCardWidth + 24) - hoverCardWidth - 12)
  );

  return (
    <div
      className="absolute z-30 w-[360px] rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
      style={{
        top: Math.max(hoveredToken.rect.top - 8, 8),
        left: hoverCardLeft,
        transform: "translateY(-100%)",
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <pre className="max-h-48 overflow-auto rounded-sm bg-muted/50 p-2 text-xs text-foreground">
        <code>{hoveredToken.code}</code>
      </pre>
    </div>
  );
}

function buildRenderSegments(
  input: string,
  command: CommandDetail | null,
  databaseNames:
    | Map<string, { name: string; engine: string; comment?: string | null }>
    | undefined,
  settingsByName: Map<string, ClickHouseSettingInfo>
): RenderSegment[] {
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

  for (const mention of getDatabaseMentionMatches(input, databaseNames)) {
    tokenSegments.push({
      kind: "mention",
      rawText: mention.text,
      start: mention.start,
      end: mention.end,
      label: mention.value,
    });
  }

  for (const setting of getSettingTokenMatches(input, settingsByName)) {
    if (
      tokenSegments.some((segment) => segment.start === setting.start && segment.end === setting.end)
    ) {
      continue;
    }
    tokenSegments.push({
      kind: "setting",
      rawText: setting.text,
      start: setting.start,
      end: setting.end,
      label: setting.value,
    });
  }

  for (const snippet of sqlSnippetTokenCodec.getMatches(input)) {
    tokenSegments.push({
      kind: "sqlSnippet",
      rawText: snippet.text,
      start: snippet.start,
      end: snippet.end,
      label: snippet.label,
      sql: snippet.sql,
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
    const editorScrollRef = React.useRef<HTMLDivElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
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
    const attachmentsRef = React.useRef<ChatInputImageAttachment[]>([]);
    const appendQueueRef = React.useRef<Promise<void>>(Promise.resolve());
    const [isComposing, setIsComposing] = React.useState(false);
    const isComposingRef = React.useRef(false);
    const [input, setInput] = React.useState("");
    const [attachments, setAttachments] = React.useState<ChatInputImageAttachment[]>([]);
    const [attachmentError, setAttachmentError] = React.useState<string | null>(null);
    const [resizedHeight, setResizedHeight] = React.useState<number | null>(null);
    const [isDraggingResizeHandle, setIsDraggingResizeHandle] = React.useState(false);
    const [hoveredCodeToken, setHoveredCodeToken] = React.useState<HoveredCodeToken | null>(null);
    const hoveredCodeTokenOpenTimeoutRef = React.useRef<number | null>(null);
    const hoveredCodeTokenCloseTimeoutRef = React.useRef<number | null>(null);
    const prevExternalInputNonceRef = React.useRef<number | undefined>(undefined);
    const inputRef = React.useRef(input);

    // Mention state
    const [suggestionStartPos, setSuggestionStartPos] = React.useState(0);

    const { connection } = useConnection();
    const { settings: clickHouseSettings, settingsByName: clickHouseSettingsByName } =
      useClickHouseSettings();
    const { commands, commandsByName } = useAgentCommands();
    const { selectedModel } = useModelConfig();
    const isResizable = resizedHeight !== null;
    const leadingCommand = React.useMemo(() => getLeadingCommand(input), [input]);
    const selectedCommand = React.useMemo(
      () => (leadingCommand ? (commandsByName.get(leadingCommand.commandName) ?? null) : null),
      [commandsByName, leadingCommand]
    );
    const renderSegments = React.useMemo(
      () =>
        buildRenderSegments(
          input,
          selectedCommand,
          connection?.metadata?.databaseNames,
          clickHouseSettingsByName
        ),
      [clickHouseSettingsByName, connection?.metadata?.databaseNames, input, selectedCommand]
    );
    const selectedModelSupportsImages = resolveModelSupportsImageInput(selectedModel);
    const canSubmit =
      (input.trim().length > 0 || attachments.length > 0) &&
      (attachments.length === 0 || selectedModelSupportsImages);

    React.useEffect(() => {
      attachmentsRef.current = attachments;
    }, [attachments]);

    React.useEffect(() => {
      inputRef.current = input;
    }, [input]);

    const resetFileInput = React.useCallback(() => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, []);

    React.useEffect(() => {
      if (selectedModelSupportsImages || attachmentsRef.current.length === 0) {
        return;
      }

      attachmentsRef.current = [];
      setAttachments([]);
      resetFileInput();
      setAttachmentError(REMOVED_IMAGE_ATTACHMENTS_MESSAGE);
    }, [resetFileInput, selectedModelSupportsImages]);

    React.useEffect(() => {
      setAttachmentError((current) => {
        if (!selectedModelSupportsImages) {
          return current === REMOVED_IMAGE_ATTACHMENTS_MESSAGE ? current : null;
        }

        if (
          current === UNSUPPORTED_IMAGE_MODEL_MESSAGE ||
          current === REMOVED_IMAGE_ATTACHMENTS_MESSAGE
        ) {
          return null;
        }

        return current;
      });
    }, [selectedModelSupportsImages]);

    const readFileAsDataUrl = React.useCallback((file: File) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }
          reject(new Error(`Failed to read file ${file.name}`));
        };
        reader.onerror = () =>
          reject(reader.error ?? new Error(`Failed to read file ${file.name}`));
        reader.readAsDataURL(file);
      });
    }, []);

    const convertFilesToAttachments = React.useCallback(
      async (incomingFiles: File[]) => {
        if (incomingFiles.length === 0) {
          return [] as ChatInputImageAttachment[];
        }

        const imageFiles = incomingFiles.filter((file) => file.type.startsWith("image/"));
        if (imageFiles.length === 0) {
          throw new Error("Only image attachments are supported.");
        }

        const currentAttachments = attachmentsRef.current;
        const availableSlots = Math.max(MAX_IMAGE_ATTACHMENTS - currentAttachments.length, 0);
        if (availableSlots === 0) {
          throw new Error(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images per message.`);
        }

        const nextFiles = imageFiles.slice(0, availableSlots);
        const currentTotalBytes = currentAttachments.reduce(
          (sum, attachment) => sum + attachment.sizeBytes,
          0
        );
        const nextTotalBytes = nextFiles.reduce((sum, file) => sum + file.size, currentTotalBytes);
        for (const file of nextFiles) {
          if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
            throw new Error(`${file.name} exceeds the 5 MB image limit.`);
          }
        }
        if (nextTotalBytes > MAX_TOTAL_IMAGE_FILE_SIZE_BYTES) {
          throw new Error("Attached images exceed the total 7 MB limit per message.");
        }

        return Promise.all(
          nextFiles.map(async (file) => ({
            id: createAttachmentId(),
            mediaType: file.type,
            url: await readFileAsDataUrl(file),
            filename: file.name || "image",
            sizeBytes: file.size,
          }))
        );
      },
      [readFileAsDataUrl]
    );

    const appendFiles = React.useCallback(
      async (incomingFiles: File[]) => {
        const appendTask = async () => {
          try {
            if (!selectedModelSupportsImages) {
              throw new Error("Select a vision-capable model before adding images.");
            }
            const nextAttachments = await convertFilesToAttachments(incomingFiles);
            if (nextAttachments.length === 0) {
              return;
            }
            setAttachments((current) => {
              const updated = [...current, ...nextAttachments];
              attachmentsRef.current = updated;
              return updated;
            });
            setAttachmentError(null);
          } catch (error) {
            setAttachmentError(error instanceof Error ? error.message : "Failed to add images.");
          } finally {
            resetFileInput();
          }
        };

        const queuedTask = appendQueueRef.current.then(appendTask, appendTask);
        appendQueueRef.current = queuedTask.then(
          () => undefined,
          () => undefined
        );
        await queuedTask;
      },
      [convertFilesToAttachments, resetFileInput, selectedModelSupportsImages]
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
      if (!externalInput || externalInput.nonce === prevExternalInputNonceRef.current) {
        return;
      }

      prevExternalInputNonceRef.current = externalInput.nonce;
      const nextText =
        externalInput.mode === "append" && inputRef.current.trim().length > 0
          ? `${inputRef.current}${/\s$/.test(inputRef.current) ? "" : " "}${externalInput.text}`
          : externalInput.text;
      pendingSelectionOffsetRef.current = nextText.length;
      setInput(nextText);
      updateSuggestions(nextText, nextText.length);
      editorRef.current?.focus();
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

    const databaseSuggestions = React.useMemo((): ChatInputSuggestionItem[] => {
      if (!connection?.metadata?.databaseNames) return [];
      return Array.from(connection.metadata.databaseNames.values()).map((databaseInfo) => {
        const description = (
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-muted-foreground mb-0.5">Database</div>
              <div className="text-foreground whitespace-pre-wrap break-all">
                {databaseInfo.name}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Engine</div>
              <div className="text-foreground whitespace-pre-wrap break-all">
                {databaseInfo.engine}
              </div>
            </div>
            {databaseInfo.comment ? (
              <div>
                <div className="text-muted-foreground mb-0.5">Comment</div>
                <div className="text-foreground whitespace-pre-wrap break-all">
                  {databaseInfo.comment}
                </div>
              </div>
            ) : null}
          </div>
        );

        return {
          name: databaseInfo.name,
          type: "database",
          description,
          search: `${databaseInfo.name} ${databaseInfo.engine} ${databaseInfo.comment ?? ""}`,
          group: databaseInfo.engine,
        } satisfies ChatInputSuggestionItem;
      });
    }, [connection?.metadata?.databaseNames]);

    const settingSuggestions = React.useMemo((): ChatInputSuggestionItem[] => {
      return clickHouseSettings.map((setting) => {
        const readonlyLabel = setting.readonly === null ? "-" : setting.readonly ? "Yes" : "No";
        const description = (
          <div className="space-y-2 text-[11px]">
            <div>
              <div className="text-muted-foreground mb-0.5">Setting</div>
              <div className="text-foreground whitespace-pre-wrap break-all">{setting.name}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Type</div>
              <div className="text-foreground whitespace-pre-wrap break-all">{setting.type}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Current value</div>
              <div className="text-foreground whitespace-pre-wrap break-all">{setting.value}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">ReadOnly</div>
              <div className="text-foreground whitespace-pre-wrap break-all">{readonlyLabel}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Description</div>
              <ClickHouseSettingDescription
                descriptionMarkdown={setting.description}
                className="text-[11px] [&_.admonition]:my-1 [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1"
              />
            </div>
          </div>
        );

        return {
          name: setting.name,
          type: "setting",
          description,
          search: `${setting.name} ${setting.type} ${setting.description}`,
          group: setting.source,
        } satisfies ChatInputSuggestionItem;
      });
    }, [clickHouseSettings]);

    const handleSelectSuggestion = React.useCallback(
      (suggestion: ChatInputSuggestionItem) => {
        const selectionOffset = cursorOffsetRef.current;
        const beforeMention = input.substring(0, suggestionStartPos);
        const afterMention = input.substring(selectionOffset);
        const insertText =
          suggestion.type === "table"
            ? `\`${suggestion.group}.${suggestion.name}\` `
            : `\`${suggestion.name}\` `;
        const newText = beforeMention + insertText + afterMention;
        const newCursorPos = suggestionStartPos + insertText.length;

        suggestionRef.current?.close();
        setInputAndSelection(newText, newCursorPos);
        editorRef.current?.focus();
      },
      [input, setInputAndSelection, suggestionStartPos]
    );

    const handleSelectCommand = React.useCallback(
      (command: CommandDetail) => {
        const newText = replaceLeadingCommand(input, command.name, cursorOffsetRef.current);
        commandRef.current?.close();
        const nextCursor =
          newText === `/${command.name} ` ? newText.length : `/${command.name}`.length;
        setInputAndSelection(newText, nextCursor);
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

    const handleDismissSetting = React.useCallback(
      (start: number, end: number) => {
        const newText = removeSettingTokenAt(input, start, end);
        suggestionRef.current?.close();
        setInputAndSelection(newText, Math.min(start, newText.length));
        editorRef.current?.focus();
      },
      [input, setInputAndSelection]
    );

    const clearHoveredCodeTokenOpenTimeout = React.useCallback(() => {
      if (hoveredCodeTokenOpenTimeoutRef.current !== null) {
        window.clearTimeout(hoveredCodeTokenOpenTimeoutRef.current);
        hoveredCodeTokenOpenTimeoutRef.current = null;
      }
    }, []);

    const clearHoveredCodeTokenCloseTimeout = React.useCallback(() => {
      if (hoveredCodeTokenCloseTimeoutRef.current !== null) {
        window.clearTimeout(hoveredCodeTokenCloseTimeoutRef.current);
        hoveredCodeTokenCloseTimeoutRef.current = null;
      }
    }, []);

    const clearHoveredCodeTokenState = React.useCallback(() => {
      clearHoveredCodeTokenOpenTimeout();
      clearHoveredCodeTokenCloseTimeout();
      setHoveredCodeToken(null);
    }, [clearHoveredCodeTokenCloseTimeout, clearHoveredCodeTokenOpenTimeout]);

    const scheduleHoveredCodeTokenClose = React.useCallback(() => {
      clearHoveredCodeTokenCloseTimeout();
      hoveredCodeTokenCloseTimeoutRef.current = window.setTimeout(() => {
        setHoveredCodeToken(null);
        hoveredCodeTokenCloseTimeoutRef.current = null;
      }, TOKEN_HOVER_CARD_CLOSE_DELAY_MS);
    }, [clearHoveredCodeTokenCloseTimeout]);

    const handleDismissSqlSnippet = React.useCallback(
      (start: number, end: number) => {
        clearHoveredCodeTokenState();
        const newText = sqlSnippetTokenCodec.removeAt(input, start, end);
        suggestionRef.current?.close();
        setInputAndSelection(newText, Math.min(start, newText.length));
        editorRef.current?.focus();
      },
      [clearHoveredCodeTokenState, input, setInputAndSelection]
    );

    const handleCodeTokenHoverStart = React.useCallback(
      (element: HTMLElement, segment: TokenSegment) => {
        if (segment.kind !== "sqlSnippet" || !containerRef.current) {
          return;
        }

        clearHoveredCodeTokenOpenTimeout();
        clearHoveredCodeTokenCloseTimeout();
        const tokenRect = element.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const nextHoveredCodeToken = {
          code: segment.sql,
          rect: {
            top: tokenRect.top - containerRect.top,
            left: tokenRect.left - containerRect.left,
            width: tokenRect.width,
            height: tokenRect.height,
          },
        };

        hoveredCodeTokenOpenTimeoutRef.current = window.setTimeout(() => {
          setHoveredCodeToken(nextHoveredCodeToken);
          hoveredCodeTokenOpenTimeoutRef.current = null;
        }, TOKEN_HOVER_CARD_OPEN_DELAY_MS);
      },
      [clearHoveredCodeTokenCloseTimeout, clearHoveredCodeTokenOpenTimeout]
    );

    const handleCodeTokenHoverEnd = React.useCallback(
      (_segment: TokenSegment) => {
        clearHoveredCodeTokenOpenTimeout();
        if (!hoveredCodeToken) {
          return;
        }
        scheduleHoveredCodeTokenClose();
      },
      [clearHoveredCodeTokenOpenTimeout, hoveredCodeToken, scheduleHoveredCodeTokenClose]
    );

    const handleHoverCardPointerEnter = React.useCallback(() => {
      clearHoveredCodeTokenCloseTimeout();
    }, [clearHoveredCodeTokenCloseTimeout]);

    const handleHoverCardPointerLeave = React.useCallback(() => {
      scheduleHoveredCodeTokenClose();
    }, [scheduleHoveredCodeTokenClose]);

    React.useEffect(() => {
      return () => {
        clearHoveredCodeTokenOpenTimeout();
        clearHoveredCodeTokenCloseTimeout();
      };
    }, [clearHoveredCodeTokenCloseTimeout, clearHoveredCodeTokenOpenTimeout]);

    React.useLayoutEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;
      if (isComposing) return;

      const fragment = document.createDocumentFragment();

      for (const segment of renderSegments) {
        if (segment.kind === "text") {
          fragment.appendChild(createTextNodeSegment(document, segment.text));
          continue;
        }

        fragment.appendChild(
          createTokenNodeSegment(
            document,
            segment,
            () => {
              if (segment.kind === "command") {
                handleDismissCommand();
                return;
              }

              if (segment.kind === "mention") {
                handleDismissMention(segment.start, segment.end);
                return;
              }

              if (segment.kind === "setting") {
                handleDismissSetting(segment.start, segment.end);
                return;
              }

              handleDismissSqlSnippet(segment.start, segment.end);
            },
            {
              onHoverStart: handleCodeTokenHoverStart,
              onHoverEnd: handleCodeTokenHoverEnd,
            }
          )
        );
      }

      if (input.endsWith("\n")) {
        fragment.appendChild(createTrailingBreakSegment(document));
      }

      editor.replaceChildren(fragment);

      const nextSelectionOffset = pendingSelectionOffsetRef.current;
      if (nextSelectionOffset !== null) {
        setCaretAtOffset(editor, nextSelectionOffset);
        pendingSelectionOffsetRef.current = null;
        if (editorScrollRef.current) {
          window.requestAnimationFrame(() => {
            if (editorScrollRef.current) {
              scrollCaretIntoView(editorScrollRef.current);
            }
          });
        }
      }
    }, [
      handleDismissCommand,
      handleDismissMention,
      handleDismissSetting,
      handleDismissSqlSnippet,
      handleCodeTokenHoverEnd,
      handleCodeTokenHoverStart,
      input,
      isComposing,
      renderSegments,
    ]);

    const handleSubmit = React.useCallback(() => {
      const message = sqlSnippetTokenCodec.expand(input).trim();
      if (!message && attachments.length === 0) return;
      if (attachments.length > 0 && !selectedModelSupportsImages) {
        setAttachmentError(UNSUPPORTED_IMAGE_MODEL_MESSAGE);
        return;
      }

      onSubmit({ text: message, files: attachments });
      clearHoveredCodeTokenState();
      pendingSelectionOffsetRef.current = 0;
      setInput("");
      setAttachments([]);
      setAttachmentError(null);
      updateSuggestions("", 0);
      resetFileInput();
    }, [
      attachments,
      clearHoveredCodeTokenState,
      input,
      onSubmit,
      resetFileInput,
      selectedModelSupportsImages,
      updateSuggestions,
    ]);

    const handleRemoveAttachment = React.useCallback((attachmentId: string) => {
      setAttachments((current) => {
        const updated = current.filter((attachment) => attachment.id !== attachmentId);
        attachmentsRef.current = updated;
        return updated;
      });
      setAttachmentError(null);
    }, []);

    const handleFileInputChange = React.useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        await appendFiles(files);
      },
      [appendFiles]
    );

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

        if (isComposingRef.current) {
          setInput(nextText);
          return;
        }

        setInputAndSelection(nextText, nextOffset);
      },
      [setInputAndSelection]
    );

    const handleCompositionStart = React.useCallback(() => {
      isComposingRef.current = true;
      setIsComposing(true);
    }, []);

    const handleCompositionEnd = React.useCallback(
      (event: React.CompositionEvent<HTMLDivElement>) => {
        isComposingRef.current = false;
        setIsComposing(false);

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
        if (isKeyboardEventComposing(event)) {
          return;
        }

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
          const removedSqlSnippet = sqlSnippetTokenCodec
            .getMatches(input)
            .some((snippet) => snippet.start < selection.end && snippet.end > selection.start);
          if (removedSqlSnippet) {
            clearHoveredCodeTokenState();
          }
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

        for (const mention of [
          ...getTableMentionMatches(input),
          ...getDatabaseMentionMatches(input, connection?.metadata?.databaseNames),
        ]) {
          if (
            (key === "Backspace" && mention.end === selection.start) ||
            (key === "Delete" && mention.start === selection.start)
          ) {
            const newText = removeTableMentionAt(input, mention.start, mention.end);
            setInputAndSelection(newText, Math.min(mention.start, newText.length));
            return true;
          }
        }

        for (const snippet of sqlSnippetTokenCodec.getMatches(input)) {
          if (
            (key === "Backspace" && snippet.end === selection.start) ||
            (key === "Delete" && snippet.start === selection.start)
          ) {
            clearHoveredCodeTokenState();
            const newText = sqlSnippetTokenCodec.removeAt(input, snippet.start, snippet.end);
            setInputAndSelection(newText, Math.min(snippet.start, newText.length));
            return true;
          }
        }

        return false;
      },
      [clearHoveredCodeTokenState, input, leadingCommand, selectedCommand, setInputAndSelection]
    );

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (isKeyboardEventComposing(e)) {
          return;
        }

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

    const handlePaste = React.useCallback(
      async (event: React.ClipboardEvent<HTMLDivElement>) => {
        const files = Array.from(event.clipboardData.files ?? []);
        if (files.length === 0) {
          return;
        }

        event.preventDefault();
        await appendFiles(files);
      },
      [appendFiles]
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

          <TokenHoverCard
            hoveredToken={hoveredCodeToken}
            containerWidth={containerRef.current?.clientWidth}
            onPointerEnter={handleHoverCardPointerEnter}
            onPointerLeave={handleHoverCardPointerLeave}
          />

          <div
            className={cn("flex flex-col overflow-hidden", isResizable ? "h-full" : "")}
            style={{ minHeight: `${CHAT_INPUT_CONTENT_MIN_HEIGHT}px` }}
          >
            <ChatInputSuggestions
              ref={suggestionRef}
              suggestions={{
                databases: databaseSuggestions,
                tables: tableSuggestions,
                settings: settingSuggestions,
              }}
              onSelect={handleSelectSuggestion}
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

            <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={editorScrollRef}
                className={cn("min-h-0 flex-1 overflow-y-auto", isResizable ? "" : "max-h-[200px]")}
              >
                <div className="relative flex min-h-full flex-col">
                  {!input && attachments.length === 0 && (
                    <div className="text-muted-foreground pointer-events-none absolute left-3 right-10 top-3 text-sm">
                      Press Enter for new line,{" "}
                      {typeof navigator !== "undefined" && navigator.platform.includes("Mac")
                        ? "Cmd"
                        : "Ctrl"}{" "}
                      + Enter to send. Use @ to open table or setting suggestions, / for commands.
                    </div>
                  )}

                  <div
                    ref={editorRef}
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Chat input. Press Enter for new line, use Cmd/Ctrl + Enter to send. Use @ to open table or setting suggestions, / for commands."
                    contentEditable={!isRunning}
                    suppressContentEditableWarning
                    className={cn(
                      "w-full bg-transparent py-3 pl-3 pr-10 text-sm outline-none whitespace-pre-wrap break-words",
                      isResizable ? "h-full min-h-0 flex-1 max-h-none" : "min-h-[80px]"
                    )}
                    style={isResizable ? { minHeight: `${EDITOR_MIN_HEIGHT}px` } : undefined}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onInput={handleEditorInput}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleEditorKeyUp}
                    onMouseUp={syncSelectionState}
                    onFocus={syncSelectionState}
                    onPaste={handlePaste}
                  ></div>
                </div>
              </div>
              {attachments.length > 0 && (
                <div className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-background"
                    >
                      <img
                        src={attachment.url}
                        alt={attachment.filename}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm"
                        aria-label={`Remove ${attachment.filename}`}
                        onClick={() => handleRemoveAttachment(attachment.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {attachmentError && (
                <div className="px-3 pb-2 text-[11px] text-destructive">{attachmentError}</div>
              )}
            </div>
            <div className="mt-[-4px] flex shrink-0 items-center justify-between px-2 pb-2 pt-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 rounded-md"
                      title={
                        selectedModelSupportsImages
                          ? "Add attachment"
                          : "Select a vision-capable model to add images"
                      }
                      aria-label="Add attachment"
                      disabled={isRunning}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-32 p-1">
                    <DropdownMenuItem
                      disabled={!selectedModelSupportsImages}
                      className="gap-1.5 px-2 py-1 text-xs"
                      onSelect={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="h-3 w-3" />
                      Image
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  size="icon"
                  className="h-6 w-6 rounded-md shadow-sm"
                  aria-label="Send message"
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

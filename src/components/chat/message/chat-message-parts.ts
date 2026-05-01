import type { AppUIMessage, ToolPart } from "@/lib/ai/ai-types";

export type MessagePart = AppUIMessage["parts"][0];
export type RenderPartGroup =
  | { type: "part"; part: MessagePart; index: number }
  | { type: "tool-group"; parts: MessagePart[]; startIndex: number };

export function getToolName(part: MessagePart): string | undefined {
  if (part.type === "dynamic-tool") {
    return (part as ToolPart).toolName;
  }

  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.replace("tool-", "");
  }

  return undefined;
}

export function isToolPart(part: MessagePart): boolean {
  return getToolName(part) != null;
}

function isVisibleNonToolPart(part: MessagePart): boolean {
  const partType = String(part.type);
  if (partType === "reasoning") {
    const text = (part as { text?: unknown }).text;
    return typeof text === "string" && text.trim().length > 0;
  }

  return partType === "text" || partType === "file" || partType === "reasoning";
}

export function groupRenderableParts(parts: MessagePart[]): RenderPartGroup[] {
  const groups: RenderPartGroup[] = [];
  let index = 0;

  while (index < parts.length) {
    const part = parts[index];

    if (!isToolPart(part) && !isVisibleNonToolPart(part)) {
      index += 1;
      continue;
    }

    if (!isToolPart(part)) {
      groups.push({ type: "part", part, index });
      index += 1;
      continue;
    }

    const startIndex = index;
    const toolEntries: { part: MessagePart; index: number }[] = [];
    while (index < parts.length) {
      const currentPart = parts[index];
      if (isToolPart(currentPart)) {
        toolEntries.push({ part: currentPart, index });
        index += 1;
        continue;
      }

      if (!isVisibleNonToolPart(currentPart)) {
        index += 1;
        continue;
      }

      break;
    }

    if (toolEntries.length === 0) {
      index += 1;
      continue;
    }

    const hasPartAfterToolRun = index < parts.length;
    if (toolEntries.length > 1 && hasPartAfterToolRun) {
      groups.push({
        type: "tool-group",
        parts: toolEntries.map((entry) => entry.part),
        startIndex,
      });
      continue;
    }

    toolEntries.forEach(({ part, index }) => {
      groups.push({ type: "part", part, index });
    });
  }

  return groups;
}

function isCompleteToolPart(part: MessagePart): boolean {
  const state = (part as ToolPart).state;
  return state === "output-available" || state === "done" || state === "output-error";
}

function isErroredToolPart(part: MessagePart): boolean {
  const toolPart = part as ToolPart;
  const state = toolPart.state;
  const output = toolPart.output as { error?: unknown; success?: unknown } | undefined;

  return (
    state === "output-error" ||
    state?.includes("error") === true ||
    output?.success === false ||
    typeof output?.error === "string"
  );
}

export function getToolGroupState(parts: MessagePart[]): { state?: string; success?: boolean } {
  if (parts.some(isErroredToolPart)) {
    return { state: "output-error", success: false };
  }

  if (parts.every(isCompleteToolPart)) {
    return { state: "output-available", success: true };
  }

  return {
    state: (parts.find((part) => !isCompleteToolPart(part)) as ToolPart | undefined)?.state,
  };
}

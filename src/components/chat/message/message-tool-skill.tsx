import type {
  AppUIMessage,
  SkillResourceToolInput,
  SkillToolInput,
  ToolPart,
} from "@/lib/ai/ai-types";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";

type SkillInput = SkillToolInput | SkillResourceToolInput;

const MAX_HEADER_LENGTH = 80;

function getRequestedItems(input: SkillInput): string[] {
  if ("names" in input && Array.isArray(input.names)) {
    return input.names.filter(Boolean);
  }

  if (!("resources" in input) || !Array.isArray(input.resources)) {
    return [];
  }

  return input.resources.flatMap((resource) => {
    if (!resource || typeof resource !== "object") {
      return [];
    }

    const paths = (resource as { paths?: unknown }).paths;
    const skill = (resource as { skill?: unknown }).skill;

    if (!Array.isArray(paths) || typeof skill !== "string") {
      return [];
    }

    return paths
      .filter((path): path is string => typeof path === "string")
      .map((path) => path.trim())
      .filter(Boolean)
      .map((path) => `${skill} | ${path}`);
  });
}

function getLoadedManuals(outputText: string | null): string[] {
  if (!outputText) return [];
  return [...outputText.matchAll(/^# Manual Loaded: (.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter((name): name is string => Boolean(name));
}

function buildHeader(input: SkillInput, outputText: string | null): string {
  const requestedItems = getRequestedItems(input);
  const headerItems = requestedItems.length > 0 ? requestedItems : getLoadedManuals(outputText);
  if (headerItems.length === 0) {
    return "";
  }

  const joinedNames = headerItems.join(", ");
  if (joinedNames.length <= MAX_HEADER_LENGTH) {
    return joinedNames;
  }

  return `${joinedNames.slice(0, MAX_HEADER_LENGTH - 1).trimEnd()}…`;
}

export const MessageToolSkill = memo(function MessageToolSkill({
  isRunning = true,
  part,
  label = "Load skill",
}: {
  part: AppUIMessage["parts"][0];
  isRunning?: boolean;
  label?: string;
}) {
  const toolPart = part as ToolPart;
  const state = toolPart.state;
  const input = (toolPart.input ?? {}) as SkillInput;
  const outputText = typeof toolPart.output === "string" ? toolPart.output : null;
  const characterCount = outputText?.length ?? null;
  const requestedItems = getRequestedItems(input);

  return (
    <CollapsiblePart
      toolName={label}
      headerExtra={buildHeader(input, outputText)}
      state={state}
      isRunning={isRunning}
    >
      {requestedItems.length > 0 ? (
        <div className="text-[10px] text-muted-foreground">
          <div className="font-medium">input:</div>
          <div className="pl-3 font-mono">
            {requestedItems.map((item, index) => (
              <div key={`${item}-${index}`}>{item}</div>
            ))}
          </div>
        </div>
      ) : null}
      {characterCount != null ? (
        <div className="text-[10px] text-muted-foreground">
          <div className="font-medium">output:</div>
          <div className="pl-3 font-mono">{characterCount} characters</div>
        </div>
      ) : null}
    </CollapsiblePart>
  );
});

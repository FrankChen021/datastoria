import type {
  AppUIMessage,
  SkillResourceToolInput,
  SkillToolInput,
  ToolPart,
} from "@/lib/ai/chat-types";
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

function buildHeader(input: SkillInput): string {
  const requestedItems = getRequestedItems(input);
  if (requestedItems.length === 0) {
    return "";
  }

  const joinedNames = requestedItems.join(", ");
  if (joinedNames.length <= MAX_HEADER_LENGTH) {
    return joinedNames;
  }

  return `${joinedNames.slice(0, MAX_HEADER_LENGTH - 1).trimEnd()}…`;
}

export const MessageToolSkill = memo(function MessageToolSkill({
  isRunning = true,
  part,
  label = "Load Skill",
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
      headerExtra={buildHeader(input)}
      state={state}
      isRunning={isRunning}
    >
      {requestedItems.length > 0 ? (
        <div className="mt-1 text-[10px] text-muted-foreground">
          <div className="font-medium">input:</div>
          <div className="mt-1 space-y-1 font-mono">
            {requestedItems.map((item, index) => (
              <div key={`${item}-${index}`}>{item}</div>
            ))}
          </div>
        </div>
      ) : null}
      {characterCount != null ? (
        <div className="mt-1 text-[10px] text-muted-foreground">{characterCount} characters</div>
      ) : null}
    </CollapsiblePart>
  );
});

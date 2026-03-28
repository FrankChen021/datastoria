import type { AppUIMessage, ToolPart } from "@/lib/ai/chat-types";
import { memo } from "react";
import { CollapsiblePart } from "./collapsible-part";

type SkillInput = {
  names?: string[];
};

const MAX_HEADER_LENGTH = 80;

function buildHeader(input: SkillInput): string {
  if (!Array.isArray(input.names) || input.names.length === 0) {
    return "";
  }

  const joinedNames = input.names.join(", ");
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

  return (
    <CollapsiblePart
      toolName={label}
      headerExtra={buildHeader(input)}
      state={state}
      isRunning={isRunning}
    >
      {characterCount != null ? (
        <div className="mt-1 text-[10px] text-muted-foreground">{characterCount} characters</div>
      ) : null}
    </CollapsiblePart>
  );
});

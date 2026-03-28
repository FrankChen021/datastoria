import type { SkillCatalogItem } from "./skill-types";

export function parseRequiredTools(input: unknown): string[] | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const tools = input
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);

  return tools.length > 0 ? tools : undefined;
}

export function createSkillAvailabilityFilter(
  availableTools: ReadonlySet<string>
): (skill: SkillCatalogItem) => boolean {
  return (skill: SkillCatalogItem) => {
    if (!skill.requiredTools || skill.requiredTools.length === 0) {
      return true;
    }

    return skill.requiredTools.every((tool) => availableTools.has(tool));
  };
}

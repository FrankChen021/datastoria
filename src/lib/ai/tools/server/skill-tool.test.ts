import { describe, expect, it } from "vitest";
import { buildSkillToolDescription } from "./skill-tool";

const skills = [
  {
    id: "source-code-inspection",
    name: "source-code-inspection",
    description: "Inspect and explain source code.",
    source: "disk",
    status: "available",
  },
  {
    id: "visualization",
    name: "visualization",
    description: "Create charts from query results.",
    source: "disk",
    status: "available",
  },
] as const;

describe("buildSkillToolDescription", () => {
  it("keeps the base instructions generic and skill-driven", () => {
    const description = buildSkillToolDescription([...skills]);

    expect(description).toContain("You MUST call this FIRST");
    expect(description).toContain("Use the available skill names and descriptions below");
    expect(description).toContain("If the user explicitly names a skill, load it immediately.");
  });
});

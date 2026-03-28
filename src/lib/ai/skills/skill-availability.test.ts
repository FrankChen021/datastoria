import { describe, expect, it } from "vitest";
import { createSkillAvailabilityFilter, parseRequiredTools } from "./skill-availability";
import type { SkillCatalogItem } from "./skill-types";

describe("skill availability", () => {
  it("parses comma-separated required tools", () => {
    expect(parseRequiredTools(" search_file, read_file , ,skill ")).toEqual([
      "search_file",
      "read_file",
      "skill",
    ]);
  });

  it("returns undefined for empty or invalid tool metadata", () => {
    expect(parseRequiredTools(" ,  , ")).toBeUndefined();
    expect(parseRequiredTools(undefined)).toBeUndefined();
  });

  it("filters out skills whose required tools are unavailable", () => {
    const skills: SkillCatalogItem[] = [
      {
        id: "general",
        name: "general",
        description: "",
        source: "disk",
        status: "available",
      },
      {
        id: "source-code-inspection",
        name: "source-code-inspection",
        description: "",
        source: "disk",
        status: "available",
        requiredTools: ["search_file", "read_file"],
      },
    ];

    const unavailableFilter = createSkillAvailabilityFilter(new Set(["skill", "skill_resource"]));
    const availableFilter = createSkillAvailabilityFilter(
      new Set(["skill", "skill_resource", "search_file", "read_file"])
    );

    expect(skills.filter(unavailableFilter)).toEqual([
      {
        id: "general",
        name: "general",
        description: "",
        source: "disk",
        status: "available",
      },
    ]);
    expect(skills.filter(availableFilter)).toEqual(skills);
  });
});

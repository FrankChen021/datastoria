import { describe, expect, it } from "vitest";
import { SkillLink } from "./skill-link";

describe("SkillLink", () => {
  it("parses skill references with optional titles", () => {
    expect(SkillLink.parse("source-code-inspection|/source-code-inspection")).toMatchObject({
      skillId: "source-code-inspection",
      label: "/source-code-inspection",
      href: "skill://source-code-inspection",
    });

    expect(
      SkillLink.parse("source-code-inspection|/source-code-inspection|Inspect source code")
    ).toMatchObject({
      skillId: "source-code-inspection",
      label: "/source-code-inspection",
      title: "Inspect source code",
      href: "skill://source-code-inspection",
    });

    expect(SkillLink.parse("source-code-inspection")).toBeNull();
    expect(SkillLink.parse(" | /source-code-inspection")).toBeNull();
  });

  it("stores href and builds tokens", () => {
    const link = new SkillLink({
      skillId: "source-code-inspection",
      label: "/source-code-inspection",
      title: "Inspect source code",
    });

    expect(link.label).toBe("/source-code-inspection");
    expect(link.href).toBe("skill://source-code-inspection");
    expect(SkillLink.buildToken(link)).toBe(
      "[[skill:source-code-inspection|/source-code-inspection|Inspect source code]]"
    );
  });

  it("creates link nodes from the instance", () => {
    const link = new SkillLink({
      skillId: "source-code-inspection",
      label: "/source-code-inspection",
      title: "Inspect source code",
    });

    expect(link.toLinkNode()).toEqual({
      type: "link",
      url: "skill://source-code-inspection",
      title: "Inspect source code",
      children: [{ type: "text", value: "/source-code-inspection" }],
    });
  });
});

import { describe, expect, it } from "vitest";
import { ServerSkillRepositorySqlite } from "./impl/server-skill-repository-sqlite";

describe("server skill repository bundle writes", () => {
  it("saves draft skill bundles and publishes them", async () => {
    const repository = new ServerSkillRepositorySqlite(":memory:");

    await repository.upsertSkillBundle("owner@example.com", {
      id: "visualization",
      content: `---
name: visualization
description: Render charts from database.
---

# Visualization
`,
      scope: "self",
      resources: [{ path: "references/rules.md", content: "draft resource" }],
    });

    const hiddenDraft = await repository.getSkill("visualization", {
      userId: "owner@example.com",
    });
    expect(hiddenDraft).toBeNull();

    const visibleDraft = await repository.getSkill("visualization", {
      userId: "owner@example.com",
      states: ["draft"],
    });
    expect(visibleDraft?.state).toBe("draft");

    await repository.publishSkill("visualization", "owner@example.com");

    const published = await repository.getSkill("visualization", {
      userId: "owner@example.com",
    });
    expect(published?.state).toBe("published");

    const resource = await repository.getSkillResource("visualization", "references/rules.md", {
      userId: "owner@example.com",
    });
    expect(resource?.state).toBe("published");
    expect(resource?.content).toBe("draft resource");
  });
});

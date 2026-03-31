import { describe, expect, it } from "vitest";
import { ServerSkillRepositorySqlite } from "./impl/server-skill-repository-sqlite";

describe("server skill repository bundle writes", () => {
  it("saves skill bundles as published records", async () => {
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
      resources: [{ path: "references/rules.md", content: "published resource" }],
    });

    const published = await repository.getSkill("visualization", {
      userId: "owner@example.com",
    });
    expect(published?.state).toBe("published");

    const resource = await repository.getSkillResource("visualization", "references/rules.md", {
      userId: "owner@example.com",
    });
    expect(resource?.state).toBe("published");
    expect(resource?.content).toBe("published resource");
  });

  it("deletes resources from a skill bundle regardless of state", async () => {
    const repository = new ServerSkillRepositorySqlite(":memory:");

    await repository.upsertSkillBundle("owner@example.com", {
      id: "clickhouse-errors",
      content: `---
name: clickhouse-errors
description: Diagnose ClickHouse error codes.
---

# ClickHouse Errors
`,
      scope: "self",
      resources: [{ path: "references/115.md", content: "draft resource" }],
    });

    expect(
      await repository.getSkillResource("clickhouse-errors", "references/115.md", {
        userId: "owner@example.com",
      })
    ).not.toBeNull();

    expect(
      await repository.getSkillResource("clickhouse-errors", "references/115.md", {
        userId: "owner@example.com",
      })
    ).not.toBeNull();

    await repository.upsertSkillBundle("owner@example.com", {
      id: "clickhouse-errors",
      content: `---
name: clickhouse-errors
description: Diagnose ClickHouse error codes.
---

# ClickHouse Errors
`,
      deletedResourcePaths: ["references/115.md"],
    });

    expect(
      await repository.getSkillResource("clickhouse-errors", "references/115.md", {
        userId: "owner@example.com",
      })
    ).toBeNull();

    expect(
      await repository.getSkillResource("clickhouse-errors", "references/115.md", {
        userId: "owner@example.com",
      })
    ).toBeNull();
  });

  it("can save and publish a skill bundle in one request", async () => {
    const repository = new ServerSkillRepositorySqlite(":memory:");

    await repository.saveAndPublishSkillBundle("owner@example.com", {
      id: "clickhouse-errors",
      content: `---
name: clickhouse-errors
description: Diagnose ClickHouse error codes.
---

# ClickHouse Errors
`,
      scope: "self",
      resources: [{ path: "references/115.md", content: "published resource" }],
    });

    const published = await repository.getSkill("clickhouse-errors", {
      userId: "owner@example.com",
    });
    expect(published?.state).toBe("published");

    const resource = await repository.getSkillResource("clickhouse-errors", "references/115.md", {
      userId: "owner@example.com",
    });
    expect(resource?.state).toBe("published");
    expect(resource?.content).toBe("published resource");
  });

  it("can publish resources without creating a skill row", async () => {
    const repository = new ServerSkillRepositorySqlite(":memory:");

    await repository.publishSkillResources("owner@example.com", {
      id: "clickhouse-errors",
      resources: [{ path: "references/115.md", content: "resource only publish" }],
    });

    const skill = await repository.getSkill("clickhouse-errors", {
      userId: "owner@example.com",
    });
    expect(skill).toBeNull();

    const resource = await repository.getSkillResource("clickhouse-errors", "references/115.md", {
      userId: "owner@example.com",
    });
    expect(resource?.state).toBe("published");
    expect(resource?.content).toBe("resource only publish");
  });
});

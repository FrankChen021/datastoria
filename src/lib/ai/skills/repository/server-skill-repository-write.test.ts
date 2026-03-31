import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { knex } from "knex";
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

  it("supports legacy ai_skills tables that still use id as the external identifier", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-skill-repository-"));
    const sqlitePath = path.join(tempDir, "skills.sqlite");

    const db = knex({
      client: "better-sqlite3",
      connection: {
        filename: sqlitePath,
      },
      useNullAsDefault: true,
    });

    try {
      await db.schema.createTable("ai_skills", (table) => {
        table.text("id").primary();
        table.text("type").notNullable();
        table.text("skill_id").nullable();
        table.text("meta").nullable();
        table.text("content").notNullable();
        table.text("state").notNullable();
        table.text("scope").notNullable();
        table.text("version").nullable();
        table.text("owner_id").nullable();
        table.text("created_at").notNullable();
        table.text("updated_at").notNullable();
      });

      const timestamp = "2026-03-31 00:00:00.000";
      await db("ai_skills").insert({
        id: "legacy-skill",
        type: "skill",
        skill_id: null,
        meta: JSON.stringify({ name: "legacy-skill", description: "Legacy skill" }),
        content: "# Legacy skill",
        state: "published",
        scope: "self",
        version: null,
        owner_id: "owner@example.com",
        created_at: timestamp,
        updated_at: timestamp,
      });

      const repository = new ServerSkillRepositorySqlite(sqlitePath);

      const existing = await repository.getSkill("legacy-skill", {
        userId: "owner@example.com",
      });
      expect(existing?.id).toBe("legacy-skill");

      await repository.upsertSkillBundle("owner@example.com", {
        id: "new-skill",
        content: `---
name: new-skill
description: Newly inserted skill.
---

# New Skill
`,
        resources: [{ path: "references/1.md", content: "legacy compatible resource" }],
      });

      const inserted = await repository.getSkill("new-skill", {
        userId: "owner@example.com",
      });
      expect(inserted?.id).toBe("new-skill");

      const resource = await repository.getSkillResource("new-skill", "references/1.md", {
        userId: "owner@example.com",
      });
      expect(resource?.id).toBe("new-skill:references/1.md");
    } finally {
      await db.destroy();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

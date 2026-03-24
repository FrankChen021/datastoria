import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSkillProvider } from "./database-skill-provider";
import { clearDiskSkillProviderCache, DiskSkillProvider } from "./disk-skill-provider";
import { ServerSkillRepositorySqlite } from "./repository/impl/server-skill-repository-sqlite";
import { CompositeSkillProvider } from "./skill-provider";

function writeSkill(
  rootDir: string,
  dirName: string,
  content: string,
  resources?: Record<string, string>
): void {
  const skillDir = path.join(rootDir, dirName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  for (const [resourcePath, resourceContent] of Object.entries(resources ?? {})) {
    const fullPath = path.join(skillDir, resourcePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, resourceContent);
  }
}

describe("skill provider overlay", () => {
  const originalSkillsRootDir = process.env.SKILLS_ROOT_DIR;
  const tempDirs: string[] = [];

  afterEach(() => {
    process.env.SKILLS_ROOT_DIR = originalSkillsRootDir;
    clearDiskSkillProviderCache();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("overlays disk skills with published database skills and resources", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-provider-test-"));
    tempDirs.push(rootDir);
    process.env.SKILLS_ROOT_DIR = rootDir;

    writeSkill(
      rootDir,
      "visualization",
      `---
name: visualization
description: Render charts from disk.
metadata:
  author: Disk Team
---

# Visualization

Disk copy.
`,
      {
        "references/rules.md": "disk resource",
      }
    );

    const repository = new ServerSkillRepositorySqlite(":memory:");
    await repository.upsertSkill({
      id: "visualization",
      type: "skill",
      content: `---
name: visualization
description: Render charts from database.
---

# Visualization

Database copy.
`,
      meta_text: JSON.stringify({
        name: "visualization",
        description: "Render charts from database.",
      }),
      state: "published",
      scope: "global",
      version: "2.0.0",
      owner_id: "owner@example.com",
      source: "database",
    });
    await repository.upsertSkill({
      id: "visualization:references/rules.md",
      type: "resource",
      skill_id: "visualization",
      content: "database resource",
      meta_text: JSON.stringify({ path: "references/rules.md" }),
      state: "published",
      scope: "global",
      version: "2.0.0",
      owner_id: "owner@example.com",
      source: "database",
    });

    const provider = new CompositeSkillProvider([
      new DiskSkillProvider(),
      new DatabaseSkillProvider(repository, { userId: null }),
    ]);

    const skills = await provider.listSkills();
    const visualization = skills.find((skill) => skill.id === "visualization");
    expect(visualization).toMatchObject({
      id: "visualization",
      source: "database",
      author: "owner@example.com",
      version: "2.0.0",
      description: "Render charts from database.",
    });

    const detail = await provider.getSkillDetail("visualization");
    expect(detail?.source).toBe("database");
    expect(detail?.content).toContain("Database copy.");
    expect(detail?.resourcePaths).toEqual(["references/rules.md"]);

    const resource = await provider.getSkillResource("visualization", "references/rules.md");
    expect(resource).toBe("database resource");
  });

  it("filters self-scoped database skills by owner and maps owner_id to author", async () => {
    const repository = new ServerSkillRepositorySqlite(":memory:");
    await repository.upsertSkill({
      id: "private-skill",
      type: "skill",
      content: "# Private skill",
      meta_text: JSON.stringify({ name: "private-skill", description: "Only mine." }),
      state: "published",
      scope: "self",
      owner_id: "me@example.com",
      source: "database",
    });

    const visibleProvider = new DatabaseSkillProvider(repository, { userId: "me@example.com" });
    const hiddenProvider = new DatabaseSkillProvider(repository, { userId: "other@example.com" });

    const visibleSkills = await visibleProvider.listSkills();
    expect(visibleSkills).toHaveLength(1);
    expect(visibleSkills[0]?.author).toBe("me@example.com");

    const hiddenSkills = await hiddenProvider.listSkills();
    expect(hiddenSkills).toEqual([]);
  });
});

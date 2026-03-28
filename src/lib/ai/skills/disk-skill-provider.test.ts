import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearDiskSkillProviderCache, DiskSkillProvider } from "./disk-skill-provider";

function writeSkill(rootDir: string, dirName: string, content: string): void {
  const skillDir = path.join(rootDir, dirName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
}

describe("DiskSkillProvider skill metadata", () => {
  const originalSkillsRootDir = process.env.SKILLS_ROOT_DIR;
  const tempDirs: string[] = [];
  const provider = new DiskSkillProvider();

  afterEach(() => {
    process.env.SKILLS_ROOT_DIR = originalSkillsRootDir;
    clearDiskSkillProviderCache();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads disableSlashCommand metadata without eagerly registering commands", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-manager-test-"));
    tempDirs.push(rootDir);

    writeSkill(
      rootDir,
      "diagnose-clickhouse-errors",
      `---
name: diagnose-clickhouse-errors
description: Diagnose ClickHouse errors.
---

# Diagnose ClickHouse Errors
`
    );

    writeSkill(
      rootDir,
      "visualization",
      `---
name: visualization
description: Build charts.
metadata:
  disable-slash-command: true
---

# Visualization
`
    );

    process.env.SKILLS_ROOT_DIR = rootDir;
    clearDiskSkillProviderCache();

    const skills = await provider.listSkills();

    expect(
      skills.find((skill) => skill.name === "diagnose-clickhouse-errors")?.disableSlashCommand
    ).toBe(false);
    expect(skills.find((skill) => skill.name === "visualization")?.disableSlashCommand).toBe(true);
  });
});

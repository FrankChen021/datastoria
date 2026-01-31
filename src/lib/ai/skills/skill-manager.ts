// Skill Manager: finds, parses, and caches skill metadata from src/lib/ai/skills/**/SKILL.md.
// Uses gray-matter for YAML frontmatter (name, description).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const SKILL_FILE = "SKILL.md";

export interface SkillMetadata {
  name: string;
  description: string;
}

const cache: { list: SkillMetadata[] | null; content: Map<string, string> } = {
  list: null,
  content: new Map(),
};

/**
 *
 * @returns Array of skill names and paths
 */
function discoverSkillPaths(): Array<{ name: string; path: string }> {
  const skillsDir = join(process.cwd(), "src", "lib", "ai", "skills");

  const entries: Array<{ name: string; path: string }> = [];
  try {
    const dirs = readdirSync(skillsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) {
        continue;
      }
      const skillPath = join(skillsDir, dir.name, SKILL_FILE);
      try {
        const content = readFileSync(skillPath, "utf-8");
        if (content.trim()) {
          entries.push({ name: dir.name, path: skillPath });

          console.log(`Discovered skill: ${dir.name} at ${skillPath}`);
        }
      } catch {
        // Skip directories without SKILL.md
      }
    }
  } catch {
    // skillsDir may not exist yet
  }
  return entries;
}

/** Scan src/lib/ai/skills subdirs for SKILL.md and return metadata (name, description) from frontmatter. */
export function listSkills(): SkillMetadata[] {
  if (cache.list) {
    return cache.list;
  }

  const paths = discoverSkillPaths();
  const list: SkillMetadata[] = [];
  for (const { name: dirName, path: skillPath } of paths) {
    try {
      const raw = readFileSync(skillPath, "utf-8");
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const metaName = typeof data.name === "string" ? data.name : dirName;
      const meta: SkillMetadata = {
        name: metaName,
        description: typeof data.description === "string" ? data.description : "",
      };
      list.push(meta);
      const formatted = formatSkillOutput(metaName, raw);
      cache.content.set(metaName, formatted);
      if (dirName !== metaName) {
        cache.content.set(dirName, formatted);
      }
      console.log(`Loaded skill: ${meta.name} at ${skillPath}`);
    } catch (e) {
      // Skip invalid skills
      console.warn(`Invalid skill: ${dirName} at ${skillPath}`, e);
    }
  }
  cache.list = list;
  return list;
}

/**
 * Return full markdown content for a skill by name (folder name or frontmatter name).
 * Uses the same cache as listSkills(); only calls discoverSkillPaths() via listSkills() when cache is empty.
 */
export function getSkill(name: string): string | null {
  // Search by the exact name
  const formatted = cache.content.get(name);
  if (formatted) {
    return formatted;
  }

  // Search by the normalized name
  const normalized = name.toLowerCase().trim();
  if (!cache.list) {
    listSkills();
  }
  for (const [key, value] of cache.content) {
    if (key.toLowerCase() === normalized) {
      return value;
    }
  }
  return null;
}

function formatSkillOutput(skillName: string, raw: string): string {
  const parsed = matter(raw);
  const content = parsed.content.trim();
  return `# Manual Loaded: ${skillName}\n\n${content}`;
}

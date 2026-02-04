// Skill Manager: loads skills at build time via static imports.
// Skills are bundled as raw strings—no runtime filesystem access.
// To add a new skill: create <name>/SKILL.md, add import and SKILL_RAW_MAP entry.
import matter from "gray-matter";
import optimizationSkill from "./optimization/SKILL.md";
import sqlExpertSkill from "./sql-expert/SKILL.md";
import visualizationSkill from "./visualization/SKILL.md";

export interface SkillMetadata {
  name: string;
  description: string;
}

const SKILL_RAW_MAP: Record<string, string> = {
  optimization: optimizationSkill,
  "sql-expert": sqlExpertSkill,
  visualization: visualizationSkill,
};

function formatSkillOutput(skillName: string, raw: string): string {
  const parsed = matter(raw);
  const content = parsed.content.trim();
  return `# Manual Loaded: ${skillName}\n\n${content}`;
}

const cache: {
  list: SkillMetadata[];
  content: Map<string, string>;
} = (() => {
  const list: SkillMetadata[] = [];
  const content = new Map<string, string>();
  for (const [dirName, raw] of Object.entries(SKILL_RAW_MAP)) {
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const metaName = typeof data.name === "string" ? data.name : dirName;
    const meta: SkillMetadata = {
      name: metaName,
      description: typeof data.description === "string" ? data.description : "",
    };
    list.push(meta);
    const formatted = formatSkillOutput(metaName, raw);
    content.set(metaName, formatted);
    if (dirName !== metaName) {
      content.set(dirName, formatted);
    }
  }
  return { list, content };
})();

/** Return metadata for all bundled skills. */
export function listSkills(): SkillMetadata[] {
  return cache.list;
}

/**
 * Return full markdown content for a skill by name (folder name or frontmatter name).
 */
export function getSkill(name: string): string | null {
  const formatted = cache.content.get(name);
  if (formatted) {
    return formatted;
  }
  const normalized = name.toLowerCase().trim();
  for (const [key, value] of cache.content) {
    if (key.toLowerCase() === normalized) {
      return value;
    }
  }
  return null;
}

/**
 * Skill tool execution: loads one or more skill manuals by name, and optionally
 * additional resources (e.g. AGENTS.md or individual rule files) for those skills.
 * Tool definition lives in server-tools.ts (ServerTools.skill).
 */
import type { SkillToolInput } from "@/lib/ai/chat-types";
import { SkillManager } from "@/lib/ai/skills/skill-manager";

export class SkillTool {
  public static getToolDescription(): string {
    const skills = SkillManager.listSkills();
    const xmlLines = skills
      .map(
        (s) => `  <skill><name>${s.name}</name><description>${s.description}</description></skill>`
      )
      .join("\n");
    return `Load one or more specialized manuals for a task.

You MUST call this FIRST when a task requires domain expertise (e.g., visualization, SQL generation, ClickHouse optimization).

Usage:

1. To load manuals (SKILL.md):
   - Use the 'names' array with skill names.
   - Example: { "names": ["optimization"] }

2. To load additional rule/reference files for a skill:
   - Use the OPTIONAL 'resources' array.
   - Each resource has:
     - "skill": skill name (frontmatter 'name' or folder name)
     - "paths": relative paths inside that skill

   - Example (ClickHouse best practices, schema review):
     {
      "resources": [
        {
          "skill": "clickhouse-best-practices",
          "paths": [
            "rules/schema-pk-plan-before-creation.md",
            "rules/schema-pk-cardinality-order.md"
          ]
        }
       ]
     }

3. When a skill's SKILL.md tells you to "read rules/...md", ALWAYS use the 'resources' parameter to load those files before giving final recommendations.

Available skills:

<skills>
${xmlLines}
</skills>`;
  }

  public static async execute({ names, resources }: SkillToolInput): Promise<string> {
    const available = SkillManager.listSkills().map((s) => s.name);
    const loaded: string[] = [];
    const notFound: string[] = [];
    const missingResources: string[] = [];

    if (Array.isArray(names)) {
      for (const name of names) {
        const content = SkillManager.getSkill(name.trim());
        if (content) loaded.push(content);
        else notFound.push(name);
      }
    }

    if (Array.isArray(resources)) {
      for (const r of resources) {
        const skill = r.skill.trim();
        if (!skill) continue;
        const paths = r.paths.map((p) => p.trim()).filter((p) => p.length > 0);
        for (const path of paths) {
          if (path.toLowerCase() === "skill.md") {
            continue;
          }
          const content = SkillManager.getSkillResource(skill, path);
          if (content) {
            loaded.push(`# Skill Resource: ${skill} / ${path}\n\n${content}`);
          } else {
            missingResources.push(`${skill}:${path}`);
          }
        }
      }
    }

    if (loaded.length === 0) {
      const requested = Array.isArray(names) ? names.join(", ") : "none";
      return `No skills found. Requested: ${requested}. Available: ${available.join(", ")}.`;
    }

    const combined = loaded.join("\n\n---\n\n");
    const notes: string[] = [];
    if (notFound.length > 0) {
      notes.push(`Skill(s) not found: ${notFound.join(", ")}.`);
    }
    if (missingResources.length > 0) {
      notes.push(`Resource(s) not found: ${missingResources.join(", ")}.`);
    }
    if (notes.length === 0) return combined;
    return `${combined}\n\n---\nNote: ${notes.join(" ")} Available skills: ${available.join(", ")}.`;
  }
}

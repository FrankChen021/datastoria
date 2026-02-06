/**
 * Skill tools: two separate tools for loading skill manuals and skill resources.
 *
 * - SkillTool: loads one or more skill manuals (SKILL.md) by name.
 * - SkillResourceTool: loads additional reference files (rules/*.md, AGENTS.md) for
 *   skills whose manuals are already in context.
 *
 * Tool definitions live in server-tools.ts (ServerTools.skill / ServerTools.skill_resource).
 */
import type { SkillResourceToolInput, SkillToolInput } from "@/lib/ai/chat-types";
import { SkillManager } from "@/lib/ai/skills/skill-manager";

export class SkillTool {
  public static getToolDescription(): string {
    const skills = SkillManager.listSkills();
    const xmlLines = skills
      .map(
        (s) => `  <skill><name>${s.name}</name><description>${s.description}</description></skill>`
      )
      .join("\n");
    return `Load one or more specialized manuals (SKILL.md) for a task.

You MUST call this FIRST when a task requires domain expertise (e.g., visualization, SQL generation, ClickHouse optimization).

Usage:
  - Pass skill name(s) in the 'names' array.
  - Example: { "names": ["optimization"] }
  - Example: { "names": ["optimization", "visualization"] }

After loading a manual, if it tells you to "read rules/...md" or other reference files, use the separate 'skill_resource' tool to load them. Do NOT call this tool again for the same skill.

Available skills:

<skills>
${xmlLines}
</skills>`;
  }

  public static async execute({ names }: SkillToolInput): Promise<string> {
    const available = SkillManager.listSkills().map((s) => s.name);
    const loaded: string[] = [];
    const notFound: string[] = [];

    for (const name of names) {
      const content = SkillManager.getSkill(name.trim());
      if (content) loaded.push(content);
      else notFound.push(name);
    }

    if (loaded.length === 0) {
      return `No skills found. Requested: ${names.join(", ")}. Available: ${available.join(", ")}.`;
    }

    const combined = loaded.join("\n\n---\n\n");
    if (notFound.length === 0) return combined;
    return `${combined}\n\n---\nNote: Skill(s) not found: ${notFound.join(", ")}. Available skills: ${available.join(", ")}.`;
  }
}

export class SkillResourceTool {
  public static getToolDescription(): string {
    return `Load additional reference files (rules, AGENTS.md, etc.) for a skill whose manual is already in context.

Use this AFTER loading a skill manual via the 'skill' tool, when the manual instructs you to read additional rule or reference files.

Usage:
  - Pass one or more resource requests in the 'resources' array.
  - Each entry has a "skill" name and an array of relative "paths" within that skill.
  - Example:
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

IMPORTANT: Do NOT use the 'skill' tool to reload the manual. This tool loads only the referenced files.`;
  }

  public static async execute({ resources }: SkillResourceToolInput): Promise<string> {
    const available = SkillManager.listSkills().map((s) => s.name);
    const loaded: string[] = [];
    const missing: string[] = [];

    for (const r of resources) {
      const skill = r.skill.trim();
      if (!skill) continue;
      const paths = r.paths.map((p) => p.trim()).filter((p) => p.length > 0);
      for (const p of paths) {
        if (p.toLowerCase() === "skill.md") continue;
        const content = SkillManager.getSkillResource(skill, p);
        if (content) {
          loaded.push(`# Skill Resource: ${skill} / ${p}\n\n${content}`);
        } else {
          missing.push(`${skill}:${p}`);
        }
      }
    }

    if (loaded.length === 0) {
      const requested = resources.map((r) => `${r.skill}: ${r.paths.join(", ")}`).join("; ");
      return `No resources found. Requested: ${requested}. Available skills: ${available.join(", ")}.`;
    }

    const combined = loaded.join("\n\n---\n\n");
    if (missing.length === 0) return combined;
    return `${combined}\n\n---\nNote: Resource(s) not found: ${missing.join(", ")}. Available skills: ${available.join(", ")}.`;
  }
}

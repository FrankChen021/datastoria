/**
 * Skill tool execution: loads one or more skill manuals by name.
 * Tool definition lives in server-tools.ts (ServerTools.skill).
 */
import { SkillManager } from "@/lib/ai/skills/skill-manager";

export class SkillTool {
  public static getToolDescription(): string {
    const skills = SkillManager.listSkills();
    const xmlLines = skills
      .map(
        (s) => `  <skill><name>${s.name}</name><description>${s.description}</description></skill>`
      )
      .join("\n");
    return `Load one or more specialized manuals for a task. Call this FIRST when a task requires domain expertise (e.g., visualization, SQL generation, optimization). You can load a single skill or multiple skills in one call (e.g. for "query and chart" load both sql-generation and visualization). Available skills:

<skills>
${xmlLines}
</skills>`;
  }

  public static async execute({ names }: { names: string[] }): Promise<string> {
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
    if (notFound.length > 0) {
      return `${combined}\n\n---\nNote: Skill(s) not found: ${notFound.join(", ")}. Available: ${available.join(", ")}.`;
    }
    return combined;
  }
}

/**
 * Skill tools: two separate tools for loading skill manuals and skill resources.
 *
 * - SkillTool: loads one or more skill manuals (SKILL.md) by name.
 * - SkillResourceTool: loads additional reference files (rules/*.md, AGENTS.md) for
 *   skills whose manuals are already in context.
 */
import type { SkillResourceToolInput, SkillToolInput } from "@/lib/ai/chat-types";
import { CommandManager, type CommandDetail } from "@/lib/ai/commands/command-manager";
import { findSkillByLookup, type SkillProvider } from "@/lib/ai/skills/skill-provider";
import type { SkillCatalogItem } from "@/lib/ai/skills/skill-types";
import matter from "gray-matter";

const COMMAND_NAME_RE = /^[a-z][a-z0-9_-]*$/;

function buildSkillXml(skills: SkillCatalogItem[]): string {
  return skills
    .map((skill) => {
      const source = skill.source;
      return `  <skill><name>${skill.name}</name><description>${skill.description}</description><source>${source}</source></skill>`;
    })
    .join("\n");
}

export function buildSkillToolDescription(skills: SkillCatalogItem[]): string {
  return `Load one or more specialized manuals (SKILL.md) for a task.

You MUST call this FIRST when a task requires domain expertise (e.g., visualization, SQL generation, ClickHouse optimization).

Usage:
  - Pass skill name(s) in the 'names' array.
  - Example: { "names": ["optimize-clickhouse-queries"] }
  - Example: { "names": ["optimize-clickhouse-queries", "visualization"] }

After loading a manual, if it tells you to "read rules/...md" or other reference files, use the separate 'skill_resource' tool to load them. Do NOT call this tool again for the same skill.

Available skills:

<skills>
${buildSkillXml(skills)}
</skills>`;
}

export function buildSkillResourceToolDescription(): string {
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

async function resolveSkillLookup(
  provider: SkillProvider,
  lookup: string
): Promise<SkillCatalogItem | null> {
  const skills = await provider.listSkills();
  return findSkillByLookup(skills, lookup);
}

export function createSkillToolExecutor(provider: SkillProvider) {
  return async ({ names }: SkillToolInput): Promise<string> => {
    const availableSkills = await provider.listSkills();
    const available = availableSkills.map((skill) => skill.name);
    const loaded: string[] = [];
    const notFound: string[] = [];

    for (const name of names) {
      const match = findSkillByLookup(availableSkills, name.trim());
      if (!match) {
        notFound.push(name);
        continue;
      }
      const detail = await provider.getSkillDetail(match.id);
      if (detail?.content) {
        const content = detail.content.trimStart().startsWith("---")
          ? matter(detail.content).content.trim()
          : detail.content.trim();
        loaded.push(`# Manual Loaded: ${detail.name}\n\n${content}`);
      } else {
        notFound.push(name);
      }
    }

    if (loaded.length === 0) {
      return `No skills found. Requested: ${names.join(", ")}. Available: ${available.join(", ")}.`;
    }

    const combined = loaded.join("\n\n---\n\n");
    if (notFound.length === 0) return combined;
    return `${combined}\n\n---\nNote: Skill(s) not found: ${notFound.join(", ")}. Available skills: ${available.join(", ")}.`;
  };
}

export function createSkillResourceToolExecutor(provider: SkillProvider) {
  return async ({ resources }: SkillResourceToolInput): Promise<string> => {
    const availableSkills = await provider.listSkills();
    const available = availableSkills.map((skill) => skill.name);
    const loaded: string[] = [];
    const missing: string[] = [];

    for (const request of resources) {
      const skill = await resolveSkillLookup(provider, request.skill.trim());
      if (!skill) {
        missing.push(`${request.skill}:${request.paths.join(", ")}`);
        continue;
      }
      for (const path of request.paths.map((entry) => entry.trim()).filter(Boolean)) {
        if (path.toLowerCase() === "skill.md") continue;
        const content = await provider.getSkillResource(skill.id, path);
        if (content) {
          loaded.push(`# Skill Resource: ${skill.name} / ${path}\n\n${content}`);
        } else {
          missing.push(`${request.skill}:${path}`);
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
  };
}

export function buildSkillCommands(skills: SkillCatalogItem[]): CommandDetail[] {
  const commands = skills
    .filter((skill) => !skill.disableSlashCommand && COMMAND_NAME_RE.test(skill.name.trim()))
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      skillId: skill.id,
      template: CommandManager.buildSkillCommandTemplate(skill.name),
    }));
  commands.sort((a, b) => a.name.localeCompare(b.name));
  return commands;
}

export function expandCommandText(text: string, commands: CommandDetail[]): string | null {
  const match = /^\/([a-z][a-z0-9_-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) {
    return null;
  }

  const command = commands.find((entry) => entry.name === match[1]);
  if (!command) {
    return null;
  }

  return command.template.replace("$ARGUMENTS", (match[2] ?? "").trim());
}

// Request-scoped command catalog derived from the effective skill set.
import type { SkillCatalogItem } from "@/lib/ai/skills/skill-types";

export interface CommandCatalogItem {
  /** Slash command name. */
  name: string;
  /** One-line description shown in the slash command catalog. */
  description: string;
  /** Stable skill folder id this command belongs to. */
  skillId: string;
}

export interface CommandDetail extends CommandCatalogItem {
  /** Prompt template. $ARGUMENTS is replaced with user input at submit time. */
  template: string;
}

const COMMAND_NAME_RE = /^[a-z][a-z0-9_-]*$/;

export class CommandManager {
  constructor(private readonly commands: CommandDetail[]) {}

  public static buildSkillCommandTemplate(skillName: string): string {
    return `Use the \`${skillName}\` skill for this request: $ARGUMENTS`;
  }

  public static fromSkills(skills: SkillCatalogItem[]): CommandManager {
    const seen = new Set<string>();
    const commands = skills
      .filter((skill) => !skill.disableSlashCommand && COMMAND_NAME_RE.test(skill.name.trim()))
      .flatMap((skill) => {
        const name = skill.name.trim();
        if (seen.has(name)) {
          console.warn(`[CommandManager] Duplicate command name "${name}" — skipping`);
          return [];
        }
        seen.add(name);
        return [
          {
            name,
            description: skill.description,
            skillId: skill.id,
            template: CommandManager.buildSkillCommandTemplate(skill.name),
          } satisfies CommandDetail,
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return new CommandManager(commands);
  }

  /** Return all registered commands, sorted by name. */
  public listCommands(): CommandDetail[] {
    return [...this.commands];
  }

  /** Return full detail for a command by name, or null if not found. */
  public getCommand(name: string): CommandDetail | null {
    const trimmed = name.trim();
    return this.commands.find((c) => c.name === trimmed) ?? null;
  }

  /**
   * If `text` starts with a known slash command (e.g. `/diagnose-clickhouse-errors <args>`),
   * return the expanded template with `$ARGUMENTS` replaced by the trailing text.
   * Returns `null` if the text does not match any command, so the caller can
   * pass it through unchanged.
   */
  public expand(text: string): string | null {
    const match = /^\/([a-z][a-z0-9_-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (!match) return null;

    const cmd = this.getCommand(match[1]);
    if (!cmd) return null;

    return cmd.template.replace("$ARGUMENTS", (match[2] ?? "").trim());
  }
}

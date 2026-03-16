// CommandManager: registry for slash commands derived from loaded skills.

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

type CommandCache = {
  list: CommandDetail[];
};

const COMMAND_NAME_RE = /^[a-z][a-z0-9_-]*$/;

export class CommandManager {
  private static cache: CommandCache = { list: [] };
  private static seen = new Set<string>();

  public static buildSkillCommandTemplate(skillName: string): string {
    return `Use the \`${skillName}\` skill for this request: $ARGUMENTS`;
  }

  public static registerCommand(command: CommandDetail): void {
    const name = command.name.trim();
    if (!COMMAND_NAME_RE.test(name)) {
      console.warn(`[CommandManager] Skipping invalid command name "${name}"`);
      return;
    }

    if (CommandManager.seen.has(name)) {
      console.warn(`[CommandManager] Duplicate command name "${name}" — skipping`);
      return;
    }

    CommandManager.seen.add(name);
    CommandManager.cache.list.push({ ...command, name });
    CommandManager.cache.list.sort((a, b) => a.name.localeCompare(b.name));
    console.info(`[CommandManager] Registered command /${name} from skill "${command.skillId}"`);
  }

  /** Return all registered commands, sorted by name. */
  public static listCommands(): CommandDetail[] {
    return [...CommandManager.cache.list];
  }

  /** Return full detail for a command by name, or null if not found. */
  public static getCommand(name: string): CommandDetail | null {
    const trimmed = name.trim();
    return CommandManager.cache.list.find((c) => c.name === trimmed) ?? null;
  }

  /** Clear the in-memory registry (tests and skill reloads). */
  public static clearCache(): void {
    CommandManager.cache = { list: [] };
    CommandManager.seen.clear();
  }

  /**
   * If `text` starts with a known slash command (e.g. `/diagnose-clickhouse-errors <args>`),
   * return the expanded template with `$ARGUMENTS` replaced by the trailing text.
   * Returns `null` if the text does not match any command, so the caller can
   * pass it through unchanged.
   */
  public static expand(text: string): string | null {
    const match = /^\/([a-z][a-z0-9_-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (!match) return null;

    const cmd = CommandManager.getCommand(match[1]);
    if (!cmd) return null;

    return cmd.template.replace("$ARGUMENTS", (match[2] ?? "").trim());
  }
}

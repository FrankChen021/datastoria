// CommandManager: discovers slash command definitions from disk.
// Commands live in command/*.md inside each skill folder.
// The filename (without .md) is the command name; frontmatter supplies description;
// the body is the prompt template with $ARGUMENTS as the user-input placeholder.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface CommandCatalogItem {
  /** Slash command name derived from the filename (without .md). */
  name: string;
  /** One-line description from frontmatter `description` field. */
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

const COMMAND_DIR = "command";
const COMMAND_NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_COMMAND_BYTES = 512 * 1024;

export class CommandManager {
  private static cache: CommandCache | null = null;

  private static getSkillsRootDir(): string {
    const env = process.env.SKILLS_ROOT_DIR;
    if (env && path.isAbsolute(env)) return env;

    const prodCandidates = [
      path.join(process.cwd(), ".next", "server", "skills"),
      path.join(process.cwd(), ".next", "standalone", ".next", "server", "skills"),
    ];
    const devCandidates = [
      path.join(process.cwd(), "src", "lib", "ai", "skills"),
      ...prodCandidates,
    ];
    const candidates = process.env.NODE_ENV === "production" ? prodCandidates : devCandidates;

    for (const dir of candidates) {
      try {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
      } catch {
        // ignore
      }
    }

    return path.join(process.cwd(), "src", "lib", "ai", "skills");
  }

  private static isSafeRelativePath(p: string): boolean {
    if (p.length === 0) return false;
    if (path.isAbsolute(p)) return false;
    const normalized = path.posix.normalize(p.replaceAll("\\", "/"));
    return !normalized.startsWith("../") && normalized !== "..";
  }

  private static buildCache(): CommandCache {
    const rootDir = CommandManager.getSkillsRootDir();
    const commands: CommandDetail[] = [];
    const seen = new Set<string>();

    let skillDirs: fs.Dirent[];
    try {
      skillDirs = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
      return { list: [] };
    }

    for (const skillEntry of skillDirs) {
      if (!skillEntry.isDirectory()) continue;
      if (skillEntry.name.startsWith(".")) continue;

      const skillId = skillEntry.name;
      const commandDir = path.join(rootDir, skillId, COMMAND_DIR);

      let commandFiles: fs.Dirent[];
      try {
        commandFiles = fs.readdirSync(commandDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of commandFiles) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".md")) continue;
        if (entry.name.startsWith(".")) continue;

        const name = entry.name.slice(0, -3);
        if (!COMMAND_NAME_RE.test(name)) {
          console.warn(
            `[CommandManager] Skipping invalid command name "${name}" in skill "${skillId}"`
          );
          continue;
        }
        if (seen.has(name)) {
          console.warn(
            `[CommandManager] Duplicate command name "${name}" in skill "${skillId}" — skipping`
          );
          continue;
        }

        const filePath = path.join(commandDir, entry.name);
        if (!CommandManager.isSafeRelativePath(path.relative(rootDir, filePath))) continue;

        let raw: string;
        try {
          const stat = fs.statSync(filePath);
          if (stat.size > MAX_COMMAND_BYTES) {
            console.warn(`[CommandManager] Skipping oversized command file: ${filePath}`);
            continue;
          }
          raw = fs.readFileSync(filePath, "utf-8");
        } catch {
          continue;
        }

        const parsed = matter(raw);
        const data = parsed.data as Record<string, unknown>;
        const description = typeof data.description === "string" ? data.description : "";
        const template = parsed.content.trim();

        seen.add(name);
        commands.push({ name, description, skillId, template });
        console.info(`[CommandManager] Loaded command /${name} from skill "${skillId}"`);
      }
    }

    commands.sort((a, b) => a.name.localeCompare(b.name));
    return { list: commands };
  }

  private static getCache(): CommandCache {
    CommandManager.cache ??= CommandManager.buildCache();
    return CommandManager.cache;
  }

  /** Return all discovered commands, sorted by name. */
  public static listCommands(): CommandDetail[] {
    return CommandManager.getCache().list;
  }

  /** Return full detail for a command by name, or null if not found. */
  public static getCommand(name: string): CommandDetail | null {
    const trimmed = name.trim();
    return CommandManager.getCache().list.find((c) => c.name === trimmed) ?? null;
  }

  /** Clear in-memory cache (tests and dev tooling). */
  public static clearCache(): void {
    CommandManager.cache = null;
  }

  /**
   * If `text` starts with a known slash command (e.g. `/explain_error <args>`),
   * return the expanded template with `$ARGUMENTS` replaced by the trailing text.
   * Returns `null` if the text does not match any command, so the caller can
   * pass it through unchanged.
   */
  public static expand(text: string): string | null {
    const match = /^\/([a-z][a-z0-9_]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (!match) return null;

    const cmd = CommandManager.getCommand(match[1]);
    if (!cmd) return null;

    return cmd.template.replace("$ARGUMENTS", (match[2] ?? "").trim());
  }
}

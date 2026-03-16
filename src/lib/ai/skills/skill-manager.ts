// Skill Manager: loads skills dynamically from disk (Node runtime).
// This enables multi-file skill packs and avoids manual static imports.
import fs from "node:fs";
import path from "node:path";
import { CommandManager } from "@/lib/ai/commands/command-manager";
import matter from "gray-matter";

export interface SkillMetadata {
  name: string;
  description: string;
}

export type SkillSource = "built-in" | "user";
export type SkillStatus = "available" | "disabled" | "invalid";

export interface SkillCatalogItem {
  /** Stable identifier derived from the leaf folder name. */
  id: string;
  /** Human-readable name from frontmatter `name` field. */
  name: string;
  /** One-line description from frontmatter `description` field. */
  description: string;
  /** Origin of the skill. Always "built-in" in phase 1. */
  source: SkillSource;
  /** Runtime status. Always "available" in phase 1. */
  status: SkillStatus;
  /** Optional version string from metadata frontmatter. */
  version?: string;
  /** Optional author/provider from metadata frontmatter. */
  provider?: string;
  /** Short summary paragraph extracted from the SKILL.md body. */
  summary?: string;
  /** Whether this skill has sub-resources (rules/*.md, AGENTS.md, etc.). */
  hasResources?: boolean;
  /** Whether this skill is excluded from slash command registration. */
  disableSlashCommand?: boolean;
}

type SkillCache = {
  list: SkillMetadata[];
  /**
   * Key: skill name (frontmatter `name` or folder name).
   * Value: formatted markdown (e.g. "# Manual Loaded: <name>\n\n<body>").
   */
  system: Map<string, string>;
  /**
   * Key: skill name (same keys as `content`).
   * Value: directory path (relative to skills root) where that skill's SKILL.md lives.
   * Used for resolving additional resources like AGENTS.md and rules/*.md per skill.
   */
  extensions: Map<string, string>;
  /**
   * Catalog metadata for the Skills UI.
   * Sorted by name for stable ordering.
   */
  catalog: SkillCatalogItem[];
  /**
   * Key: stable id (leaf folder name).
   * Value: raw SKILL.md content (including frontmatter) for the detail endpoint.
   */
  rawContent: Map<string, string>;
};

export class SkillManager {
  private static readonly SKILL_FILENAME = "SKILL.md";
  /** Max size (bytes) for a single SKILL.md file. Rejects larger files to avoid OOM and abuse. 512KB fits typical manuals. */
  private static readonly MAX_SKILL_BYTES = 512 * 1024;

  private static cache: SkillCache | null = null;

  private static formatSkillOutput(skillName: string, raw: string): string {
    const parsed = matter(raw);
    const content = parsed.content.trim();
    return `# Manual Loaded: ${skillName}\n\n${content}`;
  }

  private static shouldDisableSlashCommand(data: Record<string, unknown>): boolean {
    if (data["disable-slash-command"] === true) return true;
    const metadataBlock = (data.metadata ?? {}) as Record<string, unknown>;
    return metadataBlock["disable-slash-command"] === true;
  }

  private static getSkillsRootDir(): string {
    const env = process.env.SKILLS_ROOT_DIR;
    if (env && path.isAbsolute(env)) {
      return env;
    }

    const prodCandidates = [
      // Production: populated by scripts/copy-skills.mjs
      path.join(process.cwd(), ".next", "server", "skills"),
      path.join(process.cwd(), ".next", "standalone", ".next", "server", "skills"),
    ];

    const devCandidates = [path.join(process.cwd(), "resources", "skills"), ...prodCandidates];

    const candidates = process.env.NODE_ENV === "production" ? prodCandidates : devCandidates;

    for (const dir of candidates) {
      try {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
      } catch {
        // ignore
      }
    }

    return path.join(process.cwd(), "resources", "skills");
  }

  private static isSafeRelativePath(p: string): boolean {
    if (p.length === 0) return false;
    if (path.isAbsolute(p)) return false;
    const normalized = path.posix.normalize(p.replaceAll("\\", "/"));
    return !normalized.startsWith("../") && normalized !== "..";
  }

  private static walkDirsForSkillFiles(rootDir: string): string[] {
    const out: string[] = [];
    const stack: string[] = [rootDir];

    while (stack.length > 0) {
      const dir = stack.pop();
      if (!dir) break;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!entry.isFile()) continue;
        if (entry.name === SkillManager.SKILL_FILENAME) out.push(full);
      }
    }

    return out;
  }

  private static readSkillFile(skillPath: string): string | null {
    try {
      const stat = fs.statSync(skillPath);
      if (!stat.isFile()) return null;
      if (stat.size > SkillManager.MAX_SKILL_BYTES) {
        console.warn(
          `[SkillManager] Skipping skill file (exceeds ${SkillManager.MAX_SKILL_BYTES} bytes): ${skillPath} (${stat.size} bytes)`
        );
        return null;
      }
      return fs.readFileSync(skillPath, "utf-8");
    } catch {
      return null;
    }
  }

  private static buildCache(): SkillCache {
    const rootDir = SkillManager.getSkillsRootDir();
    const skillFiles = SkillManager.walkDirsForSkillFiles(rootDir);

    const list: SkillMetadata[] = [];
    const content = new Map<string, string>();
    const roots = new Map<string, string>();
    const catalog: SkillCatalogItem[] = [];
    const rawContent = new Map<string, string>();

    CommandManager.clearCache();

    for (const skillFile of skillFiles) {
      const raw = SkillManager.readSkillFile(skillFile);
      if (!raw) continue;

      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;

      const dirName = path.basename(path.dirname(skillFile));
      const metaName = typeof data.name === "string" ? data.name : dirName;
      const disableSlashCommand = SkillManager.shouldDisableSlashCommand(data);
      const meta: SkillMetadata = {
        name: metaName,
        description: typeof data.description === "string" ? data.description : "",
      };

      const formatted = SkillManager.formatSkillOutput(metaName, raw);

      list.push(meta);
      content.set(metaName, formatted);
      const skillDir = path.relative(rootDir, path.dirname(skillFile)) || ".";
      roots.set(metaName, skillDir);
      if (dirName !== metaName) {
        content.set(dirName, formatted);
        roots.set(dirName, skillDir);
      }

      // Build catalog item
      const metadataBlock = (data.metadata ?? {}) as Record<string, unknown>;
      const catalogItem: SkillCatalogItem = {
        id: dirName,
        name: metaName,
        description: typeof data.description === "string" ? data.description : "",
        source: "built-in",
        status: "available",
        version: typeof metadataBlock.version === "string" ? metadataBlock.version : undefined,
        provider: typeof metadataBlock.author === "string" ? metadataBlock.author : undefined,
        summary: SkillManager.extractSummary(parsed.content),
        hasResources: SkillManager.skillDirHasResources(path.dirname(skillFile)),
        disableSlashCommand,
      };
      catalog.push(catalogItem);
      rawContent.set(dirName, raw);

      if (!disableSlashCommand) {
        CommandManager.registerCommand({
          name: metaName,
          description: meta.description,
          skillId: dirName,
          template: CommandManager.buildSkillCommandTemplate(metaName),
        });
      }

      console.info(`[SkillManager] Loaded skill [${meta.name}] at location ${skillFile}`);
    }

    // This makes sure the list at the model side has a stable and predictable order
    list.sort((a, b) => a.name.localeCompare(b.name));
    catalog.sort((a, b) => a.name.localeCompare(b.name));

    return { list, system: content, extensions: roots, catalog, rawContent };
  }

  private static getCache(): SkillCache {
    SkillManager.cache ??= SkillManager.buildCache();
    return SkillManager.cache;
  }

  /** Return metadata for all bundled skills. */
  public static listSkills(): SkillMetadata[] {
    return SkillManager.getCache().list;
  }

  /**
   * Return full markdown content for a skill by name (folder name or frontmatter name).
   */
  public static getSkill(name: string): string | null {
    const trimmed = name.trim();
    if (!SkillManager.isSafeRelativePath(trimmed)) {
      // Treat unsafe names as not found (prevents weird keys from being used as probes).
      return null;
    }

    const c = SkillManager.getCache();
    const formatted = c.system.get(trimmed);
    if (formatted) {
      return formatted;
    }
    const normalized = trimmed.toLowerCase();
    for (const [key, value] of c.system) {
      if (key.toLowerCase() === normalized) {
        return value;
      }
    }
    return null;
  }

  /**
   * Resolve and load an additional resource for a given skill, such as:
   * - AGENTS.md
   * - rules/schema-pk-plan-before-creation.md
   *
   * Returns raw markdown (no extra formatting) from DISK or null if not found/unsafe.
   */
  public static getSkillResource(skillName: string, resourcePath: string): string | null {
    skillName = skillName.trim();
    resourcePath = resourcePath.trim();
    if (
      !SkillManager.isSafeRelativePath(skillName) ||
      !SkillManager.isSafeRelativePath(resourcePath)
    ) {
      return null;
    }

    const resolveDir = (name: string): string | null => {
      const cache = SkillManager.getCache();

      const direct = cache.extensions.get(name);
      if (direct) return direct;
      const normalized = name.toLowerCase();
      for (const [key, dir] of cache.extensions) {
        if (key.toLowerCase() === normalized) {
          return dir;
        }
      }
      return null;
    };

    const skillDir = resolveDir(skillName);
    if (!skillDir) return null;

    const baseDir = path.join(SkillManager.getSkillsRootDir(), skillDir);
    const fullPath = path.join(baseDir, resourcePath);
    // Final safety check: ensure resolved path is still under baseDir
    const rel = path.relative(baseDir, fullPath).replaceAll("\\", "/");
    if (rel.startsWith("../") || rel === "..") {
      return null;
    }

    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return null;
      // Reuse SKILL size limit for now; most rule files/AGENTS.md are much smaller.
      if (stat.size > SkillManager.MAX_SKILL_BYTES) {
        console.warn(
          `[SkillManager] Skipping resource (exceeds ${SkillManager.MAX_SKILL_BYTES} bytes): ${fullPath} (${stat.size} bytes)`
        );
        return null;
      }
      console.info(
        `[SkillManager] Loaded resource [${skillName}] / [${resourcePath}] from ${fullPath}`
      );
      const raw = fs.readFileSync(fullPath, "utf-8");
      return raw.trim();
    } catch {
      return null;
    }
  }

  /** Clear in-memory cache (useful for tests or dev tooling). */
  public static clearCache(): void {
    SkillManager.cache = null;
    CommandManager.clearCache();
  }

  // ---------------------------------------------------------------------------
  // Catalog helpers (used by SkillProvider layer and Skills UI)
  // ---------------------------------------------------------------------------

  /** Extract a short summary from the first non-heading paragraph of a SKILL.md body. */
  private static extractSummary(body: string): string | undefined {
    const lines = body.split("\n");
    const paragraphLines: string[] = [];
    let inParagraph = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        // If we already collected lines, stop
        if (inParagraph && paragraphLines.length > 0) break;
        continue;
      }
      if (trimmed === "") {
        if (inParagraph && paragraphLines.length > 0) break;
        continue;
      }
      // Non-empty, non-heading line
      inParagraph = true;
      paragraphLines.push(trimmed);
    }

    if (paragraphLines.length === 0) return undefined;
    const full = paragraphLines.join(" ");
    return full.length > 200 ? full.slice(0, 197) + "..." : full;
  }

  /** Return true if the skill directory contains additional resource files (excluding SKILL.md). */
  private static skillDirHasResources(skillDirPath: string): boolean {
    try {
      const entries = fs.readdirSync(skillDirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === SkillManager.SKILL_FILENAME) continue;
        if (entry.name.startsWith(".")) continue;
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  /** Return catalog metadata for all bundled skills. */
  public static listSkillCatalog(): SkillCatalogItem[] {
    return SkillManager.getCache().catalog;
  }

  /**
   * Return raw SKILL.md content (including frontmatter) for a skill by its stable id.
   * Used by the detail endpoint — raw content is returned so the frontend toggle can
   * show both rendered and raw views.
   */
  public static getSkillRaw(id: string): string | null {
    const trimmed = id.trim();
    if (!SkillManager.isSafeRelativePath(trimmed)) return null;
    return SkillManager.getCache().rawContent.get(trimmed) ?? null;
  }

  /**
   * Return relative paths of all files in the skill directory, excluding SKILL.md itself.
   * Used by the detail endpoint to populate the directory tree in the right panel.
   */
  public static listSkillResources(id: string): string[] {
    const trimmed = id.trim();
    if (!SkillManager.isSafeRelativePath(trimmed)) return [];

    const cache = SkillManager.getCache();
    const skillDir = cache.extensions.get(trimmed);
    if (!skillDir) return [];

    const baseDir = path.join(SkillManager.getSkillsRootDir(), skillDir);
    const results: string[] = [];

    const walk = (dir: string, prefix: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), relPath);
        } else if (
          entry.isFile() &&
          !(prefix === "" && entry.name === SkillManager.SKILL_FILENAME)
        ) {
          results.push(relPath);
        }
      }
    };

    walk(baseDir, "");
    return results.sort();
  }
}

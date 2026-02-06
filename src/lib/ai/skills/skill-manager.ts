// Skill Manager: loads skills dynamically from disk (Node runtime).
// This enables multi-file skill packs and avoids manual static imports.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface SkillMetadata {
  name: string;
  description: string;
}

type SkillCache = {
  list: SkillMetadata[];
  /** 
   * Key: skill name (frontmatter `name` or folder name). 
   * Value: formatted markdown (e.g. "# Manual Loaded: <name>\n\n<body>"). 
   */
  content: Map<string, string>;
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

    for (const skillFile of skillFiles) {
      const raw = SkillManager.readSkillFile(skillFile);
      if (!raw) continue;

      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;

      const dirName = path.basename(path.dirname(skillFile));
      const metaName = typeof data.name === "string" ? data.name : dirName;
      const meta: SkillMetadata = {
        name: metaName,
        description: typeof data.description === "string" ? data.description : "",
      };

      const formatted = SkillManager.formatSkillOutput(metaName, raw);

      list.push(meta);
      content.set(metaName, formatted);
      if (dirName !== metaName) content.set(dirName, formatted); 

      console.info(
        `[SkillManager] Loaded skill [${meta.name}] at location ${skillFile}}`
      );
    }

    // This makes sure the list at the model side has a stable and predicatable order
    list.sort((a, b) => a.name.localeCompare(b.name));

    return { list, content };
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
    const formatted = c.content.get(trimmed);
    if (formatted) {
      return formatted;
    }
    const normalized = trimmed.toLowerCase();
    for (const [key, value] of c.content) {
      if (key.toLowerCase() === normalized) {
        return value;
      }
    }
    return null;
  }

  /** Clear in-memory cache (useful for tests or dev tooling). */
  public static clearCache(): void {
    SkillManager.cache = null;
  }
}

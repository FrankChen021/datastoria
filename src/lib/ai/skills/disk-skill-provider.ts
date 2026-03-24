import fs from "node:fs";
import path from "node:path";
import { CommandManager } from "@/lib/ai/commands/command-manager";
import matter from "gray-matter";
import type { SkillDetailResponse, SkillProvider } from "./skill-provider";
import type { SkillCatalogItem, SkillMetadata } from "./skill-types";

type SkillCache = {
  list: SkillMetadata[];
  system: Map<string, string>;
  extensions: Map<string, string>;
  catalog: SkillCatalogItem[];
  rawContent: Map<string, string>;
};

/**
 * DiskSkillProvider is the concrete filesystem-backed skill implementation.
 * It owns disk discovery, caching, resource loading, and slash-command registration.
 */
export class DiskSkillProvider implements SkillProvider {
  private static readonly SKILL_FILENAME = "SKILL.md";
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

  private static isSafeRelativePath(input: string): boolean {
    if (input.length === 0) return false;
    if (path.isAbsolute(input)) return false;
    const normalized = path.posix.normalize(input.replaceAll("\\", "/"));
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
        if (entry.name === DiskSkillProvider.SKILL_FILENAME) out.push(full);
      }
    }

    return out;
  }

  private static readSkillFile(skillPath: string): string | null {
    try {
      const stat = fs.statSync(skillPath);
      if (!stat.isFile()) return null;
      if (stat.size > DiskSkillProvider.MAX_SKILL_BYTES) {
        console.warn(
          `[DiskSkillProvider] Skipping skill file (exceeds ${DiskSkillProvider.MAX_SKILL_BYTES} bytes): ${skillPath} (${stat.size} bytes)`
        );
        return null;
      }
      return fs.readFileSync(skillPath, "utf-8");
    } catch {
      return null;
    }
  }

  private static extractSummary(body: string): string | undefined {
    const lines = body.split("\n");
    const paragraphLines: string[] = [];
    let inParagraph = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        if (inParagraph && paragraphLines.length > 0) break;
        continue;
      }
      if (trimmed === "") {
        if (inParagraph && paragraphLines.length > 0) break;
        continue;
      }
      inParagraph = true;
      paragraphLines.push(trimmed);
    }

    if (paragraphLines.length === 0) return undefined;
    const full = paragraphLines.join(" ");
    return full.length > 200 ? `${full.slice(0, 197)}...` : full;
  }

  private static skillDirHasResources(skillDirPath: string): boolean {
    try {
      const entries = fs.readdirSync(skillDirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === DiskSkillProvider.SKILL_FILENAME) continue;
        if (entry.name.startsWith(".")) continue;
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  private static buildCache(): SkillCache {
    const rootDir = DiskSkillProvider.getSkillsRootDir();
    const skillFiles = DiskSkillProvider.walkDirsForSkillFiles(rootDir);

    const list: SkillMetadata[] = [];
    const content = new Map<string, string>();
    const roots = new Map<string, string>();
    const catalog: SkillCatalogItem[] = [];
    const rawContent = new Map<string, string>();

    CommandManager.clearCache();

    for (const skillFile of skillFiles) {
      const raw = DiskSkillProvider.readSkillFile(skillFile);
      if (!raw) continue;

      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const dirName = path.basename(path.dirname(skillFile));
      const metaName = typeof data.name === "string" ? data.name : dirName;
      const disableSlashCommand = DiskSkillProvider.shouldDisableSlashCommand(data);
      const meta: SkillMetadata = {
        name: metaName,
        description: typeof data.description === "string" ? data.description : "",
      };

      const formatted = DiskSkillProvider.formatSkillOutput(metaName, raw);

      list.push(meta);
      content.set(metaName, formatted);
      const skillDir = path.relative(rootDir, path.dirname(skillFile)) || ".";
      roots.set(metaName, skillDir);
      if (dirName !== metaName) {
        content.set(dirName, formatted);
        roots.set(dirName, skillDir);
      }

      const metadataBlock = (data.metadata ?? {}) as Record<string, unknown>;
      const catalogItem: SkillCatalogItem = {
        id: dirName,
        name: metaName,
        description: typeof data.description === "string" ? data.description : "",
        source: "disk",
        status: "available",
        state: "committed",
        scope: "global",
        version: typeof metadataBlock.version === "string" ? metadataBlock.version : undefined,
        author:
          typeof metadataBlock.author === "string"
            ? metadataBlock.author
            : typeof metadataBlock.provider === "string"
              ? metadataBlock.provider
              : undefined,
        summary: DiskSkillProvider.extractSummary(parsed.content),
        hasResources: DiskSkillProvider.skillDirHasResources(path.dirname(skillFile)),
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

      console.info(`[DiskSkillProvider] Loaded skill [${meta.name}] at location ${skillFile}`);
    }

    list.sort((a, b) => a.name.localeCompare(b.name));
    catalog.sort((a, b) => a.name.localeCompare(b.name));

    return { list, system: content, extensions: roots, catalog, rawContent };
  }

  private static getCache(): SkillCache {
    DiskSkillProvider.cache ??= DiskSkillProvider.buildCache();
    return DiskSkillProvider.cache;
  }

  public static clearCache(): void {
    DiskSkillProvider.cache = null;
    CommandManager.clearCache();
  }

  public static listSkillCatalog(): SkillCatalogItem[] {
    return DiskSkillProvider.getCache().catalog;
  }

  public static listSkills(): SkillMetadata[] {
    return DiskSkillProvider.getCache().list;
  }

  public static getSkillRaw(id: string): string | null {
    const trimmed = id.trim();
    if (!DiskSkillProvider.isSafeRelativePath(trimmed)) return null;
    return DiskSkillProvider.getCache().rawContent.get(trimmed) ?? null;
  }

  public static getSkill(name: string): string | null {
    const trimmed = name.trim();
    if (!DiskSkillProvider.isSafeRelativePath(trimmed)) {
      return null;
    }

    const cache = DiskSkillProvider.getCache();
    const formatted = cache.system.get(trimmed);
    if (formatted) {
      return formatted;
    }
    const normalized = trimmed.toLowerCase();
    for (const [key, value] of cache.system) {
      if (key.toLowerCase() === normalized) {
        return value;
      }
    }
    return null;
  }

  public static getSkillResource(skillName: string, resourcePath: string): string | null {
    const trimmedSkillName = skillName.trim();
    const trimmedResourcePath = resourcePath.trim();
    if (
      !DiskSkillProvider.isSafeRelativePath(trimmedSkillName) ||
      !DiskSkillProvider.isSafeRelativePath(trimmedResourcePath)
    ) {
      return null;
    }

    const cache = DiskSkillProvider.getCache();
    const resolveDir = (name: string): string | null => {
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

    const skillDir = resolveDir(trimmedSkillName);
    if (!skillDir) return null;

    const baseDir = path.join(DiskSkillProvider.getSkillsRootDir(), skillDir);
    const fullPath = path.join(baseDir, trimmedResourcePath);
    const rel = path.relative(baseDir, fullPath).replaceAll("\\", "/");
    if (rel.startsWith("../") || rel === "..") {
      return null;
    }

    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return null;
      if (stat.size > DiskSkillProvider.MAX_SKILL_BYTES) {
        console.warn(
          `[DiskSkillProvider] Skipping resource (exceeds ${DiskSkillProvider.MAX_SKILL_BYTES} bytes): ${fullPath} (${stat.size} bytes)`
        );
        return null;
      }
      console.info(
        `[DiskSkillProvider] Loaded resource [${trimmedSkillName}] / [${trimmedResourcePath}] from ${fullPath}`
      );
      return fs.readFileSync(fullPath, "utf-8").trim();
    } catch {
      return null;
    }
  }

  public static listSkillResources(id: string): string[] {
    const trimmed = id.trim();
    if (!DiskSkillProvider.isSafeRelativePath(trimmed)) return [];

    const cache = DiskSkillProvider.getCache();
    const skillDir = cache.extensions.get(trimmed);
    if (!skillDir) return [];

    const baseDir = path.join(DiskSkillProvider.getSkillsRootDir(), skillDir);
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
          !(prefix === "" && entry.name === DiskSkillProvider.SKILL_FILENAME)
        ) {
          results.push(relPath);
        }
      }
    };

    walk(baseDir, "");
    return results.sort();
  }

  async hasSkill(id: string): Promise<boolean> {
    return DiskSkillProvider.listSkillCatalog().some((skill) => skill.id === id);
  }

  async listSkills(filter?: (skill: SkillCatalogItem) => boolean): Promise<SkillCatalogItem[]> {
    const catalog = DiskSkillProvider.listSkillCatalog();
    return filter ? catalog.filter(filter) : catalog;
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    const catalog = DiskSkillProvider.listSkillCatalog();
    const item = catalog.find((skill) => skill.id === id);
    if (!item) return null;

    const content = DiskSkillProvider.getSkillRaw(id);
    if (content === null) return null;

    return {
      ...item,
      content,
      resourcePaths: DiskSkillProvider.listSkillResources(id),
    };
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    return DiskSkillProvider.getSkillResource(id, resourcePath);
  }
}

import fs from "node:fs";
import path from "node:path";
import { CommandManager } from "@/lib/ai/commands/command-manager";
import matter from "gray-matter";
import type { SkillDetailResponse, SkillProvider, SkillResourceResponse } from "./skill-provider";
import type { SkillCatalogItem, SkillMetadata } from "./skill-types";

type SkillCache = {
  list: SkillMetadata[];
  system: Map<string, string>;
  extensions: Map<string, string>;
  catalog: Map<string, SkillCatalogItem>;
  catalogList: SkillCatalogItem[];
  rawContent: Map<string, string>;
  resourcePaths: Map<string, string[]>;
  resources: Map<string, Map<string, string>>;
};

const SKILL_FILENAME = "SKILL.md";
const MAX_SKILL_BYTES = 512 * 1024;
let cache: SkillCache | null = null;

export function clearDiskSkillProviderCache(): void {
  cache = null;
  CommandManager.clearCache();
}

/**
 * DiskSkillProvider is the concrete filesystem-backed skill implementation.
 * It owns disk discovery, caching, resource loading, and slash-command registration.
 */
export class DiskSkillProvider implements SkillProvider {
  private getSkillsRootDir(): string {
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

  private isSafeRelativePath(input: string): boolean {
    if (input.length === 0) return false;
    if (path.isAbsolute(input)) return false;
    const normalized = path.posix.normalize(input.replaceAll("\\", "/"));
    return !normalized.startsWith("../") && normalized !== "..";
  }

  private walkDirsForSkillFiles(rootDir: string): string[] {
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
        if (entry.name === SKILL_FILENAME) out.push(full);
      }
    }

    return out;
  }

  private readSkillFile(skillPath: string): string | null {
    try {
      const stat = fs.statSync(skillPath);
      if (!stat.isFile()) return null;
      if (stat.size > MAX_SKILL_BYTES) {
        console.warn(
          `[DiskSkillProvider] Skipping skill file (exceeds ${MAX_SKILL_BYTES} bytes): ${skillPath} (${stat.size} bytes)`
        );
        return null;
      }
      return fs.readFileSync(skillPath, "utf-8");
    } catch {
      return null;
    }
  }

  private extractSummary(body: string): string | undefined {
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

  private readSkillResources(skillDirPath: string): {
    paths: string[];
    contents: Map<string, string>;
  } {
    const paths: string[] = [];
    const contents = new Map<string, string>();

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
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath, relPath);
          continue;
        }

        if (!entry.isFile() || relPath === SKILL_FILENAME) continue;

        const content = this.readSkillFile(fullPath);
        if (content === null) continue;

        paths.push(relPath);
        contents.set(relPath, content.trim());
      }
    };

    walk(skillDirPath, "");

    return {
      paths: paths.sort(),
      contents,
    };
  }

  private buildCache(): SkillCache {
    const rootDir = this.getSkillsRootDir();
    const skillFiles = this.walkDirsForSkillFiles(rootDir);

    const list: SkillMetadata[] = [];
    const content = new Map<string, string>();
    const roots = new Map<string, string>();
    const catalog = new Map<string, SkillCatalogItem>();
    const rawContent = new Map<string, string>();
    const resourcePaths = new Map<string, string[]>();
    const resources = new Map<string, Map<string, string>>();

    CommandManager.clearCache();

    for (const skillFile of skillFiles) {
      const raw = this.readSkillFile(skillFile);
      if (!raw) continue;

      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;
      const metadataBlock = (data.metadata ?? {}) as Record<string, unknown>;
      const dirName = path.basename(path.dirname(skillFile));
      const metaName = typeof data.name === "string" ? data.name : dirName;
      const disableSlashCommand =
        data["disable-slash-command"] === true || metadataBlock["disable-slash-command"] === true;
      const meta: SkillMetadata = {
        name: metaName,
        description: typeof data.description === "string" ? data.description : "",
      };
      const skillResources = this.readSkillResources(path.dirname(skillFile));
      const formatted = `# Manual Loaded: ${metaName}\n\n${parsed.content.trim()}`;

      list.push(meta);
      content.set(metaName, formatted);
      const skillDir = path.relative(rootDir, path.dirname(skillFile)) || ".";
      roots.set(metaName, skillDir);
      if (dirName !== metaName) {
        content.set(dirName, formatted);
        roots.set(dirName, skillDir);
      }

      const catalogItem: SkillCatalogItem = {
        id: dirName,
        name: metaName,
        description: typeof data.description === "string" ? data.description : "",
        source: "disk",
        status: "available",
        state: "published",
        scope: "global",
        version: typeof metadataBlock.version === "string" ? metadataBlock.version : undefined,
        author:
          typeof metadataBlock.author === "string"
            ? metadataBlock.author
            : typeof metadataBlock.provider === "string"
              ? metadataBlock.provider
              : undefined,
        summary: this.extractSummary(parsed.content),
        hasResources: skillResources.paths.length > 0,
        disableSlashCommand,
      };
      catalog.set(catalogItem.id, catalogItem);
      rawContent.set(dirName, raw);
      resourcePaths.set(dirName, skillResources.paths);
      resources.set(dirName, skillResources.contents);

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
    const catalogList = [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name));

    return {
      list,
      system: content,
      extensions: roots,
      catalog,
      catalogList,
      rawContent,
      resourcePaths,
      resources,
    };
  }

  private getCache(): SkillCache {
    cache ??= this.buildCache();
    return cache;
  }

  private listSkillCatalog(): Map<string, SkillCatalogItem> {
    return this.getCache().catalog;
  }

  private listSkillResources(id: string): string[] {
    const trimmed = id.trim();
    if (!this.isSafeRelativePath(trimmed)) return [];
    return this.getCache().resourcePaths.get(trimmed) ?? [];
  }

  async hasSkill(id: string): Promise<boolean> {
    return this.listSkillCatalog().has(id);
  }

  async listSkills(filter?: (skill: SkillCatalogItem) => boolean): Promise<SkillCatalogItem[]> {
    const catalog = this.getCache().catalogList;
    return filter ? catalog.filter(filter) : catalog;
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    const item = this.listSkillCatalog().get(id);
    if (!item) return null;

    const trimmed = id.trim();
    if (!this.isSafeRelativePath(trimmed)) return null;

    const content = this.getCache().rawContent.get(trimmed) ?? null;
    if (content === null) return null;

    return {
      ...item,
      content,
      resourcePaths: this.listSkillResources(id),
    };
  }

  async getSkillResourcePaths(id: string): Promise<string[]> {
    return this.listSkillResources(id);
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    const trimmedSkillName = id.trim();
    const trimmedResourcePath = resourcePath.trim();
    if (
      !this.isSafeRelativePath(trimmedSkillName) ||
      !this.isSafeRelativePath(trimmedResourcePath)
    ) {
      return null;
    }

    const skillCache = this.getCache();
    let skillDir = skillCache.extensions.get(trimmedSkillName) ?? null;
    if (!skillDir) {
      const normalized = trimmedSkillName.toLowerCase();
      for (const [key, dir] of skillCache.extensions) {
        if (key.toLowerCase() === normalized) {
          skillDir = dir;
          break;
        }
      }
    }
    if (!skillDir) return null;

    const resourceCache = skillCache.resources.get(path.basename(skillDir));
    if (!resourceCache) return null;

    return resourceCache.get(trimmedResourcePath) ?? null;
  }

  async getSkillResourceDetail(
    id: string,
    resourcePath: string
  ): Promise<SkillResourceResponse | null> {
    const content = await this.getSkillResource(id, resourcePath);
    if (content === null) {
      return null;
    }

    return {
      content,
      source: "disk",
      state: "published",
      scope: "global",
    };
  }
}

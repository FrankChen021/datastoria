/**
 * Storage-agnostic provider abstraction for the Skills catalog.
 */
import type { SkillCatalogItem } from "./skill-types";

export type { SkillCatalogItem };

export interface SkillDetailResponse extends SkillCatalogItem {
  /**
   * Full SKILL.md content (raw markdown, including frontmatter).
   * The frontend toggle decides whether to render it or show raw.
   */
  content: string;
  /**
   * Flat list of relative paths for all sub-resource files in the skill directory
   * (excluding SKILL.md itself). e.g. ["AGENTS.md", "rules/insert-batch-size.md"]
   * The frontend builds the directory tree from these path segments.
   */
  resourcePaths: string[];
}

export interface SkillResourceResponse {
  content: string;
  source: SkillCatalogItem["source"];
  state?: SkillCatalogItem["state"];
  scope?: SkillCatalogItem["scope"];
  author?: SkillCatalogItem["author"];
  version?: SkillCatalogItem["version"];
}

export interface SkillProvider {
  /** Return true when this provider owns the given skill id. */
  hasSkill(id: string): Promise<boolean>;

  /** Return catalog metadata for all skills from this source. */
  listSkills(filter?: (skill: SkillCatalogItem) => boolean): Promise<SkillCatalogItem[]>;

  /** Return full detail for a single skill by id, or null if not found. */
  getSkillDetail(id: string): Promise<SkillDetailResponse | null>;

  /** Return resource paths known by this provider for the given skill id. */
  getSkillResourcePaths(id: string): Promise<string[]>;

  /** Return raw content of a sub-resource file, or null if not found. */
  getSkillResource(id: string, resourcePath: string): Promise<string | null>;

  /** Return raw content plus metadata for a sub-resource file, or null if not found. */
  getSkillResourceDetail(id: string, resourcePath: string): Promise<SkillResourceResponse | null>;
}

/**
 * Merges results from all registered SkillProviders.
 * This is what API routes instantiate — a single entry point regardless of storage backend.
 */
export class CompositeSkillProvider implements SkillProvider {
  constructor(private readonly providers: SkillProvider[]) {}

  async hasSkill(id: string): Promise<boolean> {
    for (let index = this.providers.length - 1; index >= 0; index--) {
      if (await this.providers[index].hasSkill(id)) {
        return true;
      }
    }
    return false;
  }

  async listSkills(filter?: (skill: SkillCatalogItem) => boolean): Promise<SkillCatalogItem[]> {
    const results = await Promise.all(this.providers.map((p) => p.listSkills(filter)));
    const merged = new Map<string, SkillCatalogItem>();
    for (const providerItems of results) {
      for (const item of providerItems) {
        merged.set(item.id, item);
      }
    }
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    let resolved: SkillDetailResponse | null = null;
    const resourcePaths = new Set<string>();

    for (let index = 0; index < this.providers.length; index++) {
      const provider = this.providers[index];
      const providerResourcePaths = await provider.getSkillResourcePaths(id);
      providerResourcePaths.forEach((path) => resourcePaths.add(path));

      if (!(await provider.hasSkill(id))) {
        continue;
      }

      const detail = await provider.getSkillDetail(id);
      if (!detail) {
        continue;
      }

      detail.resourcePaths.forEach((path) => resourcePaths.add(path));
      resolved = detail;
    }

    if (!resolved) {
      return null;
    }

    const mergedResourcePaths = [...resourcePaths].sort();
    return {
      ...resolved,
      hasResources: mergedResourcePaths.length > 0,
      resourcePaths: mergedResourcePaths,
    };
  }

  async getSkillResourcePaths(id: string): Promise<string[]> {
    const resourcePaths = new Set<string>();

    for (const provider of this.providers) {
      const providerResourcePaths = await provider.getSkillResourcePaths(id);
      providerResourcePaths.forEach((path) => resourcePaths.add(path));
    }

    return [...resourcePaths].sort();
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    const detail = await this.getSkillResourceDetail(id, resourcePath);
    return detail?.content ?? null;
  }

  async getSkillResourceDetail(
    id: string,
    resourcePath: string
  ): Promise<SkillResourceResponse | null> {
    for (let index = this.providers.length - 1; index >= 0; index--) {
      const provider = this.providers[index];
      const detail = await provider.getSkillResourceDetail(id, resourcePath);
      if (detail) {
        return detail;
      }
    }
    return null;
  }
}

export function findSkillByLookup(
  skills: SkillCatalogItem[],
  lookup: string
): SkillCatalogItem | null {
  const trimmed = lookup.trim();
  if (!trimmed) return null;

  const direct = skills.find((skill) => skill.id === trimmed || skill.name === trimmed);
  if (direct) return direct;

  const normalized = trimmed.toLowerCase();
  return (
    skills.find(
      (skill) => skill.id.toLowerCase() === normalized || skill.name.toLowerCase() === normalized
    ) ?? null
  );
}

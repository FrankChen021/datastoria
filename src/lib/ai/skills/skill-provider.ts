/**
 * Storage-agnostic provider abstraction for the Skills catalog.
 *
 * Phase 1: only DiskSkillProvider (built-in skills from disk).
 * Phase 2: add DatabaseSkillProvider (user-provided skills) alongside DiskSkillProvider.
 *
 * API routes call CompositeSkillProvider — they never call SkillManager directly.
 */
import type { SkillCatalogItem } from "./skill-manager";

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

export interface SkillProvider {
  /** Return catalog metadata for all skills from this source. */
  listSkills(filter?: (skill: SkillCatalogItem) => boolean): Promise<SkillCatalogItem[]>;

  /** Return full detail for a single skill by id, or null if not found. */
  getSkillDetail(id: string): Promise<SkillDetailResponse | null>;

  /** Return raw content of a sub-resource file, or null if not found. */
  getSkillResource(id: string, resourcePath: string): Promise<string | null>;
}

/**
 * Merges results from all registered SkillProviders.
 * This is what API routes instantiate — a single entry point regardless of storage backend.
 */
export class CompositeSkillProvider implements SkillProvider {
  constructor(private readonly providers: SkillProvider[]) {}

  async listSkills(filter?: (skill: SkillCatalogItem) => boolean): Promise<SkillCatalogItem[]> {
    const results = await Promise.all(this.providers.map((p) => p.listSkills(filter)));
    return results.flat().sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    for (const provider of this.providers) {
      const result = await provider.getSkillDetail(id);
      if (result) return result;
    }
    return null;
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    for (const provider of this.providers) {
      const result = await provider.getSkillResource(id, resourcePath);
      if (result !== null) return result;
    }
    return null;
  }
}

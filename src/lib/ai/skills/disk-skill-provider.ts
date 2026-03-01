/**
 * DiskSkillProvider: wraps SkillManager to serve built-in skills from the filesystem.
 *
 * Phase 1 implementation. Sets source = "built-in" for all returned items.
 */
import { SkillManager, type SkillCatalogItem } from "./skill-manager";
import type { SkillDetailResponse, SkillProvider } from "./skill-provider";

export class DiskSkillProvider implements SkillProvider {
  async listSkills(filter?: (skill: SkillCatalogItem) => boolean): Promise<SkillCatalogItem[]> {
    const catalog = SkillManager.listSkillCatalog();
    return filter ? catalog.filter(filter) : catalog;
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    const catalog = SkillManager.listSkillCatalog();
    const item = catalog.find((s) => s.id === id);
    if (!item) return null;

    const content = SkillManager.getSkillRaw(id);
    if (content === null) return null;

    const resourcePaths = SkillManager.listSkillResources(id);

    return {
      ...item,
      content,
      resourcePaths,
    };
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    // Reuse the existing SkillManager.getSkillResource but look up by id.
    // SkillManager supports lookup by both dirName (id) and frontmatter name.
    return SkillManager.getSkillResource(id, resourcePath);
  }
}

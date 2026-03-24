import { DiskSkillProvider } from "./disk-skill-provider";
import type {
  SkillCatalogItem,
  SkillMetadata,
  SkillScope,
  SkillSource,
  SkillState,
  SkillStatus,
} from "./skill-types";

export type { SkillCatalogItem, SkillMetadata, SkillScope, SkillSource, SkillState, SkillStatus };

/**
 * Compatibility shim for older imports.
 * Disk-specific implementation now lives in DiskSkillProvider.
 */
export class SkillManager {
  public static clearCache(): void {
    DiskSkillProvider.clearCache();
  }

  public static listSkills(): SkillMetadata[] {
    return DiskSkillProvider.listSkills();
  }

  public static listSkillCatalog(): SkillCatalogItem[] {
    return DiskSkillProvider.listSkillCatalog();
  }

  public static getSkill(name: string): string | null {
    return DiskSkillProvider.getSkill(name);
  }

  public static getSkillRaw(id: string): string | null {
    return DiskSkillProvider.getSkillRaw(id);
  }

  public static getSkillResource(skillName: string, resourcePath: string): string | null {
    return DiskSkillProvider.getSkillResource(skillName, resourcePath);
  }

  public static listSkillResources(id: string): string[] {
    return DiskSkillProvider.listSkillResources(id);
  }
}

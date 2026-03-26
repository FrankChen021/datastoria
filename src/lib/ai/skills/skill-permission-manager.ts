import { getServerSessionRepositoryConfig } from "@/lib/ai/session/server-session-repository-factory";

export class SkillPermissionManager {
  private static normalizeUserId(userId: string | null | undefined): string | null {
    const normalized = userId?.trim().toLowerCase();
    return normalized && normalized.length > 0 ? normalized : null;
  }

  private static getSkillEditorWhitelist(): string[] {
    return (process.env.SKILL_EDITOR_WHITELIST ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  static isSkillEditingConfigured(): boolean {
    return getServerSessionRepositoryConfig() !== null;
  }

  static isSkillEditingEnabled(userId: string | null | undefined): boolean {
    if (!this.isSkillEditingConfigured()) {
      return false;
    }

    const normalizedUserId = this.normalizeUserId(userId);
    if (!normalizedUserId) {
      return false;
    }

    const whitelist = this.getSkillEditorWhitelist();
    if (whitelist.length === 0) {
      return true;
    }

    return whitelist.includes(normalizedUserId);
  }

  static canUserEditSkill(userId: string | null | undefined): boolean {
    return this.isSkillEditingEnabled(userId);
  }
}

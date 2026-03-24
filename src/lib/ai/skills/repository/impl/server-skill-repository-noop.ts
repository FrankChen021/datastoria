import type {
  PersistedSkillRecord,
  ServerSkillRepository,
  SkillRepositoryVisibility,
  UpsertSkillRecordInput,
} from "../server-skill-repository";

export class ServerSkillRepositoryNoop implements ServerSkillRepository {
  async listSkills(_visibility: SkillRepositoryVisibility): Promise<PersistedSkillRecord[]> {
    return [];
  }

  async getSkill(
    _id: string,
    _visibility: SkillRepositoryVisibility
  ): Promise<PersistedSkillRecord | null> {
    return null;
  }

  async listSkillResource(
    _skillId: string,
    _visibility: SkillRepositoryVisibility
  ): Promise<PersistedSkillRecord[]> {
    return [];
  }

  async getSkillResource(
    _skillId: string,
    _resourcePath: string,
    _visibility: SkillRepositoryVisibility
  ): Promise<PersistedSkillRecord | null> {
    return null;
  }

  async upsertSkill(_input: UpsertSkillRecordInput): Promise<void> {}
}

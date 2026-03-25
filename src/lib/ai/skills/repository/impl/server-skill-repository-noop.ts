import type {
  PersistedSkillRecord,
  PublishSkillResourcesInput,
  ServerSkillRepository,
  SkillRepositoryVisibility,
  UpsertSkillBundleInput,
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

  async upsertSkillBundle(_ownerId: string, _input: UpsertSkillBundleInput): Promise<void> {}

  async saveAndPublishSkillBundle(
    _ownerId: string,
    _input: UpsertSkillBundleInput
  ): Promise<void> {}

  async publishSkillResources(
    _ownerId: string,
    _input: PublishSkillResourcesInput
  ): Promise<void> {}

  async upsertSkill(_input: UpsertSkillRecordInput): Promise<void> {}

  async deleteSkill(_skillId: string, _ownerId: string): Promise<void> {}

  async publishSkill(_skillId: string, _ownerId: string): Promise<void> {}
}

import type { SkillScope, SkillSource, SkillState } from "../skill-types";

export type PersistedSkillRecordType = "skill" | "resource";

export interface PersistedSkillRecord {
  id: string;
  type: PersistedSkillRecordType;
  skill_id: string | null;
  meta_text: string | null;
  content: string;
  state: SkillState;
  scope: SkillScope;
  version: string | null;
  owner_id: string | null;
  source: SkillSource;
  created_at: Date;
  updated_at: Date;
}

export interface SkillRepositoryVisibility {
  userId: string | null;
  states?: SkillState[];
}

export interface UpsertSkillRecordInput {
  id: string;
  type: PersistedSkillRecordType;
  skill_id?: string | null;
  meta_text?: string | null;
  content: string;
  state: SkillState;
  scope: SkillScope;
  version?: string | null;
  owner_id?: string | null;
  source: Extract<SkillSource, "database">;
}

export interface ServerSkillRepository {
  listSkills(visibility: SkillRepositoryVisibility): Promise<PersistedSkillRecord[]>;
  getSkill(id: string, visibility: SkillRepositoryVisibility): Promise<PersistedSkillRecord | null>;
  listSkillResource(
    skillId: string,
    visibility: SkillRepositoryVisibility
  ): Promise<PersistedSkillRecord[]>;
  getSkillResource(
    skillId: string,
    resourcePath: string,
    visibility: SkillRepositoryVisibility
  ): Promise<PersistedSkillRecord | null>;
  upsertSkill(input: UpsertSkillRecordInput): Promise<void>;
}

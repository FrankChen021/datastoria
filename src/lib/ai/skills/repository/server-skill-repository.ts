import type { SkillScope, SkillState } from "../skill-types";

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
}

export interface SkillBundleResourceInput {
  path: string;
  content: string;
}

export interface UpsertSkillBundleInput {
  id: string;
  content: string;
  scope?: SkillScope;
  version?: string | null;
  resources?: SkillBundleResourceInput[];
  deletedResourcePaths?: string[];
  state?: SkillState;
}

export interface PublishSkillResourcesInput {
  id: string;
  scope?: SkillScope;
  version?: string | null;
  resources?: SkillBundleResourceInput[];
  deletedResourcePaths?: string[];
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
  upsertSkillBundle(ownerId: string, input: UpsertSkillBundleInput): Promise<void>;
  saveAndPublishSkillBundle(ownerId: string, input: UpsertSkillBundleInput): Promise<void>;
  publishSkillResources(ownerId: string, input: PublishSkillResourcesInput): Promise<void>;
  upsertSkill(input: UpsertSkillRecordInput): Promise<void>;
  deleteSkill(skillId: string, ownerId: string): Promise<void>;
  publishSkill(skillId: string, ownerId: string): Promise<void>;
}

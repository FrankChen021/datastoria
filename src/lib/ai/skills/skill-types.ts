export interface SkillMetadata {
  name: string;
  description: string;
  requiredTools?: string[];
}

export type SkillSource = "disk" | "database";
export type SkillStatus = "available" | "disabled" | "invalid";
export type SkillState = "draft" | "published";
export type SkillScope = "global" | "self";

export interface SkillCatalogItem {
  /** Stable identifier derived from the leaf folder name. */
  id: string;
  /** Human-readable name from frontmatter `name` field. */
  name: string;
  /** One-line description from frontmatter `description` field. */
  description: string;
  /** Where the effective skill was loaded from. */
  source: SkillSource;
  /** Runtime status. Always "available" in phase 1. */
  status: SkillStatus;
  /** Persistence state of the effective skill payload. */
  state?: SkillState;
  /** Visibility scope of the effective skill payload. */
  scope?: SkillScope;
  /** Optional version string from metadata frontmatter. */
  version?: string;
  /** Optional display author. For DB skills this is derived from owner_id. */
  author?: string;
  /** Optional external reference URL from skill frontmatter metadata.url. */
  url?: string;
  /** Short summary paragraph extracted from the SKILL.md body. */
  summary?: string;
  /** Whether this skill has sub-resources (rules/*.md, AGENTS.md, etc.). */
  hasResources?: boolean;
  /** Whether this skill is excluded from slash command registration. */
  disableSlashCommand?: boolean;
  /** Whether this skill should be shown as a SQL editor quick action. */
  showInSqlEditorQuickAction?: boolean;
  /** Tool names required for this skill to be usable at runtime. */
  requiredTools?: string[];
}

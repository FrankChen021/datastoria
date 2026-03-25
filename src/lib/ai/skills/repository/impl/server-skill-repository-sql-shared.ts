import matter from "gray-matter";
import type { Knex } from "knex";
import type {
  PersistedSkillRecord,
  PublishSkillResourcesInput,
  ServerSkillRepository,
  SkillBundleResourceInput,
  SkillRepositoryVisibility,
  UpsertSkillBundleInput,
  UpsertSkillRecordInput,
} from "../server-skill-repository";

type SqlRepositoryOptions = {
  getDb: () => Knex;
  nowExpression: string;
  ensureReady?: () => Promise<void>;
};

type PersistedSkillRecordRow = Omit<PersistedSkillRecord, "created_at" | "updated_at"> & {
  created_at: Date | string;
  updated_at: Date | string;
};

export abstract class AbstractServerSkillRepository implements ServerSkillRepository {
  constructor(private readonly options: SqlRepositoryOptions) {}

  private db(): Knex {
    return this.options.getDb();
  }

  private nowRaw(executor: Knex | Knex.Transaction): Knex.Raw {
    return executor.raw(this.options.nowExpression);
  }

  private async ensureReady(): Promise<void> {
    if (this.options.ensureReady) {
      await this.options.ensureReady();
    }
  }

  private applyVisibility(
    query: Knex.QueryBuilder,
    visibility: SkillRepositoryVisibility
  ): Knex.QueryBuilder {
    const states =
      visibility.states && visibility.states.length > 0 ? visibility.states : ["published"];
    query.whereIn("state", states);
    query.andWhere((builder) => {
      builder.where("scope", "global");
      if (visibility.userId) {
        builder.orWhere((inner) => {
          inner.where("scope", "self").andWhere("owner_id", visibility.userId);
        });
      }
    });
    return query;
  }

  protected toPersistedSkillRecord(row: PersistedSkillRecordRow): PersistedSkillRecord {
    return {
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private isSafeRelativePath(input: string): boolean {
    if (!input || input.length === 0) return false;
    if (input.startsWith("/") || input.startsWith("\\")) return false;
    const normalized = input.replaceAll("\\", "/");
    return !normalized.includes("../") && normalized !== "..";
  }

  private buildSkillMetaText(content: string): string {
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;
    const metadataBlock = (data.metadata ?? {}) as Record<string, unknown>;

    return JSON.stringify({
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      disableSlashCommand:
        data["disable-slash-command"] === true || metadataBlock["disable-slash-command"] === true,
      metadata: {
        author:
          typeof metadataBlock.author === "string"
            ? metadataBlock.author
            : typeof metadataBlock.provider === "string"
              ? metadataBlock.provider
              : undefined,
        disableSlashCommand: metadataBlock["disable-slash-command"] === true,
      },
    });
  }

  private buildResourceId(skillId: string, resourcePath: string): string {
    return `${skillId}:${resourcePath}`;
  }

  private normalizeResourcePath(resource: SkillBundleResourceInput): string {
    const resourcePath = resource.path.trim();
    if (!this.isSafeRelativePath(resourcePath)) {
      throw new Error(`Invalid resource path: ${resource.path}`);
    }
    return resourcePath;
  }

  async listSkills(visibility: SkillRepositoryVisibility): Promise<PersistedSkillRecord[]> {
    await this.ensureReady();
    const query = this.db()("ai_skills")
      .select({
        id: "id",
        type: "type",
        skill_id: "skill_id",
        meta_text: "meta",
        content: "content",
        state: "state",
        scope: "scope",
        version: "version",
        owner_id: "owner_id",
        created_at: "created_at",
        updated_at: "updated_at",
      })
      .where({ type: "skill" });
    this.applyVisibility(query, visibility);
    const rows = (await query.orderBy("updated_at", "desc")) as PersistedSkillRecordRow[];
    return rows.map((row) => this.toPersistedSkillRecord(row));
  }

  async getSkill(
    id: string,
    visibility: SkillRepositoryVisibility
  ): Promise<PersistedSkillRecord | null> {
    await this.ensureReady();
    const query = this.db()("ai_skills")
      .select({
        id: "id",
        type: "type",
        skill_id: "skill_id",
        meta_text: "meta",
        content: "content",
        state: "state",
        scope: "scope",
        version: "version",
        owner_id: "owner_id",
        created_at: "created_at",
        updated_at: "updated_at",
      })
      .where({
        id,
        type: "skill",
      })
      .first();
    this.applyVisibility(query, visibility);
    const row = (await query) as PersistedSkillRecordRow | undefined;
    return row ? this.toPersistedSkillRecord(row) : null;
  }

  async listSkillResource(
    skillId: string,
    visibility: SkillRepositoryVisibility
  ): Promise<PersistedSkillRecord[]> {
    await this.ensureReady();
    const query = this.db()("ai_skills")
      .select({
        id: "id",
        type: "type",
        skill_id: "skill_id",
        meta_text: "meta",
        content: "content",
        state: "state",
        scope: "scope",
        version: "version",
        owner_id: "owner_id",
        created_at: "created_at",
        updated_at: "updated_at",
      })
      .where({
        type: "resource",
        skill_id: skillId,
      });
    this.applyVisibility(query, visibility);
    const rows = (await query.orderBy("id", "asc")) as PersistedSkillRecordRow[];
    return rows.map((row) => this.toPersistedSkillRecord(row));
  }

  async getSkillResource(
    skillId: string,
    resourcePath: string,
    visibility: SkillRepositoryVisibility
  ): Promise<PersistedSkillRecord | null> {
    const rows = await this.listSkillResource(skillId, visibility);
    return (
      rows.find((row) => {
        if (!row.meta_text) {
          return false;
        }
        try {
          const meta = JSON.parse(row.meta_text) as { path?: unknown };
          return meta.path === resourcePath;
        } catch {
          return false;
        }
      }) ?? null
    );
  }

  async upsertSkillBundle(ownerId: string, input: UpsertSkillBundleInput): Promise<void> {
    const scope = input.scope ?? "self";
    const state = input.state ?? "published";
    const version = input.version ?? null;

    await this.upsertSkill({
      id: input.id,
      type: "skill",
      content: input.content,
      meta_text: this.buildSkillMetaText(input.content),
      state,
      scope,
      version,
      owner_id: ownerId,
    });

    for (const resource of input.resources ?? []) {
      const resourcePath = this.normalizeResourcePath(resource);
      await this.upsertSkill({
        id: this.buildResourceId(input.id, resourcePath),
        type: "resource",
        skill_id: input.id,
        content: resource.content,
        meta_text: JSON.stringify({ path: resourcePath }),
        state,
        scope,
        version,
        owner_id: ownerId,
      });
    }

    const deletedResourceIds = (input.deletedResourcePaths ?? []).map((resourcePath) =>
      this.buildResourceId(
        input.id,
        this.normalizeResourcePath({ path: resourcePath, content: "" })
      )
    );
    if (deletedResourceIds.length > 0) {
      await this.db()("ai_skills")
        .whereIn("id", deletedResourceIds)
        .andWhere({
          type: "resource",
          skill_id: input.id,
          owner_id: ownerId,
        })
        .del();
    }
  }

  async saveAndPublishSkillBundle(ownerId: string, input: UpsertSkillBundleInput): Promise<void> {
    await this.upsertSkillBundle(ownerId, {
      ...input,
      state: "published",
    });
  }

  async publishSkillResources(ownerId: string, input: PublishSkillResourcesInput): Promise<void> {
    const scope = input.scope ?? "self";
    const version = input.version ?? null;

    for (const resource of input.resources ?? []) {
      const resourcePath = this.normalizeResourcePath(resource);
      await this.upsertSkill({
        id: this.buildResourceId(input.id, resourcePath),
        type: "resource",
        skill_id: input.id,
        content: resource.content,
        meta_text: JSON.stringify({ path: resourcePath }),
        state: "published",
        scope,
        version,
        owner_id: ownerId,
      });
    }

    const deletedResourceIds = (input.deletedResourcePaths ?? []).map((resourcePath) =>
      this.buildResourceId(
        input.id,
        this.normalizeResourcePath({ path: resourcePath, content: "" })
      )
    );
    if (deletedResourceIds.length > 0) {
      await this.db()("ai_skills")
        .whereIn("id", deletedResourceIds)
        .andWhere({
          type: "resource",
          skill_id: input.id,
          owner_id: ownerId,
        })
        .del();
    }
  }

  async deleteSkill(skillId: string, ownerId: string): Promise<void> {
    await this.ensureReady();
    await this.db()("ai_skills")
      .where((builder) => {
        builder.where({ id: skillId }).orWhere({ skill_id: skillId });
      })
      .andWhere({ owner_id: ownerId })
      .del();
  }

  async publishSkill(skillId: string, ownerId: string): Promise<void> {
    await this.ensureReady();
    await this.db()("ai_skills")
      .where((builder) => {
        builder.where({ id: skillId }).orWhere({ skill_id: skillId });
      })
      .andWhere({ owner_id: ownerId })
      .update({
        state: "published",
        updated_at: this.nowRaw(this.db()),
      });
  }

  async upsertSkill(input: UpsertSkillRecordInput): Promise<void> {
    await this.ensureReady();
    const existing = await this.db()("ai_skills").select("id").where({ id: input.id }).first();

    if (existing) {
      await this.db()("ai_skills")
        .where({ id: input.id })
        .update({
          type: input.type,
          skill_id: input.skill_id ?? null,
          meta: input.meta_text ?? null,
          content: input.content,
          state: input.state,
          scope: input.scope,
          version: input.version ?? null,
          owner_id: input.owner_id ?? null,
          updated_at: this.nowRaw(this.db()),
        });
      return;
    }

    await this.db()("ai_skills").insert({
      id: input.id,
      type: input.type,
      skill_id: input.skill_id ?? null,
      meta: input.meta_text ?? null,
      content: input.content,
      state: input.state,
      scope: input.scope,
      version: input.version ?? null,
      owner_id: input.owner_id ?? null,
      created_at: this.nowRaw(this.db()),
      updated_at: this.nowRaw(this.db()),
    });
  }
}

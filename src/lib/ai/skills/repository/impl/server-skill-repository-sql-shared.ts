import type { Knex } from "knex";
import type {
  PersistedSkillRecord,
  ServerSkillRepository,
  SkillRepositoryVisibility,
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
      visibility.states && visibility.states.length > 0 ? visibility.states : ["committed"];
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
        source: "source",
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
        source: "source",
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
        source: "source",
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
          source: input.source,
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
      source: input.source,
      created_at: this.nowRaw(this.db()),
      updated_at: this.nowRaw(this.db()),
    });
  }
}

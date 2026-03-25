import matter from "gray-matter";
import type {
  PersistedSkillRecord,
  ServerSkillRepository,
  SkillRepositoryVisibility,
} from "./repository/server-skill-repository";
import type { SkillDetailResponse, SkillProvider, SkillResourceResponse } from "./skill-provider";
import type { SkillCatalogItem } from "./skill-types";

type DatabaseSkillProviderOptions = {
  userId: string | null;
  includeDraft?: boolean;
};

type SkillMeta = {
  name?: string;
  description?: string;
  path?: string;
  disableSlashCommand?: boolean;
  metadata?: {
    disableSlashCommand?: boolean;
    author?: string;
    provider?: string;
  };
};

function parseMeta(metaText: string | null): SkillMeta {
  if (!metaText) {
    return {};
  }

  try {
    return JSON.parse(metaText) as SkillMeta;
  } catch {
    return {};
  }
}

function extractFrontmatter(content: string): Record<string, unknown> {
  try {
    return matter(content).data as Record<string, unknown>;
  } catch {
    return {};
  }
}

function resolveAuthor(
  row: PersistedSkillRecord,
  meta: SkillMeta,
  frontmatter: Record<string, unknown>
): string | undefined {
  return (
    row.owner_id ??
    meta.metadata?.author ??
    meta.metadata?.provider ??
    (typeof frontmatter.metadata === "object" &&
    frontmatter.metadata &&
    "author" in frontmatter.metadata &&
    typeof (frontmatter.metadata as { author?: unknown }).author === "string"
      ? ((frontmatter.metadata as { author: string }).author as string)
      : undefined)
  );
}

function resolveDisableSlashCommand(
  meta: SkillMeta,
  frontmatter: Record<string, unknown>
): boolean {
  if (meta.disableSlashCommand === true || meta.metadata?.disableSlashCommand === true) {
    return true;
  }

  if (frontmatter["disable-slash-command"] === true) {
    return true;
  }

  const metadataBlock = (frontmatter.metadata ?? {}) as Record<string, unknown>;
  return metadataBlock["disable-slash-command"] === true;
}

function extractSummary(content: string): string | undefined {
  const rawBody = content.trimStart().startsWith("---") ? matter(content).content : content;
  const lines = rawBody.split("\n");
  const paragraphLines: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      if (inParagraph && paragraphLines.length > 0) break;
      continue;
    }
    if (trimmed === "") {
      if (inParagraph && paragraphLines.length > 0) break;
      continue;
    }
    inParagraph = true;
    paragraphLines.push(trimmed);
  }

  if (paragraphLines.length === 0) return undefined;
  const full = paragraphLines.join(" ");
  return full.length > 200 ? full.slice(0, 197) + "..." : full;
}

function toSkillCatalogItem(row: PersistedSkillRecord): SkillCatalogItem {
  const meta = parseMeta(row.meta_text);
  const frontmatter = extractFrontmatter(row.content);
  const name =
    meta.name ?? (typeof frontmatter.name === "string" ? frontmatter.name : undefined) ?? row.id;
  const description =
    meta.description ??
    (typeof frontmatter.description === "string" ? frontmatter.description : undefined) ??
    "";

  return {
    id: row.id,
    name,
    description,
    source: "database",
    status: row.state === "published" ? "available" : "disabled",
    state: row.state,
    scope: row.scope,
    version: row.version ?? undefined,
    author: resolveAuthor(row, meta, frontmatter),
    summary: extractSummary(row.content),
    hasResources: false,
    disableSlashCommand: resolveDisableSlashCommand(meta, frontmatter),
  };
}

function buildVisibility(options: DatabaseSkillProviderOptions): SkillRepositoryVisibility {
  return {
    userId: options.userId,
    states: options.includeDraft ? ["draft", "published"] : ["published"],
  };
}

function getResourcePath(row: PersistedSkillRecord): string | null {
  const meta = parseMeta(row.meta_text);
  return typeof meta.path === "string" ? meta.path : null;
}

export class DatabaseSkillProvider implements SkillProvider {
  constructor(
    private readonly repository: ServerSkillRepository,
    private readonly options: DatabaseSkillProviderOptions
  ) {}

  async hasSkill(id: string): Promise<boolean> {
    return (await this.repository.getSkill(id, buildVisibility(this.options))) !== null;
  }

  async listSkills(filter?: (skill: SkillCatalogItem) => boolean): Promise<SkillCatalogItem[]> {
    const rows = await this.repository.listSkills(buildVisibility(this.options));
    const resourceRows = await Promise.all(
      rows.map((row) => this.repository.listSkillResource(row.id, buildVisibility(this.options)))
    );

    const catalog = rows.map((row, index) => ({
      ...toSkillCatalogItem(row),
      hasResources: resourceRows[index].length > 0,
    }));
    return filter ? catalog.filter(filter) : catalog;
  }

  async getSkillDetail(id: string): Promise<SkillDetailResponse | null> {
    const row = await this.repository.getSkill(id, buildVisibility(this.options));
    if (!row) {
      return null;
    }

    const resourceRows = await this.repository.listSkillResource(id, buildVisibility(this.options));
    const resourcePaths = resourceRows
      .map((resourceRow) => getResourcePath(resourceRow))
      .filter((path): path is string => Boolean(path))
      .sort();

    return {
      ...toSkillCatalogItem(row),
      hasResources: resourcePaths.length > 0,
      content: row.content,
      resourcePaths,
    };
  }

  async getSkillResourcePaths(id: string): Promise<string[]> {
    const resourceRows = await this.repository.listSkillResource(id, buildVisibility(this.options));
    return resourceRows
      .map((resourceRow) => getResourcePath(resourceRow))
      .filter((path): path is string => Boolean(path))
      .sort();
  }

  async getSkillResource(id: string, resourcePath: string): Promise<string | null> {
    const detail = await this.getSkillResourceDetail(id, resourcePath);
    return detail?.content ?? null;
  }

  async getSkillResourceDetail(
    id: string,
    resourcePath: string
  ): Promise<SkillResourceResponse | null> {
    const rows = await this.repository.listSkillResource(id, buildVisibility(this.options));
    const match = rows.find((row) => getResourcePath(row) === resourcePath);
    if (!match) {
      return null;
    }

    return {
      content: match.content,
      source: "database",
      state: match.state,
      scope: match.scope,
      author: match.owner_id ?? undefined,
      version: match.version ?? undefined,
    };
  }
}

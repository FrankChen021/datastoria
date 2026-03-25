/**
 * GET /api/ai/skills/[id]
 *
 * Returns full detail for a single skill: SKILL.md content (raw) + resource paths.
 * The frontend toggle controls whether to render as markdown or show the raw text.
 */
import { getAuthenticatedUserEmail } from "@/auth";
import type { UpsertSkillBundleInput } from "@/lib/ai/skills/repository/server-skill-repository";
import { getServerSkillRepository } from "@/lib/ai/skills/repository/server-skill-repository-factory";
import { SkillProviderFactory } from "@/lib/ai/skills/skill-provider-factory";
import { NextResponse } from "next/server";

// Force Node.js runtime (disk-backed skills use fs)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shouldIncludeDraft(req: Request, userId: string | null): boolean {
  if (!userId) return false;
  const flag = new URL(req.url).searchParams.get("includeDraft");
  return flag === "true" || flag === "1";
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = getAuthenticatedUserEmail(req) ?? null;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid skill id" }, { status: 400 });
  }

  try {
    const skillProvider = SkillProviderFactory.getProvider({
      userId,
      includeDraft: shouldIncludeDraft(req, userId),
    });
    const detail = await skillProvider.getSkillDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    console.error(`[/api/ai/skills/${id}] Failed to get skill detail`, err);
    return NextResponse.json({ error: "Failed to get skill detail" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = getAuthenticatedUserEmail(req) ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const repository = getServerSkillRepository();
  let payload: (UpsertSkillBundleInput & { action?: "publish" }) | null = null;
  try {
    payload = (await req.json()) as UpsertSkillBundleInput & { action?: "publish" };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (payload?.action === "publish") {
      if (payload.content) {
        await repository.saveAndPublishSkillBundle(userId, {
          ...payload,
          id,
        });
        return NextResponse.json({ ok: true });
      }
      if ((payload.resources?.length ?? 0) > 0 || (payload.deletedResourcePaths?.length ?? 0) > 0) {
        await repository.publishSkillResources(userId, {
          id,
          scope: payload.scope,
          version: payload.version,
          resources: payload.resources,
          deletedResourcePaths: payload.deletedResourcePaths,
        });
        return NextResponse.json({ ok: true });
      }
      await repository.publishSkill(id, userId);
      return NextResponse.json({ ok: true });
    }

    if (!payload?.content) {
      return NextResponse.json({ error: "Missing required skill fields" }, { status: 400 });
    }

    await repository.upsertSkillBundle(userId, {
      ...payload,
      id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update skill";
    console.error(`[/api/ai/skills/${id}] Failed to update skill`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = getAuthenticatedUserEmail(req) ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const skillProvider = SkillProviderFactory.getProvider({
      userId,
      includeDraft: true,
    });
    const existing = await skillProvider.getSkillDetail(id);
    if (!existing) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const repository = getServerSkillRepository();
    if (existing.source === "disk") {
      return NextResponse.json(
        { error: "Deleting disk-backed skills is not supported" },
        { status: 400 }
      );
    }
    await repository.deleteSkill(id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[/api/ai/skills/${id}] Failed to delete skill`, err);
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
  }
}

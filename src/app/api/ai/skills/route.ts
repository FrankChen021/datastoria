/**
 * GET /api/ai/skills
 *
 * Returns compact catalog metadata for the effective skill set.
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

export async function GET(req: Request) {
  const userId = getAuthenticatedUserEmail(req) ?? null;
  try {
    const skillProvider = SkillProviderFactory.getProvider({
      userId,
      includeDraft: shouldIncludeDraft(req, userId),
    });
    const skills = await skillProvider.listSkills((s) => s.author !== "System");
    return NextResponse.json(skills);
  } catch (err) {
    console.error("[/api/ai/skills] Failed to list skills", err);
    return NextResponse.json({ error: "Failed to list skills" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const userId = getAuthenticatedUserEmail(req) ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let payload: UpsertSkillBundleInput | null = null;
  try {
    payload = (await req.json()) as UpsertSkillBundleInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload?.id || !payload.content) {
    return NextResponse.json({ error: "Missing required skill fields" }, { status: 400 });
  }

  try {
    await getServerSkillRepository().upsertSkillBundle(userId, payload);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save skill";
    console.error("[/api/ai/skills] Failed to save skill", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

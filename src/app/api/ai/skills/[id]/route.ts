/**
 * GET /api/ai/skills/[id]
 *
 * Returns full detail for a single skill: SKILL.md content (raw) + resource paths.
 * The frontend toggle controls whether to render as markdown or show the raw text.
 */
import { getAuthenticatedUserEmail } from "@/auth";
import { SkillProviderFactory } from "@/lib/ai/skills/skill-provider-factory";
import { NextResponse } from "next/server";

// Force Node.js runtime (disk-backed skills use fs)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid skill id" }, { status: 400 });
  }

  try {
    const skillProvider = SkillProviderFactory.getProvider({
      userId: getAuthenticatedUserEmail(req) ?? null,
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

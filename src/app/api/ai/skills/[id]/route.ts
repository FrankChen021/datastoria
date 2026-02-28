/**
 * GET /api/ai/skills/[id]
 *
 * Returns full detail for a single skill: SKILL.md content (raw) + resource paths.
 * The frontend toggle controls whether to render as markdown or show the raw text.
 */
import { DiskSkillProvider } from "@/lib/ai/skills/disk-skill-provider";
import { CompositeSkillProvider } from "@/lib/ai/skills/skill-provider";
import { NextResponse } from "next/server";

// Force Node.js runtime (SkillManager uses fs)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const skillProvider = new CompositeSkillProvider([new DiskSkillProvider()]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid skill id" }, { status: 400 });
  }

  try {
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

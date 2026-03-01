/**
 * GET /api/ai/skills
 *
 * Returns compact catalog metadata for all skills (no full SKILL.md content).
 * Phase 1: only built-in skills from disk.
 */
import { DiskSkillProvider } from "@/lib/ai/skills/disk-skill-provider";
import { CompositeSkillProvider } from "@/lib/ai/skills/skill-provider";
import { NextResponse } from "next/server";

// Force Node.js runtime (SkillManager uses fs)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const skillProvider = new CompositeSkillProvider([new DiskSkillProvider()]);

export async function GET() {
  try {
    const skills = await skillProvider.listSkills((s) => s.provider !== "System");
    return NextResponse.json(skills);
  } catch (err) {
    console.error("[/api/ai/skills] Failed to list skills", err);
    return NextResponse.json({ error: "Failed to list skills" }, { status: 500 });
  }
}

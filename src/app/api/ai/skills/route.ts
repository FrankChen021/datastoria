/**
 * GET /api/ai/skills
 *
 * Returns compact catalog metadata for the effective skill set.
 */
import { getAuthenticatedUserEmail } from "@/auth";
import { getSkillProvider } from "@/lib/ai/skills/skill-provider-factory";
import { NextResponse } from "next/server";

// Force Node.js runtime (disk-backed skills use fs)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const skillProvider = getSkillProvider({ userId: getAuthenticatedUserEmail(req) ?? null });
    const skills = await skillProvider.listSkills((s) => s.author !== "System");
    return NextResponse.json(skills);
  } catch (err) {
    console.error("[/api/ai/skills] Failed to list skills", err);
    return NextResponse.json({ error: "Failed to list skills" }, { status: 500 });
  }
}

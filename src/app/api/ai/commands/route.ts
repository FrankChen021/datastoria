/**
 * GET /api/ai/commands
 *
 * Returns all discovered slash commands including their prompt templates.
 * Templates are included so the frontend can expand them at submit time
 * without a second round-trip.
 */
import { getAuthenticatedUserEmail } from "@/auth";
import { SkillProviderFactory } from "@/lib/ai/skills/skill-provider-factory";
import { buildSkillCommands } from "@/lib/ai/tools/server/skill-tool";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const skillProvider = SkillProviderFactory.getProvider({
      userId: getAuthenticatedUserEmail(req) ?? null,
    });
    const commands = buildSkillCommands(await skillProvider.listSkills());
    return NextResponse.json(commands);
  } catch (err) {
    console.error("[/api/ai/commands] Failed to list commands", err);
    return NextResponse.json({ error: "Failed to list commands" }, { status: 500 });
  }
}

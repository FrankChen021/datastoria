/**
 * GET /api/ai/commands
 *
 * Returns all discovered slash commands including their prompt templates.
 * Templates are included so the frontend can expand them at submit time
 * without a second round-trip.
 */
import { CommandManager } from "@/lib/ai/commands/command-manager";
import { SkillManager } from "@/lib/ai/skills/skill-manager";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    SkillManager.listSkills();
    const commands = CommandManager.listCommands();
    return NextResponse.json(commands);
  } catch (err) {
    console.error("[/api/ai/commands] Failed to list commands", err);
    return NextResponse.json({ error: "Failed to list commands" }, { status: 500 });
  }
}

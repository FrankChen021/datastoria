/**
 * GET /api/ai/commands
 *
 * Returns all discovered slash commands including their prompt templates.
 * Templates are included so the frontend can expand them at submit time
 * without a second round-trip.
 */
import { getAuthenticatedUserEmail } from "@/auth";
import { CommandManager } from "@/lib/ai/commands/command-manager";
import { createSkillAvailabilityFilter } from "@/lib/ai/skills/skill-availability";
import { SkillProviderFactory } from "@/lib/ai/skills/skill-provider-factory";
import { getRuntimeAvailableToolNames } from "@/lib/ai/tools/server/runtime-tools";
import { defaultCodeSearchFactory } from "@/lib/code-search/code-search-factory";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const codeSearchContext = await defaultCodeSearchFactory.getCodeSearchContext();
    const availableTools = getRuntimeAvailableToolNames({
      codeSearchEnabled: codeSearchContext != null,
    });

    const skillProvider = SkillProviderFactory.getProvider({
      userId: getAuthenticatedUserEmail(req) ?? null,
    });
    const availableSkills = await skillProvider.listSkills(
      createSkillAvailabilityFilter(availableTools)
    );
    return NextResponse.json(CommandManager.fromSkills(availableSkills).listCommands());
  } catch (err) {
    console.error("[/api/ai/commands] Failed to list commands", err);
    return NextResponse.json({ error: "Failed to list commands" }, { status: 500 });
  }
}

/**
 * GET /api/ai/skills/[id]/resource?path=<relativePath>
 *
 * Returns raw content of a single sub-resource file within a skill directory.
 * Used by the detail view when a user clicks a file node in the directory tree.
 */
import { DiskSkillProvider } from "@/lib/ai/skills/disk-skill-provider";
import { CompositeSkillProvider } from "@/lib/ai/skills/skill-provider";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const skillProvider = new CompositeSkillProvider([new DiskSkillProvider()]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const resourcePath = searchParams.get("path");

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid skill id" }, { status: 400 });
  }
  if (!resourcePath || typeof resourcePath !== "string") {
    return NextResponse.json({ error: "Missing ?path= parameter" }, { status: 400 });
  }

  try {
    const content = await skillProvider.getSkillResource(id, resourcePath);
    if (content === null) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }
    return NextResponse.json({ content });
  } catch (err) {
    console.error(`[/api/ai/skills/${id}/resource] Failed to load resource`, err);
    return NextResponse.json({ error: "Failed to load resource" }, { status: 500 });
  }
}

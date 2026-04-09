import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

let cachedTemplateSources: Record<string, string> | null = null;

function toTemplateId(fileName: string): string {
  return fileName.replace(/\.ya?ml$/i, "").replaceAll("-", "_");
}

function getRcaTemplateRootDir(): string {
  const prodCandidates = [
    path.join(process.cwd(), ".next", "server", "rca"),
    path.join(process.cwd(), ".next", "standalone", ".next", "server", "rca"),
  ];
  const devCandidates = [path.join(process.cwd(), "resources", "rca"), ...prodCandidates];
  const candidates = process.env.NODE_ENV === "production" ? prodCandidates : devCandidates;

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return dir;
      }
    } catch {
      // Ignore missing candidate directories and continue.
    }
  }

  return path.join(process.cwd(), "resources", "rca");
}

function loadTemplateSources(): Record<string, string> {
  if (process.env.NODE_ENV !== "development" && cachedTemplateSources) {
    return cachedTemplateSources;
  }

  const templateRoot = getRcaTemplateRootDir();
  const entries = fs.readdirSync(templateRoot, { withFileTypes: true });
  const templates: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
      continue;
    }
    templates[toTemplateId(entry.name)] = fs.readFileSync(
      path.join(templateRoot, entry.name),
      "utf-8"
    );
  }

  if (process.env.NODE_ENV !== "development") {
    cachedTemplateSources = templates;
  }

  return templates;
}

export async function GET() {
  try {
    return NextResponse.json(
      { templates: loadTemplateSources() },
      {
        headers:
          process.env.NODE_ENV === "development" ? { "Cache-Control": "no-store" } : undefined,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load RCA templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

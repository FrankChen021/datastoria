/**
 * Copy skill markdown assets into build output so runtime fs reads work on Vercel/standalone.
 *
 * We copy only markdown (+ json) content, preserving relative paths under:
 *   src/lib/ai/skills/(recursive)/(SKILL.md | AGENTS.md | rules/(recursive)/*.md | *.json)
 *
 * Destinations (if present):
 * - .next/server/skills
 * - .next/standalone/.next/server/skills
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src", "lib", "ai", "skills");

const destinations = [
  path.join(projectRoot, ".next", "server", "skills"),
  path.join(projectRoot, ".next", "standalone", ".next", "server", "skills"),
];

const allowedBaseNames = new Set(["SKILL.md", "AGENTS.md"]);

function isAllowedFile(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  const base = path.basename(relPath);

  if (allowedBaseNames.has(base)) return true;
  if (normalized.includes("/rules/") && base.endsWith(".md")) return true;
  if (base.endsWith(".json")) return true;
  return false;
}

function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(rootDir, full);
      if (isAllowedFile(rel)) out.push({ full, rel });
    }
  }

  return out;
}

function ensureDir(dir) {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function main() {
  if (!fs.existsSync(sourceRoot)) {
    console.warn(`copy-skills: source missing: ${sourceRoot}`);
    return;
  }

  const files = walkFiles(sourceRoot);
  if (files.length === 0) {
    console.warn("copy-skills: no skill files found");
    return;
  }

  const activeDests = destinations.filter((d) => fs.existsSync(path.dirname(d)));
  if (activeDests.length === 0) {
    // If build output doesn't exist yet, this script was invoked too early.
    console.warn("copy-skills: build output not found; run after next build");
    return;
  }

  for (const destRoot of activeDests) {
    ensureDir(destRoot);
    for (const f of files) {
      copyFile(f.full, path.join(destRoot, f.rel));
    }
  }

  console.log(`copy-skills: copied ${files.length} file(s) to ${activeDests.length} destination(s)`);
}

main();

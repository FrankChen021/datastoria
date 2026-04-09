/**
 * Copy runtime-loaded assets into build output so runtime fs reads work on Vercel/standalone.
 *
 * We copy:
 * - all .md and .json files under resources/skills/ (recursive)
 * - all .yaml/.yml files under resources/rca/ (recursive)
 * preserving relative paths under separate destination roots.
 *
 * Destinations (if present):
 * - .next/server/skills
 * - .next/standalone/.next/server/skills
 * - .next/server/rca
 * - .next/standalone/.next/server/rca
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, "..");
const assetGroups = [
  {
    sourceRoot: path.join(projectRoot, "resources", "skills"),
    destinations: [
      path.join(projectRoot, ".next", "server", "skills"),
      path.join(projectRoot, ".next", "standalone", ".next", "server", "skills"),
    ],
    isAllowedFile(relPath) {
      const base = path.basename(relPath);
      return base.endsWith(".md") || base.endsWith(".json");
    },
    missingWarning: "copy-resources: skills source missing",
    emptyWarning: "copy-resources: no skill files found",
  },
  {
    sourceRoot: path.join(projectRoot, "resources", "rca"),
    destinations: [
      path.join(projectRoot, ".next", "server", "rca"),
      path.join(projectRoot, ".next", "standalone", ".next", "server", "rca"),
    ],
    isAllowedFile(relPath) {
      return /\.ya?ml$/i.test(path.basename(relPath));
    },
    missingWarning: "copy-resources: rca source missing",
    emptyWarning: "copy-resources: no rca files found",
  },
];

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
      out.push({ full, rel });
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
  const activeGroups = assetGroups
    .map((group) => {
      if (!fs.existsSync(group.sourceRoot)) {
        console.warn(`${group.missingWarning}: ${group.sourceRoot}`);
        return null;
      }

      const files = walkFiles(group.sourceRoot).filter((file) => group.isAllowedFile(file.rel));
      if (files.length === 0) {
        console.warn(group.emptyWarning);
        return null;
      }

      const activeDests = group.destinations.filter((d) => fs.existsSync(path.dirname(d)));
      return activeDests.length > 0 ? { ...group, files, activeDests } : null;
    })
    .filter(Boolean);

  if (activeGroups.length === 0) {
    // If build output doesn't exist yet, this script was invoked too early.
    console.warn("copy-resources: build output not found; run after next build");
    return;
  }

  let copiedCount = 0;
  let destinationCount = 0;

  for (const group of activeGroups) {
    destinationCount += group.activeDests.length;
    for (const destRoot of group.activeDests) {
      ensureDir(destRoot);
      for (const f of group.files) {
        copyFile(f.full, path.join(destRoot, f.rel));
        copiedCount += 1;
      }
    }
  }

  console.log(
    `copy-resources: copied ${copiedCount} file(s) to ${destinationCount} destination(s)`
  );
}

main();

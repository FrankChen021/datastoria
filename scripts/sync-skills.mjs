import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, "..");

const syncTargets = [
  {
    source: path.join(projectRoot, "external", "clickhouse", "skills"),
    destination: path.join(projectRoot, "resources", "skills", "clickhouse"),
  },
  {
    source: path.join(projectRoot, "external", "vizlayer", "skills"),
    destination: path.join(projectRoot, "resources", "skills", "vizlayer"),
  },
];

function ensureDir(dir) {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
}

function removeDirContents(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
  }
}

function copyTree(sourceDir, destinationDir) {
  const stack = [[sourceDir, destinationDir]];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    const [source, destination] = current;
    ensureDir(destination);

    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;

      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        stack.push([sourcePath, destinationPath]);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      ensureDir(path.dirname(destinationPath));
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function syncSkillTarget({ source, destination }) {
  if (!fs.existsSync(source)) {
    console.warn(`sync-skills: source missing: ${source}`);
    return 0;
  }

  ensureDir(destination);
  removeDirContents(destination);
  copyTree(source, destination);

  let count = 0;
  const stack = [destination];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        count += 1;
      }
    }
  }

  console.log(`sync-skills: copied ${count} file(s) from ${source} to ${destination}`);
  return count;
}

function main() {
  let copiedFiles = 0;

  for (const target of syncTargets) {
    copiedFiles += syncSkillTarget(target);
  }

  console.log(`sync-skills: completed with ${copiedFiles} copied file(s)`);
}

main();

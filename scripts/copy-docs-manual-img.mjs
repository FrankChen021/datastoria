/**
 * Copy video files from any docs/manual/.../img into docs/public so VitePress
 * includes them in the build (images use markdown and are bundled; Video component
 * uses string props so only videos need copying). docs/public/manual is gitignored.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const manualDir = path.join(root, "docs", "manual");
const publicManualDir = path.join(root, "docs", "public", "manual");

const VIDEO_EXT = new Set([".webm", ".mp4", ".mov", ".avi", ".mkv"]);

function findImgDirs(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "img") {
        acc.push(full);
      } else {
        findImgDirs(full, acc);
      }
    }
  }
  return acc;
}

function copyVideosOnly(srcImgDir, destImgDir) {
  if (!fs.existsSync(srcImgDir)) return;
  const entries = fs.readdirSync(srcImgDir, { withFileTypes: true });
  const videos = entries.filter(
    (e) => e.isFile() && VIDEO_EXT.has(path.extname(e.name).toLowerCase())
  );
  if (videos.length === 0) return;
  fs.mkdirSync(destImgDir, { recursive: true });
  for (const v of videos) {
    fs.copyFileSync(path.join(srcImgDir, v.name), path.join(destImgDir, v.name));
  }
}

const imgDirs = findImgDirs(manualDir);
for (const srcImg of imgDirs) {
  const rel = path.relative(manualDir, path.dirname(srcImg));
  const destImg = path.join(publicManualDir, rel, "img");
  copyVideosOnly(srcImg, destImg);
}

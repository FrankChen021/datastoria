/**
 * Downloads release-notes.json from the release branch (raw GitHub)
 * and writes it to public/release-notes.json. Used at Vercel build time
 * so the app can serve release notes as a static file.
 */

import fs from "fs";
import path from "path";

// Same repo as the build (Vercel sets these; otherwise use RELEASE_NOTES_REPO or default)
const REPO =
  process.env.RELEASE_NOTES_REPO ??
  (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : "FrankChen021/datastoria");
const BRANCH = "release";
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/public/release-notes.json`;

const publicDir = path.join(process.cwd(), "public");
const outputPath = path.join(publicDir, "release-notes.json");

async function download() {
  const res = await fetch(RAW_URL, { headers: { Accept: "application/json" } });

  if (!res.ok) {
    console.warn(
      `download-release-notes: ${res.status} ${RAW_URL}, writing empty array`
    );
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify([]));
    return;
  }

  const data = await res.json();
  const out = Array.isArray(data) ? data : [data];
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));
  console.log(`download-release-notes: wrote ${out.length} release(s)`);
}

// Don't catch error
await download();
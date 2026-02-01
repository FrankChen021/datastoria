/**
 * Downloads release-notes.json from the release branch and writes it to
 * public/release-notes.json. Used at Vercel build time so the app can serve
 * release notes as a static file.
 *
 * For private repos: set GITHUB_TOKEN or RELEASE_NOTES_GITHUB_TOKEN so the
 * script uses the GitHub Contents API. For public repos, the raw URL is used
 * when no token is set.
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
const TOKEN = process.env.RELEASE_NOTES_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;

const publicDir = path.join(process.cwd(), "public");
const outputPath = path.join(publicDir, "release-notes.json");

function writeEmpty() {
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify([]));
}

async function fetchViaApi() {
  const url = `https://api.github.com/repos/${REPO}/contents/public/release-notes.json?ref=${BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(
      `download-release-notes: GitHub API ${res.status} ${url}`,
      text || res.statusText
    );
    return null;
  }
  const payload = await res.json();
  if (!payload.content) return null;
  const decoded = Buffer.from(payload.content, "base64").toString("utf-8");
  return JSON.parse(decoded);
}

async function fetchViaRaw() {
  const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/public/release-notes.json`;
  const res = await fetch(rawUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    console.warn(
      `download-release-notes: raw URL ${res.status} ${rawUrl}`,
      text || res.statusText
    );
    return null;
  }
  return res.json();
}

async function download() {
  let data = null;
  if (TOKEN) {
    data = await fetchViaApi();
    if (data === null) {
      console.warn(
        "download-release-notes: GitHub API fetch failed (private repo?), writing empty array"
      );
    }
  }
  if (data === null) {
    data = await fetchViaRaw();
  }
  if (data === null) {
    console.warn(
      "download-release-notes: could not fetch release-notes.json, writing empty array"
    );
    writeEmpty();
    return;
  }
  const out = Array.isArray(data) ? data : [data];
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));
  console.log(`download-release-notes: wrote ${out.length} release(s)`);
}

// Don't catch error
await download();
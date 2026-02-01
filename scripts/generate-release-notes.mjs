/**
 * Generates release-notes.json from merged PRs (PR-based, no LLM).
 * Uses GitHub API: compare commits to get PR numbers from merge commits,
 * then fetches each PR's title and labels. Maps labels to release note sections:
 *   highlight, feature, fix (chore, ci, and documentation-only are excluded).
 * PR title starting with "fix" (case insensitive, word boundary) maps to fix category.
 * Each note includes merged_at (ISO string from GitHub) for ordering by merge time in the UI.
 *
 * Range "last release → latest":
 *   This script does not read release-notes.json. The GHA workflow fetches it
 *   from the release branch, extracts the latest release id (.[0].id) as FROM,
 *   and passes FROM and HEAD to this script. The script then uses GitHub Compare
 *   FROM...HEAD to get PRs in that range. If FROM is empty (e.g. first release),
 *   it uses "list merged PRs" (up to 100) instead.
 *
 * Local testing (from repo root): set GITHUB_TOKEN and REPO, then
 *   node generate-release-notes.mjs
 * RELEASE_ID, HEAD, OUTPUT_DIR default from git and cwd. Optional: FROM=last_release_sha.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.REPO; // owner/repo
// Local testing: RELEASE_ID/HEAD/OUTPUT_DIR default from git and cwd when unset
const RELEASE_ID =
  process.env.RELEASE_ID ||
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    } catch {
      return "";
    }
  })();
const FROM = process.env.FROM || ""; // base commit (last release id), empty = first release
const HEAD =
  process.env.HEAD ||
  process.env.RELEASE_ID ||
  (() => {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    } catch {
      return RELEASE_ID;
    }
  })();
const PREVIOUS_RELEASE_NOTES_JSON = process.env.PREVIOUS_RELEASE_NOTES_JSON;
const OUTPUT_DIR = process.env.OUTPUT_DIR || process.cwd();

if (!GITHUB_TOKEN || !REPO || !RELEASE_ID) {
  console.error("Error: GITHUB_TOKEN and REPO are required. RELEASE_ID is required if not in a git repo.");
  process.exit(1);
}

const [owner, repoName] = REPO.split("/");
if (!owner || !repoName) {
  console.error("Error: REPO must be owner/repo.");
  process.exit(1);
}

const API_BASE = "https://api.github.com";
const AUTH_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// Label names → release note type (same as app: highlight | feature | fix)
const LABEL_TO_TYPE = {
  highlight: "highlight",
  feature: "feature",
  fix: "fix",
};
const EXCLUDE_LABELS = new Set(["chore", "ci"]);
// Documentation-only PRs are skipped (no user-facing release note)
const DOCS_LABELS = new Set(["docs", "documentation"]);
const TYPE_PRIORITY = { highlight: 3, feature: 2, fix: 1 };

function typeFromLabels(labelNames) {
  const lowerNames = labelNames.map((n) => n.toLowerCase());
  for (const name of lowerNames) {
    if (EXCLUDE_LABELS.has(name)) return null;
  }
  // Skip if PR has only documentation (docs/documentation) and no highlight/feature/fix
  const hasAnyDocsLabel = lowerNames.some((n) => DOCS_LABELS.has(n));
  const hasReleaseNoteType = lowerNames.some((n) =>
    ["highlight", "feature", "fix"].includes(n)
  );
  if (hasAnyDocsLabel && !hasReleaseNoteType) return null;

  let chosen = "feature"; // default when no label matches
  let priority = -1;
  for (const name of lowerNames) {
    const t = LABEL_TO_TYPE[name];
    if (t && TYPE_PRIORITY[t] > priority) {
      chosen = t;
      priority = TYPE_PRIORITY[t];
    }
  }
  return chosen;
}

function stripConventionalPrefix(title) {
  return title.replace(/^(feat|fix|docs|chore)(\([^)]*\))?!?:\s*/i, "").trim() || title;
}

const PR_NUMBER_REGEX = /#(\d+)|Merge pull request #(\d+)/gi;

function extractPrNumbersFromMessage(message) {
  const numbers = new Set();
  let m;
  while ((m = PR_NUMBER_REGEX.exec(message)) !== null) {
    numbers.add(parseInt(m[1] || m[2], 10));
  }
  return [...numbers];
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: AUTH_HEADERS });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}

async function getPrNumbersFromCompare(base, head) {
  const url = `${API_BASE}/repos/${owner}/${repoName}/compare/${base}...${head}`;
  const data = await fetchJson(url);
  const prNumbers = new Set();
  for (const c of data.commits || []) {
    const msg = c.commit?.message || "";
    for (const n of extractPrNumbersFromMessage(msg)) prNumbers.add(n);
  }
  return [...prNumbers];
}

async function getPrNumbersFirstRelease() {
  const url = `${API_BASE}/repos/${owner}/${repoName}/pulls?state=closed&base=master&sort=updated&direction=desc&per_page=100`;
  const list = await fetchJson(url);
  return list.filter((pr) => pr.merged_at).map((pr) => pr.number);
}

async function getPrTitleAndLabels(prNumber) {
  const issueUrl = `${API_BASE}/repos/${owner}/${repoName}/issues/${prNumber}`;
  const issue = await fetchJson(issueUrl);
  const labelNames = (issue.labels || []).map((l) => l.name);
  let type = typeFromLabels(labelNames);
  if (type === null) return null;
  // Title prefix "fix" (case insensitive) maps to fix category
  const title = issue.title || "";
  if (/^fix\b/i.test(title)) type = "fix";
  const text = stripConventionalPrefix(title);

  let mergedAt = null;
  try {
    const pullUrl = `${API_BASE}/repos/${owner}/${repoName}/pulls/${prNumber}`;
    const pull = await fetchJson(pullUrl);
    if (pull.merged_at) mergedAt = pull.merged_at;
  } catch {
    // Not a PR or no merge date
  }

  return { text, pr: prNumber, type, merged_at: mergedAt };
}

async function main() {
  let prNumbers;
  if (FROM && HEAD) {
    prNumbers = await getPrNumbersFromCompare(FROM, HEAD);
  } else {
    prNumbers = await getPrNumbersFirstRelease();
  }

  const notes = [];
  for (const num of prNumbers) {
    try {
      const entry = await getPrTitleAndLabels(num);
      if (entry) notes.push(entry);
    } catch (e) {
      console.warn(`Skipping PR #${num}:`, e.message);
    }
  }

  // Sort: highlight first, then feature, then fix; within same type keep order
  notes.sort((a, b) => TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type]);

  const releaseData = {
    id: RELEASE_ID,
    date: new Date().toISOString(),
    notes,
  };

  const publicDir = OUTPUT_DIR
    ? path.join(OUTPUT_DIR, "public")
    : path.join(process.cwd(), "..", "public");
  const outputPath = path.join(publicDir, "release-notes.json");

  let history = [];
  if (PREVIOUS_RELEASE_NOTES_JSON) {
    try {
      const existing = JSON.parse(PREVIOUS_RELEASE_NOTES_JSON);
      history = Array.isArray(existing) ? existing : [existing];
    } catch (e) {
      console.warn("Could not parse PREVIOUS_RELEASE_NOTES_JSON.");
    }
  } else if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      history = Array.isArray(existing) ? existing : [existing];
    } catch (e) {
      console.warn("Could not parse existing release-notes.json.");
    }
  }

  history = history.filter((h) => h.id !== RELEASE_ID);
  if (notes.length > 0) history.unshift(releaseData);
  const finalHistory = history
    .filter((h) => h.notes && h.notes.length > 0);

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(finalHistory, null, 2));

  console.log(
    `Release notes: ${notes.length} items (${notes.filter((n) => n.type === "highlight").length} highlights)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

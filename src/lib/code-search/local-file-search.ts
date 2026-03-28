import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  CodeSearch,
  CodeSearchConfig,
  ListFilesResult,
  ReadFileInput,
  ReadFileResult,
  SearchFileInput,
  SearchFileMatch,
  SearchFileResult,
} from "./types";

const BINARY_SCAN_BYTES = 8 * 1024;
// Number of files scanned concurrently during searchFile.
const SEARCH_CONCURRENCY = 8;

// Uses Buffer.indexOf which is implemented in native code.
function hasNullByte(buffer: Buffer): boolean {
  return buffer.indexOf(0) !== -1;
}

function isPathInsideRoot(rootDir: string, candidate: string): boolean {
  return candidate === rootDir || candidate.startsWith(`${rootDir}${path.sep}`);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function shouldIgnoreRelativePath(relativePath: string, ignoredNames: string[]): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  return segments.some((segment) => ignoredNames.includes(segment));
}

function buildGlobMatcher(globPattern: string): RegExp {
  let regex = "^";
  for (let index = 0; index < globPattern.length; index++) {
    const char = globPattern[index];
    const next = globPattern[index + 1];
    if (char === "*") {
      if (next === "*") {
        regex += ".*";
        index++;
      } else {
        regex += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      regex += ".";
      continue;
    }
    if ("\\.[]{}()+-^$|".includes(char)) {
      regex += `\\${char}`;
      continue;
    }
    regex += char;
  }
  regex += "$";
  return new RegExp(regex, "i");
}

// Returns the leading directory prefix of a glob before the first wildcard
// character, e.g. "src/**/*.ts" → "src/". Used to prune unrelated directories
// during the walk so we never recurse into branches that cannot match.
function extractGlobDirPrefix(globPattern: string): string {
  const normalized = globPattern.replace(/\\/g, "/");
  const firstWild = normalized.search(/[*?[{]/);
  if (firstWild === -1) return "";
  const slashBefore = normalized.lastIndexOf("/", firstWild);
  return slashBefore < 0 ? "" : normalized.slice(0, slashBefore + 1);
}

async function resolveFilePath(
  config: CodeSearchConfig,
  relativePath: string
): Promise<{ fullPath: string; relativePath: string } | { error: string }> {
  const requested = relativePath.trim();
  if (!requested) {
    return { error: "path is required" };
  }

  const normalizedRelative = path.normalize(requested);
  if (path.isAbsolute(normalizedRelative) || normalizedRelative.startsWith("..")) {
    return { error: "path rejected" };
  }

  const fullPath = path.resolve(config.rootDir, normalizedRelative);
  if (!isPathInsideRoot(config.rootDir, fullPath)) {
    return { error: "path rejected" };
  }

  let realPath: string;
  try {
    realPath = await fs.realpath(fullPath);
  } catch {
    return { error: "file not found" };
  }

  if (!isPathInsideRoot(config.rootDir, realPath)) {
    return { error: "path rejected" };
  }

  const relativeToRoot = path.relative(config.rootDir, realPath);
  if (shouldIgnoreRelativePath(relativeToRoot, config.ignoredNames)) {
    return { error: "path rejected" };
  }

  return {
    fullPath: realPath,
    relativePath: normalizeRelativePath(relativeToRoot),
  };
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(BINARY_SCAN_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, BINARY_SCAN_BYTES, 0);
    return hasNullByte(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

interface FileEntry {
  fullPath: string;
  relativePath: string;
}

// Returns true if a directory at `dirRelativePath` should be skipped given a
// required glob dir prefix. We skip when the directory path is neither a prefix
// of nor a parent of the required prefix — i.e. when the two paths diverge.
function shouldSkipDirForGlob(dirRelativePath: string, globDirPrefix: string): boolean {
  if (!globDirPrefix) return false;
  const dir = dirRelativePath.endsWith("/") ? dirRelativePath : `${dirRelativePath}/`;
  return !dir.startsWith(globDirPrefix) && !globDirPrefix.startsWith(dir);
}

async function collectFiles(
  config: CodeSearchConfig,
  directory: string,
  results: FileEntry[],
  globDirPrefix: string,
  visitedDirectories: Set<string> = new Set(),
  seenFiles: Set<string> = new Set()
): Promise<void> {
  const normalizedDirectory = await fs.realpath(directory);
  if (visitedDirectories.has(normalizedDirectory)) {
    return;
  }
  visitedDirectories.add(normalizedDirectory);

  const entries = await fs.readdir(normalizedDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(normalizedDirectory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(config.rootDir, fullPath));
    if (shouldIgnoreRelativePath(relativePath, config.ignoredNames)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (shouldSkipDirForGlob(relativePath, globDirPrefix)) continue;
      await collectFiles(config, fullPath, results, globDirPrefix, visitedDirectories, seenFiles);
      continue;
    }

    if (entry.isFile()) {
      if (!seenFiles.has(fullPath)) {
        seenFiles.add(fullPath);
        results.push({ fullPath, relativePath });
      }
      continue;
    }

    if (entry.isSymbolicLink()) {
      let realPath: string;
      try {
        realPath = await fs.realpath(fullPath);
      } catch {
        continue;
      }
      if (!isPathInsideRoot(config.rootDir, realPath)) {
        continue;
      }
      const stat = await fs.stat(realPath);
      if (stat.isDirectory()) {
        if (shouldSkipDirForGlob(relativePath, globDirPrefix)) continue;
        await collectFiles(config, realPath, results, globDirPrefix, visitedDirectories, seenFiles);
      } else if (stat.isFile()) {
        if (!seenFiles.has(realPath)) {
          seenFiles.add(realPath);
          const realRelativePath = normalizeRelativePath(path.relative(config.rootDir, realPath));
          results.push({ fullPath: realPath, relativePath: realRelativePath });
        }
      }
    }
  }
}

function appendLineWithinByteLimit(
  lines: string[],
  line: string,
  currentBytes: number,
  maxBytes: number
): { bytes: number; truncated: boolean } {
  const segment = lines.length === 0 ? line : `\n${line}`;
  // Use Buffer.byteLength to measure without allocating a buffer for the common path.
  const segmentByteLength = Buffer.byteLength(segment, "utf8");

  if (currentBytes + segmentByteLength <= maxBytes) {
    lines.push(segment);
    return { bytes: currentBytes + segmentByteLength, truncated: false };
  }

  if (currentBytes >= maxBytes) {
    return { bytes: currentBytes, truncated: true };
  }

  const remainingBytes = maxBytes - currentBytes;
  lines.push(Buffer.from(segment, "utf8").subarray(0, remainingBytes).toString("utf8"));
  return { bytes: maxBytes, truncated: true };
}

// Runs `fn` over `items` with at most `concurrency` items in-flight at once.
// If `fn` returns `false`, no new items are started and remaining workers
// drain their current item then exit.
async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<boolean | void>
): Promise<void> {
  let index = 0;
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped && index < items.length) {
      const current = index++;
      const result = await fn(items[current]);
      if (result === false) {
        stopped = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

export class LocalFileCodeSearch implements CodeSearch {
  constructor(private readonly config: CodeSearchConfig) {}

  async searchFile(input: SearchFileInput): Promise<SearchFileResult> {
    const query = input.query.trim();
    if (!query) {
      return { error: "query is required" };
    }

    const limit = Math.min(
      Math.max(input.limit ?? this.config.maxSearchResults, 1),
      this.config.maxSearchResults
    );
    const globTrim = input.glob?.trim() ?? "";
    const matcher = globTrim ? buildGlobMatcher(globTrim) : null;
    const globDirPrefix = globTrim ? extractGlobDirPrefix(globTrim) : "";

    const files: FileEntry[] = [];
    await collectFiles(this.config, this.config.rootDir, files, globDirPrefix);

    // Lowercase once for the entire search rather than per line.
    const normalizedQuery = query.toLowerCase();
    const matches: SearchFileMatch[] = [];
    let hasMore = false;

    await withConcurrency(files, SEARCH_CONCURRENCY, async ({ fullPath, relativePath }) => {
      if (hasMore) return false;
      if (matcher && !matcher.test(relativePath)) return;

      // stat first (cheap metadata call) before isBinaryFile (reads 8 KB).
      try {
        const { size } = await fs.stat(fullPath);
        if (size > this.config.maxFileBytes) return;
      } catch {
        return;
      }

      if (await isBinaryFile(fullPath)) return;

      // Single readFile call replaces open + readline streaming.
      // Files are already bounded by maxFileBytes so this is safe.
      let content: string;
      try {
        content = await fs.readFile(fullPath, "utf8");
      } catch {
        return;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        // Check stop flag at the top of each iteration so a worker that was
        // already past the readFile await stops as soon as possible.
        if (hasMore) return false;
        if (!lines[i].toLowerCase().includes(normalizedQuery)) continue;
        if (matches.length >= limit) {
          hasMore = true;
          return false;
        }
        matches.push({
          path: relativePath,
          line: i + 1,
          snippet: lines[i].trim().slice(0, 300),
        });
      }
    });

    if (matches.length === 0) {
      return { error: "no matches found" };
    }

    return { matches, hasMore };
  }

  async readFile(input: ReadFileInput): Promise<ReadFileResult> {
    const resolved = await resolveFilePath(this.config, input.path);
    if ("error" in resolved) {
      return resolved;
    }

    if (await isBinaryFile(resolved.fullPath)) {
      return { error: "binary file rejected" };
    }

    const maxLines = Math.max(1, input.maxLines ?? this.config.maxReadLines);
    const maxBytes = Math.max(1, input.maxBytes ?? this.config.maxFileBytes);
    const requestedStartLine = Math.max(input.startLine ?? 1, 1);
    const requestedEndLine =
      input.endLine != null
        ? Math.max(input.endLine, requestedStartLine)
        : requestedStartLine + maxLines - 1;

    // Single readFile replaces two full streamLines passes (count + collect).
    let rawContent: string;
    try {
      rawContent = await fs.readFile(resolved.fullPath, "utf8");
    } catch {
      return { error: "file not found" };
    }

    const allLines = rawContent.split(/\r?\n/);
    // Strip the trailing empty element produced by files that end with a newline,
    // matching the line count readline would produce.
    if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
      allLines.pop();
    }

    const totalLines = allLines.length;

    const effectiveStartLine =
      totalLines === 0 ? 1 : Math.min(requestedStartLine, Math.max(totalLines - maxLines + 1, 1));
    const effectiveEndLine =
      totalLines === 0
        ? 0
        : Math.min(requestedEndLine, effectiveStartLine + maxLines - 1, totalLines);

    const selectedLines: string[] = [];
    let usedBytes = 0;
    let byteTruncated = false;

    for (let i = effectiveStartLine - 1; i < effectiveEndLine; i++) {
      const appendResult = appendLineWithinByteLimit(
        selectedLines,
        allLines[i],
        usedBytes,
        maxBytes
      );
      usedBytes = appendResult.bytes;
      byteTruncated = byteTruncated || appendResult.truncated;
    }

    const content = selectedLines.join("");
    const hasMoreLines =
      totalLines > 0 &&
      (input.endLine == null ? effectiveEndLine < totalLines : effectiveEndLine < requestedEndLine);

    return {
      path: resolved.relativePath,
      startLine: effectiveStartLine,
      endLine: effectiveEndLine,
      totalLines,
      content,
      truncated: byteTruncated || hasMoreLines,
      hasPrevious: totalLines > 0 && effectiveStartLine > 1,
      hasNext: totalLines > 0 && effectiveEndLine < totalLines,
    };
  }

  async listFiles(): Promise<ListFilesResult> {
    const files: FileEntry[] = [];
    await collectFiles(this.config, this.config.rootDir, files, "");

    const uniquePaths = [...new Set(files.map((f) => f.relativePath))].sort((a, b) =>
      a.localeCompare(b)
    );

    return { paths: uniquePaths };
  }
}

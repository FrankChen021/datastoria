import "server-only";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
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
// Files above this threshold fall back to a streamed read path.
const MAX_BUFFERED_READ_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

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

interface IndexedFileEntry extends FileEntry {
  index: number;
}

// Returns true if a directory at `dirRelativePath` should be skipped given a
// required glob dir prefix. We skip when the directory path is neither a prefix
// of nor a parent of the required prefix — i.e. when the two paths diverge.
function shouldSkipDirForGlob(dirRelativePath: string, globDirPrefix: string): boolean {
  if (!globDirPrefix) return false;
  const dir = dirRelativePath.endsWith("/") ? dirRelativePath : `${dirRelativePath}/`;
  return !dir.startsWith(globDirPrefix) && !globDirPrefix.startsWith(dir);
}

// Async generator that yields FileEntry objects as the directory tree is walked.
// Because it is a generator, the caller can break early (via return() or by
// simply not pulling the next value) and the walk stops immediately — no full
// file-list is ever materialised in memory.
async function* walkFiles(
  config: CodeSearchConfig,
  directory: string,
  globDirPrefix: string,
  visitedDirectories: Set<string> = new Set(),
  seenFiles: Set<string> = new Set()
): AsyncGenerator<FileEntry> {
  const normalizedDirectory = await fs.realpath(directory);
  if (visitedDirectories.has(normalizedDirectory)) return;
  visitedDirectories.add(normalizedDirectory);

  const entries = await fs.readdir(normalizedDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const fullPath = path.join(normalizedDirectory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(config.rootDir, fullPath));
    if (shouldIgnoreRelativePath(relativePath, config.ignoredNames)) continue;

    if (entry.isDirectory()) {
      if (shouldSkipDirForGlob(relativePath, globDirPrefix)) continue;
      yield* walkFiles(config, fullPath, globDirPrefix, visitedDirectories, seenFiles);
      continue;
    }

    if (entry.isFile()) {
      if (!seenFiles.has(fullPath)) {
        seenFiles.add(fullPath);
        yield { fullPath, relativePath };
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
      if (!isPathInsideRoot(config.rootDir, realPath)) continue;
      const stat = await fs.stat(realPath);
      if (stat.isDirectory()) {
        if (shouldSkipDirForGlob(relativePath, globDirPrefix)) continue;
        yield* walkFiles(config, realPath, globDirPrefix, visitedDirectories, seenFiles);
      } else if (stat.isFile()) {
        if (!seenFiles.has(realPath)) {
          seenFiles.add(realPath);
          const realRelativePath = normalizeRelativePath(path.relative(config.rootDir, realPath));
          yield { fullPath: realPath, relativePath: realRelativePath };
        }
      }
    }
  }
}

async function* enumerateFiles(gen: AsyncGenerator<FileEntry>): AsyncGenerator<IndexedFileEntry> {
  let index = 0;
  for await (const file of gen) {
    yield { ...file, index };
    index += 1;
  }
}

async function streamLines(
  filePath: string,
  onLine: (line: string, lineNumber: number) => void | boolean | Promise<void | boolean>
): Promise<number> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let lineNumber = 0;

  try {
    for await (const line of reader) {
      lineNumber += 1;
      const shouldContinue = await onLine(line, lineNumber);
      if (shouldContinue === false) {
        reader.close();
        stream.destroy();
        break;
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  return lineNumber;
}

function splitBufferedLines(content: string): string[] {
  const lines = content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function getEffectiveWindow(
  totalLines: number,
  requestedStartLine: number,
  requestedEndLine: number,
  maxLines: number
) {
  const effectiveStartLine =
    totalLines === 0 ? 1 : Math.min(requestedStartLine, Math.max(totalLines - maxLines + 1, 1));
  const effectiveEndLine =
    totalLines === 0
      ? 0
      : Math.min(requestedEndLine, effectiveStartLine + maxLines - 1, totalLines);

  return { effectiveStartLine, effectiveEndLine };
}

function buildReadFileResult(args: {
  relativePath: string;
  requestedEndLine: number;
  maxLines: number;
  totalLines: number;
  content: string;
  byteTruncated: boolean;
  inputEndLine?: number;
  requestedStartLine: number;
}) {
  const { effectiveStartLine, effectiveEndLine } = getEffectiveWindow(
    args.totalLines,
    args.requestedStartLine,
    args.requestedEndLine,
    args.maxLines
  );
  const hasMoreLines =
    args.totalLines > 0 &&
    (args.inputEndLine == null
      ? effectiveEndLine < args.totalLines
      : effectiveEndLine < args.requestedEndLine);

  return {
    path: args.relativePath,
    startLine: effectiveStartLine,
    endLine: effectiveEndLine,
    totalLines: args.totalLines,
    content: args.content,
    truncated: args.byteTruncated || hasMoreLines,
    hasPrevious: args.totalLines > 0 && effectiveStartLine > 1,
    hasNext: args.totalLines > 0 && effectiveEndLine < args.totalLines,
  };
}

async function readFileBuffered(args: {
  fullPath: string;
  relativePath: string;
  requestedStartLine: number;
  requestedEndLine: number;
  inputEndLine?: number;
  maxLines: number;
  maxBytes: number;
}): Promise<ReadFileResult> {
  let rawContent: string;
  try {
    rawContent = await fs.readFile(args.fullPath, "utf8");
  } catch {
    return { error: "file not found" };
  }

  const allLines = splitBufferedLines(rawContent);
  const totalLines = allLines.length;
  const { effectiveStartLine, effectiveEndLine } = getEffectiveWindow(
    totalLines,
    args.requestedStartLine,
    args.requestedEndLine,
    args.maxLines
  );

  const selectedLines: string[] = [];
  let usedBytes = 0;
  let byteTruncated = false;

  for (let i = effectiveStartLine - 1; i < effectiveEndLine; i++) {
    const appendResult = appendLineWithinByteLimit(
      selectedLines,
      allLines[i],
      usedBytes,
      args.maxBytes
    );
    usedBytes = appendResult.bytes;
    byteTruncated = byteTruncated || appendResult.truncated;
  }

  return buildReadFileResult({
    relativePath: args.relativePath,
    requestedEndLine: args.requestedEndLine,
    maxLines: args.maxLines,
    totalLines,
    content: selectedLines.join(""),
    byteTruncated,
    inputEndLine: args.inputEndLine,
    requestedStartLine: args.requestedStartLine,
  });
}

async function readFileStreamed(args: {
  fullPath: string;
  relativePath: string;
  requestedStartLine: number;
  requestedEndLine: number;
  inputEndLine?: number;
  maxLines: number;
  maxBytes: number;
}): Promise<ReadFileResult> {
  let totalLines = 0;
  await streamLines(args.fullPath, (_, lineNumber) => {
    totalLines = lineNumber;
  });

  const { effectiveStartLine, effectiveEndLine } = getEffectiveWindow(
    totalLines,
    args.requestedStartLine,
    args.requestedEndLine,
    args.maxLines
  );

  const selectedLines: string[] = [];
  let usedBytes = 0;
  let byteTruncated = false;

  await streamLines(args.fullPath, (line, lineNumber) => {
    if (lineNumber < effectiveStartLine) {
      return;
    }
    if (lineNumber > effectiveEndLine) {
      return false;
    }

    const appendResult = appendLineWithinByteLimit(selectedLines, line, usedBytes, args.maxBytes);
    usedBytes = appendResult.bytes;
    byteTruncated = byteTruncated || appendResult.truncated;
  });

  return buildReadFileResult({
    relativePath: args.relativePath,
    requestedEndLine: args.requestedEndLine,
    maxLines: args.maxLines,
    totalLines,
    content: selectedLines.join(""),
    byteTruncated,
    inputEndLine: args.inputEndLine,
    requestedStartLine: args.requestedStartLine,
  });
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

// Consumes an async generator with bounded concurrency. Walking and scanning
// are pipelined: the generator advances only as fast as workers consume items,
// so the entire file list is never materialised.
//
// Returning false from fn signals that no more items are needed; the generator
// is terminated via return() and all workers drain their current task then stop.
async function withConcurrencyFromGenerator<T>(
  gen: AsyncGenerator<T>,
  concurrency: number,
  fn: (item: T) => Promise<boolean | void>
): Promise<void> {
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped) {
      const { value, done } = await gen.next();
      if (done || stopped) break;
      const result = await fn(value);
      if (result === false) {
        stopped = true;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    // Terminate the generator so it can release any in-progress I/O.
    await gen.return(undefined);
  }
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

    // Lowercase once for the entire search rather than per line.
    const normalizedQuery = query.toLowerCase();
    const matches: SearchFileMatch[] = [];
    let hasMore = false;
    const pending = new Map<number, SearchFileMatch[]>();
    let nextIndexToFlush = 0;

    const flushPending = (): boolean => {
      while (pending.has(nextIndexToFlush)) {
        const fileMatches = pending.get(nextIndexToFlush) ?? [];
        pending.delete(nextIndexToFlush);
        nextIndexToFlush += 1;

        if (matches.length >= limit) {
          if (fileMatches.length > 0) {
            hasMore = true;
            return false;
          }
          continue;
        }

        const remaining = limit - matches.length;
        if (fileMatches.length > remaining) {
          matches.push(...fileMatches.slice(0, remaining));
          hasMore = true;
          return false;
        }

        matches.push(...fileMatches);
      }

      return true;
    };

    const walker = enumerateFiles(walkFiles(this.config, this.config.rootDir, globDirPrefix));
    await withConcurrencyFromGenerator(
      walker,
      SEARCH_CONCURRENCY,
      async ({ fullPath, relativePath, index }) => {
        if (hasMore) return false;
        const finalize = (fileMatches: SearchFileMatch[] = []) => {
          pending.set(index, fileMatches);
          return flushPending();
        };

        if (matcher && !matcher.test(relativePath)) return finalize();

        // stat first (cheap metadata call) before isBinaryFile (reads 8 KB).
        try {
          const { size } = await fs.stat(fullPath);
          if (size > this.config.maxFileBytes) return finalize();
        } catch {
          return finalize();
        }

        if (await isBinaryFile(fullPath)) return finalize();

        // Single readFile call replaces open + readline streaming.
        // Files are already bounded by maxFileBytes so this is safe.
        let content: string;
        try {
          content = await fs.readFile(fullPath, "utf8");
        } catch {
          return finalize();
        }

        const lines = splitBufferedLines(content);
        const fileMatches: SearchFileMatch[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (hasMore) return false;
          if (!lines[i].toLowerCase().includes(normalizedQuery)) continue;
          fileMatches.push({
            path: relativePath,
            line: i + 1,
            snippet: lines[i].trim().slice(0, 300),
          });
          if (fileMatches.length > limit) {
            break;
          }
        }

        return finalize(fileMatches);
      }
    );

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

    let size: number;
    try {
      ({ size } = await fs.stat(resolved.fullPath));
    } catch {
      return { error: "file not found" };
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

    if (size <= MAX_BUFFERED_READ_FILE_BYTES) {
      return readFileBuffered({
        fullPath: resolved.fullPath,
        relativePath: resolved.relativePath,
        requestedStartLine,
        requestedEndLine,
        inputEndLine: input.endLine,
        maxLines,
        maxBytes,
      });
    }

    return readFileStreamed({
      fullPath: resolved.fullPath,
      relativePath: resolved.relativePath,
      requestedStartLine,
      requestedEndLine,
      inputEndLine: input.endLine,
      maxLines,
      maxBytes,
    });
  }

  async listFiles(): Promise<ListFilesResult> {
    const uniquePaths = new Set<string>();
    for await (const { relativePath } of walkFiles(this.config, this.config.rootDir, "")) {
      uniquePaths.add(relativePath);
    }
    const paths = [...uniquePaths].sort((a, b) => a.localeCompare(b));
    return { paths };
  }
}

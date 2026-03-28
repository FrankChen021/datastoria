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

function hasNullByte(buffer: Buffer): boolean {
  for (const value of buffer) {
    if (value === 0) {
      return true;
    }
  }
  return false;
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

async function collectFiles(
  config: CodeSearchConfig,
  directory: string,
  results: string[],
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
      await collectFiles(config, fullPath, results, visitedDirectories, seenFiles);
      continue;
    }

    if (entry.isFile()) {
      if (!seenFiles.has(fullPath)) {
        seenFiles.add(fullPath);
        results.push(fullPath);
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
        await collectFiles(config, realPath, results, visitedDirectories, seenFiles);
      } else if (stat.isFile()) {
        if (!seenFiles.has(realPath)) {
          seenFiles.add(realPath);
          results.push(realPath);
        }
      }
    }
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

function appendLineWithinByteLimit(
  lines: string[],
  line: string,
  currentBytes: number,
  maxBytes: number
): { bytes: number; truncated: boolean } {
  const segment = lines.length === 0 ? line : `\n${line}`;
  const segmentBuffer = Buffer.from(segment, "utf8");

  if (currentBytes + segmentBuffer.byteLength <= maxBytes) {
    lines.push(segment);
    return { bytes: currentBytes + segmentBuffer.byteLength, truncated: false };
  }

  if (currentBytes >= maxBytes) {
    return { bytes: currentBytes, truncated: true };
  }

  const remainingBytes = maxBytes - currentBytes;
  lines.push(segmentBuffer.subarray(0, remainingBytes).toString("utf8"));
  return { bytes: maxBytes, truncated: true };
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
    const matcher = input.glob?.trim() ? buildGlobMatcher(input.glob.trim()) : null;
    const files: string[] = [];
    await collectFiles(this.config, this.config.rootDir, files);

    const normalizedQuery = query.toLocaleLowerCase();
    const matches: SearchFileMatch[] = [];
    let hasMore = false;

    for (const fullPath of files) {
      const relativePath = normalizeRelativePath(path.relative(this.config.rootDir, fullPath));
      if (matcher && !matcher.test(relativePath)) {
        continue;
      }
      if (await isBinaryFile(fullPath)) {
        continue;
      }
      const stat = await fs.stat(fullPath);
      if (stat.size > this.config.maxFileBytes) {
        continue;
      }

      await streamLines(fullPath, (line, lineNumber) => {
        if (!line.toLocaleLowerCase().includes(normalizedQuery)) {
          return;
        }

        if (matches.length >= limit) {
          hasMore = true;
          return false;
        }

        matches.push({
          path: relativePath,
          line: lineNumber,
          snippet: line.trim().slice(0, 300),
        });
      });

      if (hasMore) {
        return { matches, hasMore };
      }
    }

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

    let totalLines = 0;
    await streamLines(resolved.fullPath, (_, lineNumber) => {
      totalLines = lineNumber;
    });

    const effectiveStartLine =
      totalLines === 0 ? 1 : Math.min(requestedStartLine, Math.max(totalLines - maxLines + 1, 1));
    const effectiveEndLine =
      totalLines === 0
        ? 0
        : Math.min(requestedEndLine, effectiveStartLine + maxLines - 1, totalLines);

    const selectedLines: string[] = [];
    let usedBytes = 0;
    let byteTruncated = false;

    await streamLines(resolved.fullPath, (line, lineNumber) => {
      if (lineNumber < effectiveStartLine) {
        return;
      }
      if (lineNumber > effectiveEndLine) {
        return;
      }

      const appendResult = appendLineWithinByteLimit(selectedLines, line, usedBytes, maxBytes);
      usedBytes = appendResult.bytes;
      byteTruncated = byteTruncated || appendResult.truncated;
    });

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
    const files: string[] = [];
    await collectFiles(this.config, this.config.rootDir, files);

    const uniquePaths = [
      ...new Set(
        files.map((fullPath) => normalizeRelativePath(path.relative(this.config.rootDir, fullPath)))
      ),
    ].sort((left, right) => left.localeCompare(right));

    return { paths: uniquePaths };
  }
}

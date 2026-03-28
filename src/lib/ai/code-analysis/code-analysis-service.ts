import fs from "node:fs/promises";
import path from "node:path";
import type { CodeAnalysisConfig } from "./code-analysis-config";

const BINARY_SCAN_BYTES = 8 * 1024;

export interface SearchCodeInput {
  query: string;
  glob?: string;
  limit?: number;
}

export interface SearchCodeMatch {
  path: string;
  line: number;
  snippet: string;
}

export interface SearchCodeSuccess {
  matches: SearchCodeMatch[];
  hasMore: boolean;
}

export interface SearchCodeFailure {
  error: string;
}

export type SearchCodeResult = SearchCodeSuccess | SearchCodeFailure;

export interface ReadCodeFileInput {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface ReadCodeFileSuccess {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
  truncated: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface ReadCodeFileFailure {
  error: string;
}

export type ReadCodeFileResult = ReadCodeFileSuccess | ReadCodeFileFailure;

export interface ReadCodeFileForViewerInput {
  path: string;
  viewStartLine?: number;
  viewEndLine?: number;
  targetStartLine?: number;
  targetEndLine?: number;
}

export interface ListCodeFilesSuccess {
  paths: string[];
}

export interface ListCodeFilesFailure {
  error: string;
}

export type ListCodeFilesResult = ListCodeFilesSuccess | ListCodeFilesFailure;

const VIEWER_MAX_FILE_BYTES = 256 * 1024;
const VIEWER_MAX_READ_LINES = 2000;

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
  config: CodeAnalysisConfig,
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
  config: CodeAnalysisConfig,
  directory: string,
  results: string[]
): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(config.rootDir, fullPath));
    if (shouldIgnoreRelativePath(relativePath, config.ignoredNames)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectFiles(config, fullPath, results);
      continue;
    }

    if (entry.isFile()) {
      results.push(fullPath);
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
        await collectFiles(config, realPath, results);
      } else if (stat.isFile()) {
        results.push(realPath);
      }
    }
  }
}

function capContent(content: string, maxBytes: number): { content: string; truncated: boolean } {
  const buffer = Buffer.from(content, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return { content, truncated: false };
  }

  const capped = buffer.subarray(0, maxBytes).toString("utf8");
  return { content: capped, truncated: true };
}

function buildViewerWindow(args: {
  totalLines: number;
  maxLines: number;
  viewStartLine?: number;
  viewEndLine?: number;
  targetStartLine?: number;
  targetEndLine?: number;
}): { startLine: number; endLine: number } {
  const { totalLines, maxLines, viewStartLine, viewEndLine, targetStartLine, targetEndLine } = args;

  if (totalLines <= 0) {
    return { startLine: 1, endLine: 1 };
  }

  if (viewStartLine != null || viewEndLine != null) {
    const requestedStart = Math.max(1, viewStartLine ?? 1);
    const requestedEnd = Math.max(requestedStart, viewEndLine ?? requestedStart + maxLines - 1);
    const startLine = Math.min(requestedStart, totalLines);
    const endLine = Math.min(requestedEnd, totalLines);
    return { startLine, endLine };
  }

  if (targetStartLine != null) {
    const safeTargetStart = Math.min(Math.max(1, targetStartLine), totalLines);
    const safeTargetEnd = Math.min(
      Math.max(targetEndLine ?? targetStartLine, safeTargetStart),
      totalLines
    );
    const targetSpan = Math.max(1, safeTargetEnd - safeTargetStart + 1);
    const remaining = Math.max(0, maxLines - targetSpan);
    let startLine = Math.max(1, safeTargetStart - Math.floor(remaining / 2));
    let endLine = Math.min(totalLines, safeTargetEnd + Math.ceil(remaining / 2));

    const currentSpan = endLine - startLine + 1;
    if (currentSpan < maxLines) {
      const deficit = maxLines - currentSpan;
      startLine = Math.max(1, startLine - deficit);
      endLine = Math.min(totalLines, startLine + maxLines - 1);
    }

    return { startLine, endLine };
  }

  return {
    startLine: 1,
    endLine: Math.min(totalLines, maxLines),
  };
}

export async function searchCode(
  config: CodeAnalysisConfig,
  input: SearchCodeInput
): Promise<SearchCodeResult> {
  const query = input.query.trim();
  if (!query) {
    return { error: "query is required" };
  }

  const limit = Math.min(
    Math.max(input.limit ?? config.maxSearchResults, 1),
    config.maxSearchResults
  );
  const matcher = input.glob?.trim() ? buildGlobMatcher(input.glob.trim()) : null;
  const files: string[] = [];
  await collectFiles(config, config.rootDir, files);

  const normalizedQuery = query.toLocaleLowerCase();
  const matches: SearchCodeMatch[] = [];
  let hasMore = false;

  for (const fullPath of files) {
    const relativePath = normalizeRelativePath(path.relative(config.rootDir, fullPath));
    if (matcher && !matcher.test(relativePath)) {
      continue;
    }
    if (await isBinaryFile(fullPath)) {
      continue;
    }

    const content = await fs.readFile(fullPath, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.toLocaleLowerCase().includes(normalizedQuery)) {
        continue;
      }

      if (matches.length >= limit) {
        hasMore = true;
        return { matches, hasMore };
      }

      matches.push({
        path: relativePath,
        line: index + 1,
        snippet: line.trim().slice(0, 300),
      });
    }
  }

  if (matches.length === 0) {
    return { error: "no matches found" };
  }

  return { matches, hasMore };
}

export async function readCodeFile(
  config: CodeAnalysisConfig,
  input: ReadCodeFileInput
): Promise<ReadCodeFileResult> {
  const resolved = await resolveFilePath(config, input.path);
  if ("error" in resolved) {
    return resolved;
  }

  if (await isBinaryFile(resolved.fullPath)) {
    return { error: "binary file rejected" };
  }

  const content = await fs.readFile(resolved.fullPath, "utf8");
  const allLines = content.split(/\r?\n/);
  const requestedStartLine = Math.max(input.startLine ?? 1, 1);
  const requestedEndLine =
    input.endLine != null
      ? Math.max(input.endLine, requestedStartLine)
      : requestedStartLine + config.maxReadLines - 1;
  const cappedEndLine = Math.min(
    requestedEndLine,
    requestedStartLine + config.maxReadLines - 1,
    allLines.length
  );
  const selected = allLines.slice(requestedStartLine - 1, cappedEndLine);
  const joined = selected.join("\n");
  const capped = capContent(joined, config.maxFileBytes);
  const hasMoreLines =
    input.endLine == null ? cappedEndLine < allLines.length : cappedEndLine < requestedEndLine;

  return {
    path: resolved.relativePath,
    startLine: requestedStartLine,
    endLine: cappedEndLine,
    totalLines: allLines.length,
    content: capped.content,
    truncated: capped.truncated || hasMoreLines,
    hasPrevious: requestedStartLine > 1,
    hasNext: cappedEndLine < allLines.length,
  };
}

export async function readCodeFileForViewer(
  config: CodeAnalysisConfig,
  input: ReadCodeFileForViewerInput
): Promise<ReadCodeFileResult> {
  const resolved = await resolveFilePath(config, input.path);
  if ("error" in resolved) {
    return resolved;
  }

  if (await isBinaryFile(resolved.fullPath)) {
    return { error: "binary file rejected" };
  }

  const content = await fs.readFile(resolved.fullPath, "utf8");
  const allLines = content.split(/\r?\n/);
  const { startLine, endLine } = buildViewerWindow({
    totalLines: allLines.length,
    maxLines: VIEWER_MAX_READ_LINES,
    viewStartLine: input.viewStartLine,
    viewEndLine: input.viewEndLine,
    targetStartLine: input.targetStartLine,
    targetEndLine: input.targetEndLine,
  });
  const selected = allLines.slice(startLine - 1, endLine);
  const joined = selected.join("\n");
  const capped = capContent(joined, VIEWER_MAX_FILE_BYTES);

  return {
    path: resolved.relativePath,
    startLine,
    endLine,
    totalLines: allLines.length,
    content: capped.content,
    truncated: capped.truncated,
    hasPrevious: startLine > 1,
    hasNext: endLine < allLines.length,
  };
}

export async function listCodeFilesForViewer(
  config: CodeAnalysisConfig
): Promise<ListCodeFilesResult> {
  const files: string[] = [];
  await collectFiles(config, config.rootDir, files);

  const uniquePaths = [
    ...new Set(
      files.map((fullPath) => normalizeRelativePath(path.relative(config.rootDir, fullPath)))
    ),
  ].sort((left, right) => left.localeCompare(right));

  return { paths: uniquePaths };
}

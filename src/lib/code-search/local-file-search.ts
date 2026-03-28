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

  async readFile(input: ReadFileInput): Promise<ReadFileResult> {
    const resolved = await resolveFilePath(this.config, input.path);
    if ("error" in resolved) {
      return resolved;
    }

    if (await isBinaryFile(resolved.fullPath)) {
      return { error: "binary file rejected" };
    }

    const content = await fs.readFile(resolved.fullPath, "utf8");
    const allLines = content.split(/\r?\n/);
    const maxLines = Math.max(1, input.maxLines ?? this.config.maxReadLines);
    const maxBytes = Math.max(1, input.maxBytes ?? this.config.maxFileBytes);
    const requestedStartLine = Math.max(input.startLine ?? 1, 1);
    const requestedEndLine =
      input.endLine != null
        ? Math.max(input.endLine, requestedStartLine)
        : requestedStartLine + maxLines - 1;
    const cappedEndLine = Math.min(
      requestedEndLine,
      requestedStartLine + maxLines - 1,
      allLines.length
    );
    const selected = allLines.slice(requestedStartLine - 1, cappedEndLine);
    const joined = selected.join("\n");
    const capped = capContent(joined, maxBytes);
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

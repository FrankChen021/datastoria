import "server-only";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { LocalFileCodeSearch } from "./local-file-search";
import {
  matchesSearchableSuffix,
  normalizeRelativePath,
  shouldIgnoreRelativePath,
} from "./path-filters";
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

const execFileAsync = promisify(execFile);

let ripgrepAvailablePromise: Promise<boolean> | null = null;

function buildRgFilterArgs(config: CodeSearchConfig, globPattern?: string): string[] {
  const args = ["--hidden", "--follow", "--no-ignore", "--glob-case-insensitive"];

  for (const ignoredName of config.ignoredNames) {
    args.push("--glob", `!**/${ignoredName}/**`);
  }

  for (const suffix of config.searchableSuffixes) {
    args.push("--glob", `**/*${suffix}`);
  }

  const normalizedGlob = globPattern?.trim();
  if (normalizedGlob) {
    args.push("--glob", normalizedGlob);
  }

  return args;
}

function toSnippet(value: string): string {
  return value
    .replace(/\r?\n$/, "")
    .trim()
    .slice(0, 300);
}

export async function isRipgrepAvailable(): Promise<boolean> {
  if (!ripgrepAvailablePromise) {
    ripgrepAvailablePromise = execFileAsync("rg", ["--version"])
      .then(() => true)
      .catch(() => false);
  }

  return ripgrepAvailablePromise;
}

export function resetRipgrepAvailabilityCacheForTests() {
  ripgrepAvailablePromise = null;
}

async function collectRipgrepMatches(args: {
  config: CodeSearchConfig;
  query: string;
  glob?: string;
  maxMatches: number;
}): Promise<SearchFileMatch[]> {
  return new Promise((resolve, reject) => {
    const matches: SearchFileMatch[] = [];
    const child = spawn(
      "rg",
      [
        "--json",
        "--line-number",
        "--color",
        "never",
        "--fixed-strings",
        "--ignore-case",
        "--sort",
        "path",
        ...buildRgFilterArgs(args.config, args.glob),
        args.query,
        ".",
      ],
      {
        cwd: args.config.rootDir,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdoutBuffer = "";
    let stderr = "";
    let stoppedEarly = false;
    let settled = false;

    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const resolveOnce = (value: SearchFileMatch[]) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const flushLines = () => {
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        let payload:
          | {
              type?: string;
              data?: {
                path?: { text?: string };
                line_number?: number;
                lines?: { text?: string };
              };
            }
          | undefined;

        try {
          payload = JSON.parse(line) as {
            type?: string;
            data?: {
              path?: { text?: string };
              line_number?: number;
              lines?: { text?: string };
            };
          };
        } catch (error) {
          rejectOnce(error);
          child.kill();
          return;
        }

        if (payload.type !== "match") {
          continue;
        }

        const relativePath = normalizeRelativePath(payload.data?.path?.text ?? "");
        if (!relativePath) {
          continue;
        }

        // Belt-and-suspenders: rg globs handle most filtering, but JS-layer checks
        // guard against edge cases (e.g. top-level paths that rg patterns may miss).
        if (shouldIgnoreRelativePath(relativePath, args.config.ignoredNames)) {
          continue;
        }

        if (!matchesSearchableSuffix(relativePath, args.config.searchableSuffixes)) {
          continue;
        }

        matches.push({
          path: relativePath,
          line: payload.data?.line_number ?? 1,
          snippet: toSnippet(payload.data?.lines?.text ?? ""),
        });

        if (matches.length >= args.maxMatches) {
          stoppedEarly = true;
          child.kill();
          return;
        }
      }
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString();
      flushLines();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", rejectOnce);

    child.on("close", (code) => {
      if (stdoutBuffer) {
        stdoutBuffer += "\n";
        flushLines();
      }

      if (stoppedEarly || code === 0 || code === 1) {
        resolveOnce(matches);
        return;
      }

      rejectOnce(new Error(stderr.trim() || `rg exited with code ${code ?? "unknown"}`));
    });
  });
}

export class RipgrepCodeSearch implements CodeSearch {
  private readonly fallback: LocalFileCodeSearch;

  constructor(private readonly config: CodeSearchConfig) {
    this.fallback = new LocalFileCodeSearch(config);
  }

  async searchFile(input: SearchFileInput): Promise<SearchFileResult> {
    const query = input.query.trim();
    if (!query) {
      return { error: "query is required" };
    }

    const limit = Math.min(
      Math.max(input.limit ?? this.config.maxSearchResults, 1),
      this.config.maxSearchResults
    );

    try {
      const matches = await collectRipgrepMatches({
        config: this.config,
        query,
        glob: input.glob,
        maxMatches: limit + 1,
      });

      if (matches.length === 0) {
        return { error: "no matches found" };
      }

      return {
        matches: matches.slice(0, limit),
        hasMore: matches.length > limit,
      };
    } catch (error) {
      console.warn("[code-search]", "rg searchFile failed; falling back to local-file search", {
        message: error instanceof Error ? error.message : String(error),
      });
      return this.fallback.searchFile(input);
    }
  }

  async readFile(input: ReadFileInput): Promise<ReadFileResult> {
    return this.fallback.readFile(input);
  }

  async listFiles(): Promise<ListFilesResult> {
    try {
      const { stdout } = await execFileAsync(
        "rg",
        ["--files", "--sort", "path", ...buildRgFilterArgs(this.config), "."],
        {
          cwd: this.config.rootDir,
          maxBuffer: 32 * 1024 * 1024,
        }
      );

      // Belt-and-suspenders: rg globs handle most filtering, but JS-layer checks
      // guard against edge cases (e.g. top-level paths that rg patterns may miss).
      const paths = stdout
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map(normalizeRelativePath)
        .filter((entry) => !shouldIgnoreRelativePath(entry, this.config.ignoredNames))
        .filter((entry) => matchesSearchableSuffix(entry, this.config.searchableSuffixes));

      return { paths };
    } catch (error) {
      console.warn("[code-search]", "rg listFiles failed; falling back to local-file search", {
        message: error instanceof Error ? error.message : String(error),
      });
      return this.fallback.listFiles();
    }
  }
}

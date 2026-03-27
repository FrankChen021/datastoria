import fs from "node:fs";
import path from "node:path";

export interface CodeAnalysisConfig {
  enabled: true;
  rootDir: string;
  maxFileBytes: number;
  maxReadLines: number;
  maxSearchResults: number;
  ignoredNames: string[];
}

export interface DisabledCodeAnalysisConfig {
  enabled: false;
  reason: "missing_root" | "invalid_root" | "unreadable_root" | "not_directory" | "invalid_limits";
}

export type CodeAnalysisConfigResult = CodeAnalysisConfig | DisabledCodeAnalysisConfig;

const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_READ_LINES = 250;
const DEFAULT_MAX_SEARCH_RESULTS = 20;
const DEFAULT_IGNORED_NAMES = ["dist", "build", "coverage", ".next"];
const HARD_CODED_IGNORED_NAMES = [".git", "node_modules"];

let cachedConfig: CodeAnalysisConfigResult | null = null;

function parsePositiveInteger(rawValue: string | undefined, defaultValue: number): number | null {
  if (!rawValue || rawValue.trim() === "") {
    return defaultValue;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function parseIgnoredNames(rawValue: string | undefined): string[] {
  const configured = rawValue
    ? rawValue
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : DEFAULT_IGNORED_NAMES;

  return [...new Set([...HARD_CODED_IGNORED_NAMES, ...configured])];
}

function createConfigFromEnv(env: NodeJS.ProcessEnv): CodeAnalysisConfigResult {
  const rootDir = env.CODE_ANALYSIS_ROOT_DIR?.trim();
  if (!rootDir) {
    return { enabled: false, reason: "missing_root" };
  }

  const maxFileBytes = parsePositiveInteger(
    env.CODE_ANALYSIS_MAX_FILE_BYTES,
    DEFAULT_MAX_FILE_BYTES
  );
  const maxReadLines = parsePositiveInteger(
    env.CODE_ANALYSIS_MAX_READ_LINES,
    DEFAULT_MAX_READ_LINES
  );
  const maxSearchResults = parsePositiveInteger(
    env.CODE_ANALYSIS_MAX_SEARCH_RESULTS,
    DEFAULT_MAX_SEARCH_RESULTS
  );

  if (maxFileBytes == null || maxReadLines == null || maxSearchResults == null) {
    return { enabled: false, reason: "invalid_limits" };
  }

  let normalizedRootDir: string;
  try {
    normalizedRootDir = fs.realpathSync(path.resolve(rootDir));
  } catch {
    return { enabled: false, reason: "invalid_root" };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(normalizedRootDir);
  } catch {
    return { enabled: false, reason: "unreadable_root" };
  }

  if (!stat.isDirectory()) {
    return { enabled: false, reason: "not_directory" };
  }

  return {
    enabled: true,
    rootDir: normalizedRootDir,
    maxFileBytes,
    maxReadLines,
    maxSearchResults,
    ignoredNames: parseIgnoredNames(env.CODE_ANALYSIS_IGNORE_GLOBS),
  };
}

export function getCodeAnalysisConfig(): CodeAnalysisConfigResult {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = createConfigFromEnv(process.env);
  return cachedConfig;
}

export function clearCodeAnalysisConfigCache() {
  cachedConfig = null;
}

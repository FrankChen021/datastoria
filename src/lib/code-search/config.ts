import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { CodeSearchConfig, CodeSearchConfigResult, DisabledCodeSearchConfig } from "./types";

interface BaseCodeRepoConfig {
  localDir: string;
  remote?: string;
  maxFileBytes: number;
  maxReadLines: number;
  maxSearchResults: number;
  ignoredNames: string[];
  searchableSuffixes: string[];
}

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_READ_LINES = 250;
const DEFAULT_MAX_SEARCH_RESULTS = 20;
const DEFAULT_IGNORED_NAMES = ["dist", "build", "coverage", ".next"];
const DEFAULT_SEARCHABLE_SUFFIXES = [
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".go",
  ".h",
  ".hh",
  ".hpp",
  ".hxx",
  ".inl",
  ".ipp",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".mjs",
  ".md",
  ".proto",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
];
const HARD_CODED_IGNORED_NAMES = [".git", "node_modules"];

let cachedBaseConfig:
  | BaseCodeRepoConfig
  | Exclude<DisabledCodeSearchConfig, { reason: "materialize_failed" }>
  | null = null;
let resolvedRootDir: string | null = null;
let inFlightMaterialization: Promise<void> | null = null;
let lastMaterializationFailed = false;
let retriedMaterializationAfterFailure = false;
let loggedMaterializingState = false;

function logCodeSearchInfo(message: string, details?: Record<string, unknown>) {
  console.info("[code-search]", message, details ?? {});
}

function logCodeSearchWarn(message: string, details?: Record<string, unknown>) {
  console.warn("[code-search]", message, details ?? {});
}

function getErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { error };
}

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

function parseSearchableSuffixes(rawValue: string | undefined): string[] {
  if (!rawValue || rawValue.trim() === "") {
    return DEFAULT_SEARCHABLE_SUFFIXES;
  }

  if (rawValue.trim() === "*") {
    return [];
  }

  return [
    ...new Set(
      rawValue
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ].map((suffix) => (suffix.startsWith(".") ? suffix : `.${suffix}`).toLowerCase());
}

function createBaseConfigFromEnv(
  env: NodeJS.ProcessEnv
): BaseCodeRepoConfig | Exclude<DisabledCodeSearchConfig, { reason: "materialize_failed" }> {
  const localDir = env.CLICKHOUSE_CODE_REPO_LOCAL?.trim();
  const remote = env.CLICKHOUSE_CODE_REPO_REMOTE?.trim();

  if (!localDir) {
    return { enabled: false, reason: "missing_local" };
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

  return {
    localDir,
    remote: remote || undefined,
    maxFileBytes,
    maxReadLines,
    maxSearchResults,
    ignoredNames: parseIgnoredNames(
      env.CODE_ANALYSIS_IGNORE_NAMES ?? env.CODE_ANALYSIS_IGNORE_GLOBS
    ),
    searchableSuffixes: parseSearchableSuffixes(env.CODE_ANALYSIS_SEARCH_SUFFIXES),
  };
}

function isDisabledBaseConfig(
  value: BaseCodeRepoConfig | Exclude<DisabledCodeSearchConfig, { reason: "materialize_failed" }>
): value is Exclude<DisabledCodeSearchConfig, { reason: "materialize_failed" }> {
  return "enabled" in value && value.enabled === false;
}

function getBaseConfig():
  | BaseCodeRepoConfig
  | Exclude<DisabledCodeSearchConfig, { reason: "materialize_failed" }> {
  if (cachedBaseConfig) {
    return cachedBaseConfig;
  }

  cachedBaseConfig = createBaseConfigFromEnv(process.env);
  return cachedBaseConfig;
}

export function isCodeSearchConfigured(): boolean {
  return !isDisabledBaseConfig(getBaseConfig());
}

function resolveExistingLocalDir(localDir: string): string | DisabledCodeSearchConfig {
  let normalizedRootDir: string;
  try {
    normalizedRootDir = fs.realpathSync(path.resolve(localDir));
  } catch {
    if (!fs.existsSync(localDir)) {
      return { enabled: false, reason: "missing_remote" };
    }
    return { enabled: false, reason: "invalid_local" };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(normalizedRootDir);
  } catch {
    return { enabled: false, reason: "unreadable_local" };
  }

  if (!stat.isDirectory()) {
    return { enabled: false, reason: "not_directory" };
  }

  return normalizedRootDir;
}

function createCodeSearchConfig(baseConfig: BaseCodeRepoConfig, rootDir: string): CodeSearchConfig {
  return {
    enabled: true,
    rootDir,
    maxFileBytes: baseConfig.maxFileBytes,
    maxReadLines: baseConfig.maxReadLines,
    maxSearchResults: baseConfig.maxSearchResults,
    ignoredNames: baseConfig.ignoredNames,
    searchableSuffixes: baseConfig.searchableSuffixes,
  };
}

async function cloneRepo(remote: string, localDir: string): Promise<void> {
  const parentDir = path.dirname(localDir);
  await fs.promises.mkdir(parentDir, { recursive: true });

  const tempDir = `${localDir}.tmp-${process.pid}-${Date.now()}`;

  try {
    await execFileAsync("git", ["clone", "--depth", "1", remote, tempDir], {
      timeout: 120_000,
    });
    await fs.promises.rename(tempDir, localDir);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function materializeRepo(baseConfig: BaseCodeRepoConfig): Promise<string> {
  const existingLocalDir = resolveExistingLocalDir(baseConfig.localDir);
  if (typeof existingLocalDir === "string") {
    return existingLocalDir;
  }

  if (existingLocalDir.reason !== "missing_remote") {
    throw new Error(existingLocalDir.reason);
  }

  if (!baseConfig.remote) {
    throw new Error("missing_remote");
  }

  await cloneRepo(baseConfig.remote, path.resolve(baseConfig.localDir));

  const clonedLocalDir = resolveExistingLocalDir(baseConfig.localDir);
  if (typeof clonedLocalDir !== "string") {
    throw new Error(clonedLocalDir.reason);
  }

  return clonedLocalDir;
}

function startMaterialization(baseConfig: BaseCodeRepoConfig) {
  if (resolvedRootDir || inFlightMaterialization) {
    return;
  }

  lastMaterializationFailed = false;
  loggedMaterializingState = false;
  logCodeSearchInfo("Starting background code repo clone", {
    localDir: baseConfig.localDir,
    remoteConfigured: Boolean(baseConfig.remote),
  });
  inFlightMaterialization = materializeRepo(baseConfig)
    .then((rootDir) => {
      resolvedRootDir = rootDir;
      retriedMaterializationAfterFailure = false;
      logCodeSearchInfo("Background code repo clone completed", {
        rootDir,
      });
    })
    .catch((error) => {
      lastMaterializationFailed = true;
      logCodeSearchWarn("Background code repo clone failed", {
        localDir: baseConfig.localDir,
        ...getErrorDetails(error),
      });
    })
    .finally(() => {
      inFlightMaterialization = null;
    });
}

function getReadyCodeSearchConfig(baseConfig: BaseCodeRepoConfig): CodeSearchConfigResult {
  if (resolvedRootDir) {
    return createCodeSearchConfig(baseConfig, resolvedRootDir);
  }

  const existingLocalDir = resolveExistingLocalDir(baseConfig.localDir);
  if (typeof existingLocalDir === "string") {
    resolvedRootDir = existingLocalDir;
    return createCodeSearchConfig(baseConfig, existingLocalDir);
  }

  if (existingLocalDir.reason !== "missing_remote") {
    return existingLocalDir;
  }

  if (!baseConfig.remote) {
    return { enabled: false, reason: "missing_remote" };
  }

  if (inFlightMaterialization) {
    if (!loggedMaterializingState) {
      loggedMaterializingState = true;
      logCodeSearchInfo("Code search is materializing in background; request will not block", {
        localDir: baseConfig.localDir,
      });
    }
    return { enabled: false, reason: "materializing" };
  }

  // Allow exactly one automatic retry after a failed clone. retriedMaterializationAfterFailure
  // is only reset on success, so a second consecutive failure moves permanently to
  // "materialize_failed" until clearCodeSearchConfigCache() is called.
  if (lastMaterializationFailed && !retriedMaterializationAfterFailure) {
    retriedMaterializationAfterFailure = true;
    startMaterialization(baseConfig);
    if (!loggedMaterializingState) {
      loggedMaterializingState = true;
      logCodeSearchInfo("Retrying background code repo clone after previous failure", {
        localDir: baseConfig.localDir,
      });
    }
    return { enabled: false, reason: "materializing" };
  }

  if (lastMaterializationFailed) {
    logCodeSearchWarn("Code search remains unavailable after background clone failure", {
      localDir: baseConfig.localDir,
    });
    return { enabled: false, reason: "materialize_failed" };
  }

  startMaterialization(baseConfig);
  if (!loggedMaterializingState) {
    loggedMaterializingState = true;
    logCodeSearchInfo("Code search is materializing in background; request will not block", {
      localDir: baseConfig.localDir,
    });
  }
  return { enabled: false, reason: "materializing" };
}

export function startCodeSearchMaterialization() {
  const baseConfig = getBaseConfig();
  if (isDisabledBaseConfig(baseConfig)) return;
  if (resolvedRootDir || inFlightMaterialization) return;

  const existingLocalDir = resolveExistingLocalDir(baseConfig.localDir);
  if (typeof existingLocalDir === "string") {
    resolvedRootDir = existingLocalDir;
    return;
  }

  if (baseConfig.remote) {
    startMaterialization(baseConfig);
  }
}

export async function getCodeSearchConfig(): Promise<CodeSearchConfigResult> {
  const baseConfig = getBaseConfig();
  if (isDisabledBaseConfig(baseConfig)) {
    return baseConfig;
  }

  return getReadyCodeSearchConfig(baseConfig);
}

export function clearCodeSearchConfigCache() {
  cachedBaseConfig = null;
  resolvedRootDir = null;
  inFlightMaterialization = null;
  lastMaterializationFailed = false;
  retriedMaterializationAfterFailure = false;
  loggedMaterializingState = false;
}

export function createCodeSearchEnabledConfig(
  config: Omit<CodeSearchConfig, "enabled">
): CodeSearchConfig {
  return {
    enabled: true,
    ...config,
  };
}

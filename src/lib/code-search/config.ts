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
}

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_READ_LINES = 250;
const DEFAULT_MAX_SEARCH_RESULTS = 20;
const DEFAULT_IGNORED_NAMES = ["dist", "build", "coverage", ".next"];
const HARD_CODED_IGNORED_NAMES = [".git", "node_modules"];

let cachedBaseConfig:
  | BaseCodeRepoConfig
  | Exclude<DisabledCodeSearchConfig, { reason: "materialize_failed" }>
  | null = null;
let resolvedRootDir: string | null = null;
let inFlightMaterialization: Promise<string> | null = null;

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
    ignoredNames: parseIgnoredNames(env.CODE_ANALYSIS_IGNORE_GLOBS),
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

async function ensureCodeRepoReady(baseConfig: BaseCodeRepoConfig): Promise<string> {
  if (resolvedRootDir) {
    return resolvedRootDir;
  }

  if (!inFlightMaterialization) {
    inFlightMaterialization = materializeRepo(baseConfig)
      .then((rootDir) => {
        resolvedRootDir = rootDir;
        return rootDir;
      })
      .finally(() => {
        inFlightMaterialization = null;
      });
  }

  return inFlightMaterialization;
}

export async function getCodeSearchConfig(): Promise<CodeSearchConfigResult> {
  const baseConfig = getBaseConfig();
  if (isDisabledBaseConfig(baseConfig)) {
    return baseConfig;
  }

  try {
    const rootDir = await ensureCodeRepoReady(baseConfig);
    return {
      enabled: true,
      rootDir,
      maxFileBytes: baseConfig.maxFileBytes,
      maxReadLines: baseConfig.maxReadLines,
      maxSearchResults: baseConfig.maxSearchResults,
      ignoredNames: baseConfig.ignoredNames,
    };
  } catch {
    return { enabled: false, reason: "materialize_failed" };
  }
}

export function clearCodeSearchConfigCache() {
  cachedBaseConfig = null;
  resolvedRootDir = null;
  inFlightMaterialization = null;
}

export function createCodeSearchEnabledConfig(
  config: Omit<CodeSearchConfig, "enabled">
): CodeSearchConfig {
  return {
    enabled: true,
    ...config,
  };
}

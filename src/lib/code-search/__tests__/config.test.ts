import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearCodeSearchConfigCache, getCodeSearchConfig, isCodeSearchConfigured } from "../config";

describe("getCodeSearchConfig", () => {
  const originalEnv = {
    CLICKHOUSE_CODE_REPO_REMOTE: process.env.CLICKHOUSE_CODE_REPO_REMOTE,
    CLICKHOUSE_CODE_REPO_LOCAL: process.env.CLICKHOUSE_CODE_REPO_LOCAL,
    CODE_ANALYSIS_MAX_FILE_BYTES: process.env.CODE_ANALYSIS_MAX_FILE_BYTES,
    CODE_ANALYSIS_MAX_READ_LINES: process.env.CODE_ANALYSIS_MAX_READ_LINES,
    CODE_ANALYSIS_MAX_SEARCH_RESULTS: process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS,
    CODE_ANALYSIS_INCLUDE_NAMES: process.env.CODE_ANALYSIS_INCLUDE_NAMES,
    CODE_ANALYSIS_SEARCH_SUFFIXES: process.env.CODE_ANALYSIS_SEARCH_SUFFIXES,
  };
  const tempDirs: string[] = [];

  const restoreEnvValue = (key: keyof typeof originalEnv) => {
    const value = originalEnv[key];
    if (value == null) {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  };

  afterEach(() => {
    restoreEnvValue("CLICKHOUSE_CODE_REPO_REMOTE");
    restoreEnvValue("CLICKHOUSE_CODE_REPO_LOCAL");
    restoreEnvValue("CODE_ANALYSIS_MAX_FILE_BYTES");
    restoreEnvValue("CODE_ANALYSIS_MAX_READ_LINES");
    restoreEnvValue("CODE_ANALYSIS_MAX_SEARCH_RESULTS");
    restoreEnvValue("CODE_ANALYSIS_INCLUDE_NAMES");
    restoreEnvValue("CODE_ANALYSIS_SEARCH_SUFFIXES");
    clearCodeSearchConfigCache();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("disables the feature when the local repo path is missing", async () => {
    delete process.env.CLICKHOUSE_CODE_REPO_LOCAL;

    await expect(getCodeSearchConfig()).resolves.toEqual({
      enabled: false,
      reason: "missing_local",
    });
  });

  it("returns validated config when the local repo exists", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-config-"));
    tempDirs.push(rootDir);
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = rootDir;
    process.env.CODE_ANALYSIS_MAX_FILE_BYTES = "65536";
    process.env.CODE_ANALYSIS_MAX_READ_LINES = "250";
    process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS = "20";
    process.env.CODE_ANALYSIS_INCLUDE_NAMES = "src,packages";
    process.env.CODE_ANALYSIS_SEARCH_SUFFIXES = ".ts,.tsx";

    const config = await getCodeSearchConfig();
    expect(config.enabled).toBe(true);
    if (!config.enabled) {
      return;
    }
    expect(config.rootDir).toBe(fs.realpathSync(rootDir));
    expect(config.includeNames).toEqual(["src", "packages"]);
    expect(config.searchableSuffixes).toEqual([".ts", ".tsx"]);
  });

  it("defaults includeNames to src when the env var is unset", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-config-"));
    tempDirs.push(rootDir);
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = rootDir;
    delete process.env.CODE_ANALYSIS_INCLUDE_NAMES;

    const config = await getCodeSearchConfig();
    expect(config.enabled).toBe(true);
    if (!config.enabled) {
      return;
    }

    expect(config.includeNames).toEqual(["src"]);
  });

  it("searches all names when includeNames is set to *", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-config-"));
    tempDirs.push(rootDir);
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = rootDir;
    process.env.CODE_ANALYSIS_INCLUDE_NAMES = "*";

    const config = await getCodeSearchConfig();
    expect(config.enabled).toBe(true);
    if (!config.enabled) {
      return;
    }

    expect(config.includeNames).toEqual([]);
  });

  it("disables the feature when numeric limits are invalid", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-config-"));
    tempDirs.push(rootDir);
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = rootDir;
    process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS = "0";

    await expect(getCodeSearchConfig()).resolves.toEqual({
      enabled: false,
      reason: "invalid_limits",
    });
  });

  it("reports missing remote when the local repo is missing and no remote is configured", async () => {
    const rootDir = path.join(os.tmpdir(), `code-search-config-missing-${Date.now()}`);
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = rootDir;
    delete process.env.CLICKHOUSE_CODE_REPO_REMOTE;
    delete process.env.CODE_ANALYSIS_MAX_FILE_BYTES;
    delete process.env.CODE_ANALYSIS_MAX_READ_LINES;
    delete process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS;

    await expect(getCodeSearchConfig()).resolves.toEqual({
      enabled: false,
      reason: "missing_remote",
    });
  });

  it("reports configuration availability without materializing the repo", () => {
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = "/tmp/code-search-local";
    process.env.CLICKHOUSE_CODE_REPO_REMOTE = "https://example.com/repo.git";
    delete process.env.CODE_ANALYSIS_MAX_FILE_BYTES;
    delete process.env.CODE_ANALYSIS_MAX_READ_LINES;
    delete process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS;
    clearCodeSearchConfigCache();

    expect(isCodeSearchConfigured()).toBe(true);
  });
});

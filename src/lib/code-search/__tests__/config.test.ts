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
    CODE_ANALYSIS_IGNORE_GLOBS: process.env.CODE_ANALYSIS_IGNORE_GLOBS,
    CODE_ANALYSIS_IGNORE_NAMES: process.env.CODE_ANALYSIS_IGNORE_NAMES,
  };
  const tempDirs: string[] = [];

  afterEach(() => {
    process.env.CLICKHOUSE_CODE_REPO_REMOTE = originalEnv.CLICKHOUSE_CODE_REPO_REMOTE;
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = originalEnv.CLICKHOUSE_CODE_REPO_LOCAL;
    process.env.CODE_ANALYSIS_MAX_FILE_BYTES = originalEnv.CODE_ANALYSIS_MAX_FILE_BYTES;
    process.env.CODE_ANALYSIS_MAX_READ_LINES = originalEnv.CODE_ANALYSIS_MAX_READ_LINES;
    process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS = originalEnv.CODE_ANALYSIS_MAX_SEARCH_RESULTS;
    process.env.CODE_ANALYSIS_IGNORE_GLOBS = originalEnv.CODE_ANALYSIS_IGNORE_GLOBS;
    process.env.CODE_ANALYSIS_IGNORE_NAMES = originalEnv.CODE_ANALYSIS_IGNORE_NAMES;
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
    process.env.CODE_ANALYSIS_IGNORE_NAMES = "dist,coverage";

    const config = await getCodeSearchConfig();
    expect(config.enabled).toBe(true);
    if (!config.enabled) {
      return;
    }
    expect(config.rootDir).toBe(fs.realpathSync(rootDir));
    expect(config.ignoredNames).toEqual(
      expect.arrayContaining([".git", "node_modules", "dist", "coverage"])
    );
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

  it("disables the feature when the local repo is missing and no remote is configured", async () => {
    const rootDir = path.join(os.tmpdir(), `code-search-config-missing-${Date.now()}`);
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = rootDir;
    delete process.env.CLICKHOUSE_CODE_REPO_REMOTE;
    delete process.env.CODE_ANALYSIS_MAX_FILE_BYTES;
    delete process.env.CODE_ANALYSIS_MAX_READ_LINES;
    delete process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS;

    await expect(getCodeSearchConfig()).resolves.toEqual({
      enabled: false,
      reason: "materialize_failed",
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

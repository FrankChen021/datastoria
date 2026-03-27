import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearCodeAnalysisConfigCache, getCodeAnalysisConfig } from "../code-analysis-config";

describe("getCodeAnalysisConfig", () => {
  const originalEnv = {
    CODE_ANALYSIS_ROOT_DIR: process.env.CODE_ANALYSIS_ROOT_DIR,
    CODE_ANALYSIS_MAX_FILE_BYTES: process.env.CODE_ANALYSIS_MAX_FILE_BYTES,
    CODE_ANALYSIS_MAX_READ_LINES: process.env.CODE_ANALYSIS_MAX_READ_LINES,
    CODE_ANALYSIS_MAX_SEARCH_RESULTS: process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS,
    CODE_ANALYSIS_IGNORE_GLOBS: process.env.CODE_ANALYSIS_IGNORE_GLOBS,
  };
  const tempDirs: string[] = [];

  afterEach(() => {
    process.env.CODE_ANALYSIS_ROOT_DIR = originalEnv.CODE_ANALYSIS_ROOT_DIR;
    process.env.CODE_ANALYSIS_MAX_FILE_BYTES = originalEnv.CODE_ANALYSIS_MAX_FILE_BYTES;
    process.env.CODE_ANALYSIS_MAX_READ_LINES = originalEnv.CODE_ANALYSIS_MAX_READ_LINES;
    process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS = originalEnv.CODE_ANALYSIS_MAX_SEARCH_RESULTS;
    process.env.CODE_ANALYSIS_IGNORE_GLOBS = originalEnv.CODE_ANALYSIS_IGNORE_GLOBS;
    clearCodeAnalysisConfigCache();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("disables the feature when the root dir is missing", () => {
    delete process.env.CODE_ANALYSIS_ROOT_DIR;

    expect(getCodeAnalysisConfig()).toEqual({
      enabled: false,
      reason: "missing_root",
    });
  });

  it("returns validated config when the root dir exists", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-config-"));
    tempDirs.push(rootDir);
    process.env.CODE_ANALYSIS_ROOT_DIR = rootDir;
    process.env.CODE_ANALYSIS_MAX_FILE_BYTES = "65536";
    process.env.CODE_ANALYSIS_MAX_READ_LINES = "250";
    process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS = "20";
    process.env.CODE_ANALYSIS_IGNORE_GLOBS = "dist,coverage";

    const config = getCodeAnalysisConfig();
    expect(config.enabled).toBe(true);
    if (!config.enabled) {
      return;
    }
    expect(config.rootDir).toBe(fs.realpathSync(rootDir));
    expect(config.ignoredNames).toEqual(
      expect.arrayContaining([".git", "node_modules", "dist", "coverage"])
    );
  });

  it("disables the feature when numeric limits are invalid", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-config-"));
    tempDirs.push(rootDir);
    process.env.CODE_ANALYSIS_ROOT_DIR = rootDir;
    process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS = "0";

    expect(getCodeAnalysisConfig()).toEqual({
      enabled: false,
      reason: "invalid_limits",
    });
  });
});

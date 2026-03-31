import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeSearchFactory } from "../code-search-factory";
import { clearCodeSearchConfigCache } from "../config";

describe("CodeSearchFactory", () => {
  const originalEnv = {
    CLICKHOUSE_CODE_REPO_LOCAL: process.env.CLICKHOUSE_CODE_REPO_LOCAL,
    CODE_ANALYSIS_MAX_FILE_BYTES: process.env.CODE_ANALYSIS_MAX_FILE_BYTES,
    CODE_ANALYSIS_MAX_READ_LINES: process.env.CODE_ANALYSIS_MAX_READ_LINES,
    CODE_ANALYSIS_MAX_SEARCH_RESULTS: process.env.CODE_ANALYSIS_MAX_SEARCH_RESULTS,
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
    restoreEnvValue("CLICKHOUSE_CODE_REPO_LOCAL");
    restoreEnvValue("CODE_ANALYSIS_MAX_FILE_BYTES");
    restoreEnvValue("CODE_ANALYSIS_MAX_READ_LINES");
    restoreEnvValue("CODE_ANALYSIS_MAX_SEARCH_RESULTS");
    restoreEnvValue("CODE_ANALYSIS_SEARCH_SUFFIXES");
    clearCodeSearchConfigCache();
    vi.restoreAllMocks();

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefers the ripgrep provider when rg is available", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-factory-"));
    tempDirs.push(rootDir);
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = rootDir;

    const localProvider = {
      searchFile: vi.fn(),
      readFile: vi.fn(),
      listFiles: vi.fn(),
    };
    const ripgrepProvider = {
      searchFile: vi.fn(),
      readFile: vi.fn(),
      listFiles: vi.fn(),
    };

    const factory = new CodeSearchFactory({
      isRipgrepAvailable: async () => true,
      createLocalProvider: () => localProvider,
      createRipgrepProvider: () => ripgrepProvider,
    });

    const context = await factory.getCodeSearchContext();
    expect(context?.provider).toBe(ripgrepProvider);
  });

  it("falls back to the local provider when rg is unavailable", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-factory-"));
    tempDirs.push(rootDir);
    process.env.CLICKHOUSE_CODE_REPO_LOCAL = rootDir;

    const localProvider = {
      searchFile: vi.fn(),
      readFile: vi.fn(),
      listFiles: vi.fn(),
    };
    const ripgrepProvider = {
      searchFile: vi.fn(),
      readFile: vi.fn(),
      listFiles: vi.fn(),
    };

    const factory = new CodeSearchFactory({
      isRipgrepAvailable: async () => false,
      createLocalProvider: () => localProvider,
      createRipgrepProvider: () => ripgrepProvider,
    });

    const context = await factory.getCodeSearchContext();
    expect(context?.provider).toBe(localProvider);
  });
});

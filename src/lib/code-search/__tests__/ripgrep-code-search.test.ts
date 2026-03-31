import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCodeSearchEnabledConfig } from "../config";
import { isRipgrepAvailable, RipgrepCodeSearch } from "../ripgrep-code-search";

function createConfig(rootDir: string) {
  return createCodeSearchEnabledConfig({
    rootDir: fs.realpathSync(rootDir),
    maxFileBytes: 4096,
    maxReadLines: 10,
    maxSearchResults: 5,
    includeNames: ["src", "docs"],
    searchableSuffixes: [".ts", ".md"],
  });
}

describe("RipgrepCodeSearch", () => {
  const tempDirs: string[] = [];
  let rgAvailable = false;

  beforeAll(async () => {
    rgAvailable = await isRipgrepAvailable();
    if (!rgAvailable) {
      console.info(
        "[skip] rg not found in PATH; RipgrepCodeSearch integration tests will be skipped"
      );
    }
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses ripgrep search and file listing when rg is available", async () => {
    if (!rgAvailable) {
      return;
    }

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ripgrep-code-search-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "docs"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "main.ts"), "const token = 'secret';\n");
    fs.writeFileSync(path.join(rootDir, "docs", "README.md"), "# token docs\n");
    fs.writeFileSync(path.join(rootDir, "dist", "bundle.ts"), "const token = 'ignored';\n");

    const provider = new RipgrepCodeSearch(createConfig(rootDir));
    const searchResult = await provider.searchFile({ query: "token" });
    expect(searchResult).toMatchObject({ hasMore: false });
    if ("error" in searchResult) {
      throw new Error(searchResult.error);
    }
    expect(searchResult.matches).toHaveLength(2);
    expect(searchResult.matches).toEqual(
      expect.arrayContaining([
        { path: "docs/README.md", line: 1, snippet: "# token docs" },
        { path: "src/main.ts", line: 1, snippet: "const token = 'secret';" },
      ])
    );

    const fileListResult = await provider.listFiles();
    expect(fileListResult).toEqual({
      paths: ["docs/README.md", "src/main.ts"],
    });
  });

  it("respects max file bytes during ripgrep search while keeping listFiles sorted", async () => {
    if (!rgAvailable) {
      return;
    }

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ripgrep-code-search-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "b.ts"), "const token = 'small';\n");
    fs.writeFileSync(path.join(rootDir, "src", "a.ts"), `const token = '${"x".repeat(128)}';\n`);

    const provider = new RipgrepCodeSearch(
      createCodeSearchEnabledConfig({
        rootDir: fs.realpathSync(rootDir),
        maxFileBytes: 32,
        maxReadLines: 10,
        maxSearchResults: 5,
        includeNames: ["src"],
        searchableSuffixes: [".ts"],
      })
    );

    const searchResult = await provider.searchFile({ query: "token" });
    expect(searchResult).toEqual({
      matches: [{ path: "src/b.ts", line: 1, snippet: "const token = 'small';" }],
      hasMore: false,
    });

    const fileListResult = await provider.listFiles();
    expect(fileListResult).toEqual({
      paths: ["src/a.ts", "src/b.ts"],
    });
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCodeViewerWindow } from "../code-viewer-window";
import { createCodeSearchEnabledConfig } from "../config";
import { LocalFileCodeSearch } from "../local-file-search";

function createConfig(
  rootDir: string,
  overrides?: Partial<ReturnType<typeof createCodeSearchEnabledConfig>>
) {
  return createCodeSearchEnabledConfig({
    rootDir: fs.realpathSync(rootDir),
    maxFileBytes: 1024,
    maxReadLines: 3,
    maxSearchResults: 2,
    ignoredNames: [".git", "node_modules", "dist"],
    searchableSuffixes: [".ts", ".md"],
    ...overrides,
  });
}

describe("LocalFileCodeSearch", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("searches matching source files and skips ignored directories", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "main.ts"), "const token = 'secret';\n");
    fs.writeFileSync(path.join(rootDir, "node_modules", "lib.js"), "const token = 'ignored';\n");

    const result = await new LocalFileCodeSearch(createConfig(rootDir)).searchFile({
      query: "token",
    });

    expect(result).toEqual({
      matches: [{ path: "src/main.ts", line: 1, snippet: "const token = 'secret';" }],
      hasMore: false,
    });
  });

  it("returns deterministic limited search results in file order", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "b.ts"), "const token = 'b';\n");
    fs.writeFileSync(path.join(rootDir, "src", "a.ts"), "const token = 'a';\n");
    fs.writeFileSync(path.join(rootDir, "src", "c.ts"), "const token = 'c';\n");

    const result = await new LocalFileCodeSearch(
      createConfig(rootDir, { maxSearchResults: 1 })
    ).searchFile({
      query: "token",
      limit: 1,
    });

    expect(result).toEqual({
      matches: [{ path: "src/a.ts", line: 1, snippet: "const token = 'a';" }],
      hasMore: true,
    });
  });

  it("does not lose later matches when earlier files are skipped", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "README.md"), "token in skipped file\n");
    fs.writeFileSync(path.join(rootDir, "src", "main.ts"), "const token = 'secret';\n");

    const result = await new LocalFileCodeSearch(createConfig(rootDir)).searchFile({
      query: "token",
      glob: "src/*.ts",
    });

    expect(result).toEqual({
      matches: [{ path: "src/main.ts", line: 1, snippet: "const token = 'secret';" }],
      hasMore: false,
    });
  });

  it("searches only files with allowed suffixes", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "main.ts"), "const token = 'secret';\n");
    fs.writeFileSync(path.join(rootDir, "src", "notes.txt"), "token in ignored suffix\n");

    const result = await new LocalFileCodeSearch(
      createConfig(rootDir, { searchableSuffixes: [".ts"] })
    ).searchFile({
      query: "token",
    });

    expect(result).toEqual({
      matches: [{ path: "src/main.ts", line: 1, snippet: "const token = 'secret';" }],
      hasMore: false,
    });
  });

  it("keeps glob pruning aligned with case-insensitive glob matching", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "main.ts"), "const token = 'secret';\n");

    const result = await new LocalFileCodeSearch(createConfig(rootDir)).searchFile({
      query: "token",
      glob: "SRC/*.TS",
    });

    expect(result).toEqual({
      matches: [{ path: "src/main.ts", line: 1, snippet: "const token = 'secret';" }],
      hasMore: false,
    });
  });

  it("rejects traversal attempts when reading files", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(path.join(rootDir, "app.ts"), "export const value = 1;\n");

    await expect(
      new LocalFileCodeSearch(createConfig(rootDir)).readFile({ path: "../outside.ts" })
    ).resolves.toEqual({
      error: "path rejected",
    });
  });

  it("returns bounded file windows with truncation metadata", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(
      path.join(rootDir, "app.ts"),
      ["line 1", "line 2", "line 3", "line 4", "line 5"].join("\n")
    );

    const result = await new LocalFileCodeSearch(createConfig(rootDir)).readFile({
      path: "app.ts",
      startLine: 2,
    });

    expect(result).toEqual({
      path: "app.ts",
      startLine: 2,
      endLine: 4,
      totalLines: 5,
      content: "line 2\nline 3\nline 4",
      truncated: true,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it("clamps out-of-range read windows to the end of the file", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(path.join(rootDir, "app.ts"), ["line 1", "line 2", "line 3"].join("\n"));

    const result = await new LocalFileCodeSearch(createConfig(rootDir)).readFile({
      path: "app.ts",
      startLine: 99,
    });

    expect(result).toEqual({
      path: "app.ts",
      startLine: 1,
      endLine: 3,
      totalLines: 3,
      content: "line 1\nline 2\nline 3",
      truncated: false,
      hasPrevious: false,
      hasNext: false,
    });
  });

  it("lists repo-relative files for the viewer and skips ignored directories", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src", "nested"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "nested", "main.ts"), "export const value = 1;\n");
    fs.writeFileSync(path.join(rootDir, "README.md"), "# test\n");
    fs.writeFileSync(path.join(rootDir, "dist", "bundle.js"), "ignored\n");

    const result = await new LocalFileCodeSearch(createConfig(rootDir)).listFiles();

    expect(result).toEqual({
      paths: ["README.md", "src/nested/main.ts"],
    });
  });

  it("avoids symlink directory cycles while walking files", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    const srcDir = path.join(rootDir, "src");
    const nestedDir = path.join(srcDir, "nested");
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, "main.ts"), "export const value = 1;\n");
    fs.symlinkSync(srcDir, path.join(nestedDir, "cycle"), "dir");

    const result = await new LocalFileCodeSearch(createConfig(rootDir)).listFiles();

    expect(result).toEqual({
      paths: ["src/nested/main.ts"],
    });
  });

  it("loads the first viewer window by default", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(
      path.join(rootDir, "app.ts"),
      Array.from({ length: 2105 }, (_, index) => `line ${index + 1}`).join("\n")
    );

    const viewerWindow = buildCodeViewerWindow({});
    const result = await new LocalFileCodeSearch(createConfig(rootDir)).readFile({
      path: "app.ts",
      startLine: viewerWindow.startLine,
      endLine: viewerWindow.endLine,
      maxLines: viewerWindow.maxLines,
      maxBytes: viewerWindow.maxBytes,
    });

    expect(result).toMatchObject({
      path: "app.ts",
      startLine: 1,
      endLine: 2000,
      totalLines: 2105,
      hasPrevious: false,
      hasNext: true,
    });
  });

  it("loads a focused viewer window around highlighted lines", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(
      path.join(rootDir, "app.ts"),
      Array.from({ length: 4000 }, (_, index) => `line ${index + 1}`).join("\n")
    );

    const viewerWindow = buildCodeViewerWindow({
      targetStartLine: 3000,
      targetEndLine: 3010,
    });
    const result = await new LocalFileCodeSearch(createConfig(rootDir)).readFile({
      path: "app.ts",
      startLine: viewerWindow.startLine,
      endLine: viewerWindow.endLine,
      maxLines: viewerWindow.maxLines,
      maxBytes: viewerWindow.maxBytes,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error(result.error);
    }

    expect(result).toMatchObject({
      path: "app.ts",
      totalLines: 4000,
      hasPrevious: true,
      hasNext: false,
    });
    expect(result.startLine).toBeLessThanOrEqual(3000);
    expect(result.endLine).toBeGreaterThanOrEqual(3010);
    expect(result.endLine - result.startLine + 1).toBeLessThanOrEqual(2000);
  });

  it("reads bounded windows from large text files without rejecting them", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-service-"));
    tempDirs.push(rootDir);

    const largeLine = `${"x".repeat(1024)}\n`;
    fs.writeFileSync(path.join(rootDir, "large.ts"), largeLine.repeat(11_000));

    const result = await new LocalFileCodeSearch(
      createConfig(rootDir, { maxFileBytes: 2048, maxReadLines: 2 })
    ).readFile({
      path: "large.ts",
      startLine: 1,
      maxLines: 2,
      maxBytes: 4096,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      throw new Error(result.error);
    }

    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(2);
    expect(result.totalLines).toBe(11_000);
    expect(result.hasNext).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });
});

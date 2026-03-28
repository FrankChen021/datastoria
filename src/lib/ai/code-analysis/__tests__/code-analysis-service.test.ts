import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CodeAnalysisConfig } from "../code-analysis-config";
import {
  listCodeFilesForViewer,
  readCodeFile,
  readCodeFileForViewer,
  searchCode,
} from "../code-analysis-service";

function createConfig(rootDir: string): CodeAnalysisConfig {
  return {
    enabled: true,
    rootDir: fs.realpathSync(rootDir),
    maxFileBytes: 1024,
    maxReadLines: 3,
    maxSearchResults: 2,
    ignoredNames: [".git", "node_modules", "dist"],
  };
}

describe("code-analysis-service", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("searches matching source files and skips ignored directories", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-service-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "main.ts"), "const token = 'secret';\n");
    fs.writeFileSync(path.join(rootDir, "node_modules", "lib.js"), "const token = 'ignored';\n");

    const result = await searchCode(createConfig(rootDir), { query: "token" });

    expect(result).toEqual({
      matches: [{ path: "src/main.ts", line: 1, snippet: "const token = 'secret';" }],
      hasMore: false,
    });
  });

  it("rejects traversal attempts when reading files", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(path.join(rootDir, "app.ts"), "export const value = 1;\n");

    await expect(readCodeFile(createConfig(rootDir), { path: "../outside.ts" })).resolves.toEqual({
      error: "path rejected",
    });
  });

  it("returns bounded file windows with truncation metadata", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(
      path.join(rootDir, "app.ts"),
      ["line 1", "line 2", "line 3", "line 4", "line 5"].join("\n")
    );

    const result = await readCodeFile(createConfig(rootDir), { path: "app.ts", startLine: 2 });

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

  it("lists repo-relative files for the viewer and skips ignored directories", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-service-"));
    tempDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, "src", "nested"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "src", "nested", "main.ts"), "export const value = 1;\n");
    fs.writeFileSync(path.join(rootDir, "README.md"), "# test\n");
    fs.writeFileSync(path.join(rootDir, "dist", "bundle.js"), "ignored\n");

    const result = await listCodeFilesForViewer(createConfig(rootDir));

    expect(result).toEqual({
      paths: ["README.md", "src/nested/main.ts"],
    });
  });

  it("loads the first viewer window by default", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(
      path.join(rootDir, "app.ts"),
      Array.from({ length: 2105 }, (_, index) => `line ${index + 1}`).join("\n")
    );

    const result = await readCodeFileForViewer(createConfig(rootDir), { path: "app.ts" });

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
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-service-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(
      path.join(rootDir, "app.ts"),
      Array.from({ length: 4000 }, (_, index) => `line ${index + 1}`).join("\n")
    );

    const result = await readCodeFileForViewer(createConfig(rootDir), {
      path: "app.ts",
      targetStartLine: 3000,
      targetEndLine: 3010,
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
});

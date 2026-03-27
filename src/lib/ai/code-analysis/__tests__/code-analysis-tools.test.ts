import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CodeAnalysisConfig } from "../code-analysis-config";
import { createCodeAnalysisTools } from "../code-analysis-tools";

function createConfig(rootDir: string): CodeAnalysisConfig {
  return {
    enabled: true,
    rootDir: fs.realpathSync(rootDir),
    maxFileBytes: 1024,
    maxReadLines: 5,
    maxSearchResults: 5,
    ignoredNames: [".git", "node_modules", "dist"],
  };
}

describe("createCodeAnalysisTools", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns consistent error results from search_code", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-analysis-tools-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(path.join(rootDir, "app.ts"), "const value = 1;\n");
    const tools = createCodeAnalysisTools(createConfig(rootDir));

    await expect(tools.search_code.execute?.({ query: "missing" }, {} as never)).resolves.toEqual({
      error: "no matches found",
    });
  });
});

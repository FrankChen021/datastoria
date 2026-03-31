import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCodeSearchEnabledConfig } from "@/lib/code-search/config";
import { LocalFileCodeSearch } from "@/lib/code-search/local-file-search";
import { afterEach, describe, expect, it } from "vitest";
import { createCodeSearchTools } from "./code-search-tools";

describe("createCodeSearchTools", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns consistent error results from search_file", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-search-tools-"));
    tempDirs.push(rootDir);
    fs.writeFileSync(path.join(rootDir, "app.ts"), "const value = 1;\n");
    const provider = new LocalFileCodeSearch(
      createCodeSearchEnabledConfig({
        rootDir: fs.realpathSync(rootDir),
        maxFileBytes: 1024,
        maxReadLines: 5,
        maxSearchResults: 5,
        ignoredNames: [".git", "node_modules", "dist"],
        searchableSuffixes: [".ts"],
      })
    );
    const tools = createCodeSearchTools({ provider, maxSearchResults: 5 });

    await expect(tools.search_file.execute?.({ query: "missing" }, {} as never)).resolves.toEqual({
      error: "no matches found",
    });
  });
});

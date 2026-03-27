import { describe, expect, it } from "vitest";
import {
  buildCodeFileHref,
  getFileReferenceLabel,
  parseFileReferenceToken,
  replaceFileReferenceTokens,
} from "./file-reference-utils";

describe("file-reference-utils", () => {
  it("parses file references with optional line anchors", () => {
    expect(parseFileReferenceToken("src/app/page.tsx")).toEqual({ path: "src/app/page.tsx" });
    expect(parseFileReferenceToken("src/app/page.tsx#L12")).toEqual({
      path: "src/app/page.tsx",
      startLine: 12,
    });
    expect(parseFileReferenceToken("src/app/page.tsx#L12-18")).toEqual({
      path: "src/app/page.tsx",
      startLine: 12,
      endLine: 18,
    });
  });

  it("builds compact labels and custom hrefs", () => {
    const reference = {
      path: "src/app/page.tsx",
      startLine: 12,
      endLine: 18,
    };

    expect(getFileReferenceLabel(reference)).toBe("page.tsx:12-18");
    expect(buildCodeFileHref(reference)).toBe(
      "codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18"
    );
  });

  it("rewrites file tokens into markdown links", () => {
    expect(replaceFileReferenceTokens("See [[file:src/app/page.tsx#L12-18]] for details.")).toBe(
      "See [page.tsx:12-18](codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18) for details."
    );
  });
});

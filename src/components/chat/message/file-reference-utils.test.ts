import { describe, expect, it } from "vitest";
import {
  buildCodeFileHref,
  getFileReferenceLabel,
  parseFileReferenceToken,
  replaceFileReferenceTokens,
  replaceReferenceTokens,
  replaceSkillReferenceTokens,
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
    expect(parseFileReferenceToken("Common/ErrorCodes.cpp #L50 - 90")).toEqual({
      path: "Common/ErrorCodes.cpp",
      startLine: 50,
      endLine: 90,
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

  it("rewrites screenshot-style file tokens and tolerates spacing", () => {
    expect(
      replaceFileReferenceTokens(
        "UNKNOWN_TABLE is a ClickHouse exception code [[file:Common/ErrorCodes.cpp#L50-L90]]."
      )
    ).toBe(
      "UNKNOWN_TABLE is a ClickHouse exception code [ErrorCodes.cpp:50-90](codefile://open?path=Common%2FErrorCodes.cpp&startLine=50&endLine=90)."
    );

    expect(
      replaceFileReferenceTokens(
        "See [[ FILE : Common/ErrorCodes.cpp #L50 - 90 ]] for the definition."
      )
    ).toBe(
      "See [ErrorCodes.cpp:50-90](codefile://open?path=Common%2FErrorCodes.cpp&startLine=50&endLine=90) for the definition."
    );
  });

  it("rewrites skill tokens into markdown links", () => {
    expect(
      replaceSkillReferenceTokens("[[skill:source-code-inspection|/source-code-inspection]]")
    ).toBe("[/source-code-inspection](skill://source-code-inspection)");

    expect(
      replaceSkillReferenceTokens(
        "[[skill:source-code-inspection|/source-code-inspection|Inspect source code]]"
      )
    ).toBe('[/source-code-inspection](skill://source-code-inspection "Inspect source code")');
  });

  it("rewrites mixed file and skill tokens", () => {
    expect(
      replaceReferenceTokens(
        "Use [[skill:source-code-inspection|/source-code-inspection]] and inspect [[file:src/app/page.tsx#L12-18]]."
      )
    ).toBe(
      "Use [/source-code-inspection](skill://source-code-inspection) and inspect [page.tsx:12-18](codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18)."
    );
  });
});

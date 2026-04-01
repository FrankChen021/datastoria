import { describe, expect, it } from "vitest";
import { FileLink } from "./file-link";

describe("FileLink", () => {
  it("parses file references with optional line anchors", () => {
    expect(FileLink.parse("src/app/page.tsx")).toMatchObject({
      path: "src/app/page.tsx",
      label: "page.tsx",
      href: "codefile://open?path=src%2Fapp%2Fpage.tsx",
    });
    expect(FileLink.parse("src/app/page.tsx#L12")).toMatchObject({
      path: "src/app/page.tsx",
      startLine: 12,
      label: "page.tsx:12",
      href: "codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12",
    });
    expect(FileLink.parse("src/app/page.tsx#L12-18")).toMatchObject({
      path: "src/app/page.tsx",
      startLine: 12,
      endLine: 18,
      label: "page.tsx:12-18",
      href: "codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18",
    });
    expect(FileLink.parse("Common/ErrorCodes.cpp #L50 - 90")).toMatchObject({
      path: "Common/ErrorCodes.cpp",
      startLine: 50,
      endLine: 90,
      label: "ErrorCodes.cpp:50-90",
      href: "codefile://open?path=Common%2FErrorCodes.cpp&startLine=50&endLine=90",
    });
  });

  it("stores label and href and builds viewer URLs", () => {
    const link = new FileLink({
      path: "src/app/page.tsx",
      startLine: 12,
      endLine: 18,
    });

    expect(link.label).toBe("page.tsx:12-18");
    expect(link.href).toBe("codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18");
    expect(link.toViewerUrl()).toBe(
      "/code-viewer?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18"
    );
    expect(FileLink.toViewerUrl(link.href)).toBe(
      "/code-viewer?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18"
    );
  });

  it("ignores invalid line numbers in viewer URLs", () => {
    expect(
      FileLink.toViewerUrl("codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=foo&endLine=bar")
    ).toBe("/code-viewer?path=src%2Fapp%2Fpage.tsx");

    expect(
      FileLink.toViewerUrl("codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=10&endLine=4")
    ).toBe("/code-viewer?path=src%2Fapp%2Fpage.tsx&startLine=10");
  });

  it("creates link nodes from the instance", () => {
    const link = new FileLink({
      path: "src/app/page.tsx",
      startLine: 12,
      endLine: 18,
    });

    expect(link.toLinkNode()).toEqual({
      type: "link",
      url: "codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18",
      title: null,
      children: [{ type: "text", value: "page.tsx:12-18" }],
    });
  });

  it("parses screenshot-style file references and tolerates spacing", () => {
    expect(FileLink.parse("Common/ErrorCodes.cpp#L50-L90")).toMatchObject({
      path: "Common/ErrorCodes.cpp",
      startLine: 50,
      endLine: 90,
    });

    expect(FileLink.parse(" Common/ErrorCodes.cpp #L50 - 90 ")).toMatchObject({
      path: "Common/ErrorCodes.cpp",
      startLine: 50,
      endLine: 90,
    });
  });
});

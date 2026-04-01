import { describe, expect, it } from "vitest";
import { remarkExtensions } from "./remark-extensions";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
};

function transformTree(tree: MarkdownNode): MarkdownNode {
  return remarkExtensions()(tree) ?? tree;
}

describe("remarkReferenceTokens", () => {
  it("converts skill and file tokens inside text nodes into link nodes", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value:
                "Use [[skill:source-code-inspection|/source-code-inspection]] and inspect [[file:src/app/page.tsx#L12-18]].",
            },
          ],
        },
      ],
    });

    const paragraphChildren = tree.children?.[0]?.children;
    expect(paragraphChildren).toEqual([
      { type: "text", value: "Use " },
      {
        type: "link",
        url: "skill://source-code-inspection",
        title: null,
        children: [{ type: "text", value: "/source-code-inspection" }],
      },
      { type: "text", value: " and inspect " },
      {
        type: "link",
        url: "codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=12&endLine=18",
        title: null,
        children: [{ type: "text", value: "page.tsx:12-18" }],
      },
      { type: "text", value: "." },
    ]);
  });

  it("converts inline-code wrapped reference tokens into links", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "inlineCode",
              value: " [[skill:source-code-inspection|/source-code-inspection]] ",
            },
          ],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      {
        type: "link",
        url: "skill://source-code-inspection",
        title: null,
        children: [{ type: "text", value: "/source-code-inspection" }],
      },
    ]);
  });

  it("leaves malformed tokens untouched", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "Use [[skill:source-code-inspection]]." }],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "Use " },
      { type: "text", value: "[[skill:source-code-inspection]]" },
      { type: "text", value: "." },
    ]);
  });

  it("supports escaped pipes and closing brackets in skill tokens", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value:
                "Try [[skill:source-code-inspection|/source\\|code\\]inspection|Inspect A \\| B \\] C]] now.",
            },
          ],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "Try " },
      {
        type: "link",
        url: "skill://source-code-inspection",
        title: "Inspect A | B ] C",
        children: [{ type: "text", value: "/source|code]inspection" }],
      },
      { type: "text", value: " now." },
    ]);
  });
});

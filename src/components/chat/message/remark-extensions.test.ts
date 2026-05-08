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
  it("converts CJK literal strong markers left by markdown parsing into strong nodes", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value:
                "如果你不特别指定，我下面先按**“行业龙头 + AI 受益程度”**给出一个较实用的版本。",
            },
          ],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "如果你不特别指定，我下面先按" },
      {
        type: "strong",
        children: [{ type: "text", value: "“行业龙头 + AI 受益程度”" }],
      },
      { type: "text", value: "给出一个较实用的版本。" },
    ]);
  });

  it("converts reference tokens inside CJK literal strong markers once", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "打开**中文 [[file:src/app/page.tsx#L1]]**继续。",
            },
          ],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "打开" },
      {
        type: "strong",
        children: [
          { type: "text", value: "中文 " },
          {
            type: "link",
            url: "codefile://open?path=src%2Fapp%2Fpage.tsx&startLine=1",
            title: null,
            children: [{ type: "text", value: "page.tsx:1" }],
          },
        ],
      },
      { type: "text", value: "继续。" },
    ]);
  });

  it("abandons a CJK literal strong opener after an invalid closer", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "如果**abc **中**后" }],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "如果**abc " },
      {
        type: "strong",
        children: [{ type: "text", value: "中" }],
      },
      { type: "text", value: "后" },
    ]);
  });

  it("leaves non-CJK literal strong markers untouched", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: 'Use word**"quoted"**word literally.' }],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: 'Use word**"quoted"**word literally.' },
    ]);
  });

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

  it("converts br html nodes into markdown break nodes", () => {
    const tree = transformTree({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "line 1" },
            { type: "html", value: "<br/>" },
            { type: "text", value: "line 2" },
          ],
        },
      ],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "line 1" },
      { type: "break" },
      { type: "text", value: "line 2" },
    ]);
  });
});

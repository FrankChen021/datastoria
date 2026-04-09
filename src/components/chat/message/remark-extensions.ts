import { FileLink } from "./file-link";
import { SkillLink } from "./skill-link";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
};

type ParentNode = MarkdownNode & {
  children: MarkdownNode[];
};

type TextNode = MarkdownNode & {
  type: "text";
  value: string;
};

type HtmlNode = MarkdownNode & {
  type: "html";
  value: string;
};

type BreakNode = MarkdownNode & {
  type: "break";
};

type InlineCodeNode = MarkdownNode & {
  type: "inlineCode";
  value: string;
};

type LinkNode = MarkdownNode & {
  type: "link";
  url: string;
  title?: string | null;
  children: MarkdownNode[];
};

const LINKNODE_TOKEN_PATTERN = /\[\[\s*(file|skill)\s*:\s*((?:\\.|[^\]])+?)\s*\]\]/gi;

function hasChildren(node: MarkdownNode): node is ParentNode {
  return Array.isArray(node.children);
}

function createTextNode(value: string): TextNode {
  return { type: "text", value };
}

function createBreakNode(): BreakNode {
  return { type: "break" };
}

function isBrHtmlNode(node: MarkdownNode): node is HtmlNode {
  return (
    node.type === "html" &&
    typeof node.value === "string" &&
    /^<br\s*\/?>$/i.test(node.value.trim())
  );
}

function createLinkNode(referenceType: string, tokenBody: string): LinkNode | null {
  if (referenceType === "file") {
    const reference = FileLink.parse(tokenBody);
    if (!reference) {
      return null;
    }
    return reference.toLinkNode();
  }

  if (referenceType === "skill") {
    const reference = SkillLink.parse(tokenBody);
    if (!reference) {
      return null;
    }
    return reference.toLinkNode();
  }

  return null;
}

function transformTextValue(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(LINKNODE_TOKEN_PATTERN)) {
    const index = match.index ?? -1;
    if (index < 0) {
      continue;
    }

    const fullMatch = match[0];
    const referenceType = match[1];
    const tokenBody = match[2];
    if (!fullMatch || !referenceType || !tokenBody) {
      continue;
    }

    if (index > lastIndex) {
      nodes.push(createTextNode(value.slice(lastIndex, index)));
    }

    const linkNode = createLinkNode(referenceType.toLowerCase(), tokenBody);
    if (linkNode) {
      nodes.push(linkNode);
    } else {
      nodes.push(createTextNode(fullMatch));
    }

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex === 0) {
    return [createTextNode(value)];
  }

  if (lastIndex < value.length) {
    nodes.push(createTextNode(value.slice(lastIndex)));
  }

  return nodes;
}

function transformInlineCodeValue(value: string): MarkdownNode[] {
  const trimmed = value.trim();
  const tokenMatch = LINKNODE_TOKEN_PATTERN.exec(trimmed);
  LINKNODE_TOKEN_PATTERN.lastIndex = 0;
  if (!tokenMatch || tokenMatch[0] !== trimmed) {
    return [{ type: "inlineCode", value } satisfies InlineCodeNode];
  }

  const referenceType = tokenMatch[1];
  const tokenBody = tokenMatch[2];
  if (!referenceType || !tokenBody) {
    return [{ type: "inlineCode", value } satisfies InlineCodeNode];
  }

  const referenceNode = createLinkNode(referenceType.toLowerCase(), tokenBody);
  if (!referenceNode) {
    return [{ type: "inlineCode", value } satisfies InlineCodeNode];
  }

  return [referenceNode];
}

function transformNode(node: MarkdownNode): MarkdownNode {
  if (!hasChildren(node) || node.type === "link" || node.type === "definition") {
    return node;
  }

  return {
    ...node,
    children: transformChildren(node.children),
  };
}

function transformChildren(children: MarkdownNode[]): MarkdownNode[] {
  const nextChildren: MarkdownNode[] = [];

  for (const child of children) {
    if (child.type === "text" && typeof child.value === "string") {
      nextChildren.push(...transformTextValue(child.value));
      continue;
    }

    if (child.type === "inlineCode" && typeof child.value === "string") {
      nextChildren.push(...transformInlineCodeValue(child.value));
      continue;
    }

    if (isBrHtmlNode(child)) {
      nextChildren.push(createBreakNode());
      continue;
    }

    nextChildren.push(transformNode(child));
  }

  return nextChildren;
}

export function remarkExtensions() {
  return (tree: MarkdownNode) => transformNode(tree);
}

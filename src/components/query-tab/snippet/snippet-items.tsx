import { Button } from "@/components/ui/button";
import { ChevronRight, FolderClosed } from "lucide-react";
import { useMemo, useState } from "react";
import { SnippetItem } from "./snippet-item";
import type { UISnippet } from "./ui-snippet";

interface SnippetItemsProps {
  snippets: UISnippet[];
  title?: string;
  rootName?: string;
}

type SnippetTreeNode = SnippetTreeFolderNode | SnippetTreeLeafNode;

interface SnippetTreeFolderNode {
  type: "folder";
  id: string;
  name: string;
  children: SnippetTreeNode[];
}

interface SnippetTreeLeafNode {
  type: "leaf";
  id: string;
  name: string;
  uiSnippet: UISnippet;
}

function sortTree(nodes: SnippetTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    if (node.type === "folder") {
      sortTree(node.children);
    }
  }
}

function splitCaption(caption: string) {
  const segments = caption.split("/").filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments : [caption];
}

function buildSnippetTree(snippets: UISnippet[], rootName?: string): SnippetTreeNode[] {
  const roots: SnippetTreeNode[] = [];
  const folderCache = new Map<string, SnippetTreeFolderNode>();

  const upsertFolder = (parent: SnippetTreeNode[], parentPath: string, folderName: string) => {
    const folderId = `${parentPath}/${folderName}`;
    const cached = folderCache.get(folderId);
    if (cached) {
      return cached;
    }

    const folder: SnippetTreeFolderNode = {
      type: "folder",
      id: `folder:${folderId}`,
      name: folderName,
      children: [],
    };
    parent.push(folder);
    folderCache.set(folderId, folder);
    return folder;
  };

  const rootParent = roots;
  const rootPathPrefix = rootName ? rootName : "__root__";
  const rootFolder = rootName ? upsertFolder(rootParent, "__root__", rootName) : undefined;

  for (const uiSnippet of snippets) {
    const pathSegments = splitCaption(uiSnippet.snippet.caption);
    const leafName = pathSegments[pathSegments.length - 1]!;
    const parentSegments = pathSegments.slice(0, -1);

    let currentChildren = rootFolder ? rootFolder.children : roots;
    let currentPath = rootPathPrefix;

    for (const folderName of parentSegments) {
      const folder = upsertFolder(currentChildren, currentPath, folderName);
      currentChildren = folder.children;
      currentPath = `${currentPath}/${folderName}`;
    }

    currentChildren.push({
      type: "leaf",
      id: `leaf:${uiSnippet.snippet.caption}`,
      name: leafName,
      uiSnippet,
    });
  }

  sortTree(roots);
  return roots;
}

function SnippetTreeRows({ nodes, depth }: { nodes: SnippetTreeNode[]; depth: number }) {
  return (
    <>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <FolderNode key={node.id} node={node} depth={depth} />
        ) : (
          <SnippetItem
            key={node.id}
            uiSnippet={node.uiSnippet}
            displayCaption={node.name}
            indentLevel={depth}
          />
        )
      )}
    </>
  );
}

function FolderNode({ node, depth }: { node: SnippetTreeFolderNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <Button
        variant="ghost"
        className="h-auto w-full justify-start rounded-none px-0 py-1.5 text-sm font-normal"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <ChevronRight
          className={`mr-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <FolderClosed className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </Button>
      {expanded && node.children.length > 0 && (
        <SnippetTreeRows nodes={node.children} depth={depth + 1} />
      )}
    </div>
  );
}

export function SnippetItems({ snippets, title, rootName }: SnippetItemsProps) {
  const tree = useMemo(() => buildSnippetTree(snippets, rootName), [snippets, rootName]);
  if (snippets.length === 0) return null;

  return (
    <div>
      {title && (
        <div className="px-2 py-1 text-xs font-semibold tracking-wider text-muted-foreground">
          {title}
        </div>
      )}
      <div className="space-y-0.5">
        {tree.length > 0 && <SnippetTreeRows nodes={tree} depth={0} />}
      </div>
    </div>
  );
}

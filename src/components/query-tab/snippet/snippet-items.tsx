import { Tree, type TreeDataItem } from "@/components/ui/tree";
import { Code, FileText, FolderClosed } from "lucide-react";
import { useMemo } from "react";
import { SnippetTooltipContent } from "./snippet-item";
import type { UISnippet } from "./ui-snippet";

interface SnippetItemsProps {
  userSnippets: UISnippet[];
  builtinSnippets: UISnippet[];
}

function splitCaption(caption: string) {
  const segments = caption.split("/").filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments : [caption];
}

function sortTreeData(nodes: TreeDataItem[]) {
  nodes.sort((a, b) => {
    const aIsFolder = (a.type ?? "leaf") === "folder";
    const bIsFolder = (b.type ?? "leaf") === "folder";
    if (aIsFolder !== bIsFolder) {
      return aIsFolder ? -1 : 1;
    }
    return String(a.labelContent).localeCompare(String(b.labelContent));
  });

  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      sortTreeData(node.children);
    }
  }
}

function createFolderNode(id: string, name: string): TreeDataItem {
  return {
    id,
    labelContent: name,
    search: name,
    type: "folder",
    children: [],
  };
}

function appendSnippetsToTree(
  roots: TreeDataItem[],
  folderCache: Map<string, TreeDataItem>,
  snippets: UISnippet[],
  source: "user" | "builtin",
  rootName?: string
) {
  if (snippets.length === 0) return;

  const rootPrefix = rootName ?? "__root__";

  let rootFolder: TreeDataItem | undefined;
  if (rootName) {
    rootFolder = createFolderNode(`folder:${rootPrefix}`, rootName);
    roots.push(rootFolder);
    folderCache.set(rootPrefix, rootFolder);
  }

  for (const uiSnippet of snippets) {
    const pathSegments = splitCaption(uiSnippet.snippet.caption);
    const leafName = pathSegments[pathSegments.length - 1]!;
    const parentSegments = pathSegments.slice(0, -1);

    let currentParent = rootFolder;
    let currentPath = rootPrefix;

    for (const segment of parentSegments) {
      const nextPath = `${currentPath}/${segment}`;
      let folder = folderCache.get(nextPath);

      if (!folder) {
        folder = createFolderNode(`folder:${nextPath}`, segment);
        if (currentParent) {
          currentParent.children!.push(folder);
        } else {
          roots.push(folder);
        }
        folderCache.set(nextPath, folder);
      }

      currentParent = folder;
      currentPath = nextPath;
    }

    const leafNode: TreeDataItem = {
      id: `leaf:${source}:${uiSnippet.snippet.caption}`,
      labelContent: leafName,
      search: leafName,
      type: "leaf",
      icon: uiSnippet.snippet.builtin ? FileText : Code,
      data: uiSnippet,
      nodeTooltip: <SnippetTooltipContent snippet={uiSnippet.snippet} />,
      nodeTooltipClassName: "w-[400px] max-w-none p-0",
    };

    if (currentParent) {
      currentParent.children!.push(leafNode);
    } else {
      roots.push(leafNode);
    }
  }
}

function buildSnippetTreeData(
  userSnippets: UISnippet[],
  builtinSnippets: UISnippet[]
): TreeDataItem[] {
  const roots: TreeDataItem[] = [];
  const folderCache = new Map<string, TreeDataItem>();

  appendSnippetsToTree(roots, folderCache, userSnippets, "user");
  appendSnippetsToTree(roots, folderCache, builtinSnippets, "builtin", "built_in");
  sortTreeData(roots);
  return roots;
}

export function SnippetItems({ userSnippets, builtinSnippets }: SnippetItemsProps) {
  const treeData = useMemo(
    () => buildSnippetTreeData(userSnippets, builtinSnippets),
    [userSnippets, builtinSnippets]
  );
  if (treeData.length === 0) return null;

  return (
    <div>
      {treeData.length > 0 && (
        <Tree
          data={treeData}
          className="overflow-visible px-0"
          folderIcon={FolderClosed}
          itemIcon={Code}
          expandAll
          pathSeparator="/"
          rowHeight={30}
        />
      )}
    </div>
  );
}

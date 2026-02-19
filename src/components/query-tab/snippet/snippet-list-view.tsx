import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tree, type TreeDataItem } from "@/components/ui/tree";
import { cn } from "@/lib/utils";
import { Code, FolderClosed, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QuerySnippetManager } from "./query-snippet-manager";
import { openSaveSnippetDialog } from "./save-snippet-dialog";
import type { Snippet } from "./snippet";
import { SnippetTooltipContent } from "./snippet-item";

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
  snippets: Snippet[],
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

  for (const snippet of snippets) {
    const pathSegments = splitCaption(snippet.caption);
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
      id: `leaf:${source}:${snippet.caption}`,
      labelContent: leafName,
      search: leafName,
      type: "leaf",
      icon: Code,
      data: snippet,
      labelTooltip: <SnippetTooltipContent snippet={snippet} />,
      nodeTooltipClassName: "w-[400px] max-w-none p-0",
    };

    if (currentParent) {
      currentParent.children!.push(leafNode);
    } else {
      roots.push(leafNode);
    }
  }
}

export function SnippetListView() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const manager = QuerySnippetManager.getInstance();
    setSnippets(manager.getSnippets());

    const unsubscribe = manager.subscribe(() => {
      setSnippets(manager.getSnippets());
    });

    return unsubscribe;
  }, []);

  const treeData = useMemo(() => {
    const user: Snippet[] = [];
    const builtin: Snippet[] = [];

    for (const snippet of snippets) {
      if (snippet.builtin) {
        builtin.push(snippet);
      } else {
        user.push(snippet);
      }
    }

    const roots: TreeDataItem[] = [];
    const folderCache = new Map<string, TreeDataItem>();
    appendSnippetsToTree(roots, folderCache, user, "user");
    appendSnippetsToTree(roots, folderCache, builtin, "builtin", "built_in");
    sortTreeData(roots);
    return roots;
  }, [snippets]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="relative border-b-2 flex items-center h-9">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search snippets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            "pl-8 rounded-none border-none flex-1 h-9",
            search.length > 0 ? "pr-16" : "pr-10"
          )}
        />
        {search && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-8 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
            onClick={() => setSearch("")}
            title="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
          onClick={() => openSaveSnippetDialog()}
          title="Add new snippet"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Tree
        data={treeData}
        search={search}
        showChildCount={true}
        className="h-full"
        folderIcon={FolderClosed}
        itemIcon={Code}
        expandAll
        pathSeparator="/"
        rowHeight={30}
      />
    </div>
  );
}

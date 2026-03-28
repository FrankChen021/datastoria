"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tree, type TreeDataItem } from "@/components/ui/tree";
import { BasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, FileCode2, FolderClosed, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

const ThemedSyntaxHighlighter = dynamic(
  () =>
    import("@/components/shared/themed-syntax-highlighter").then((module) => ({
      default: module.ThemedSyntaxHighlighter,
    })),
  { ssr: false }
);

function inferLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "sql":
      return "sql";
    case "yml":
    case "yaml":
      return "yaml";
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
      return "cpp";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "py":
      return "python";
    case "java":
      return "java";
    case "sh":
      return "bash";
    default:
      return "typescript";
  }
}

function buildFileTree(paths: string[]): TreeDataItem[] {
  const roots: TreeDataItem[] = [];
  const folderCache = new Map<string, TreeDataItem>();

  const ensureFolder = (segments: string[], depth: number): TreeDataItem[] => {
    if (depth >= segments.length - 1) {
      return roots;
    }

    const folderPath = segments.slice(0, depth + 1).join("/");
    let folder = folderCache.get(folderPath);

    if (!folder) {
      folder = {
        id: folderPath,
        labelContent: segments[depth],
        search: segments[depth].toLocaleLowerCase(),
        type: "folder",
        icon: FolderClosed,
        children: [],
      };
      folderCache.set(folderPath, folder);

      if (depth === 0) {
        roots.push(folder);
      } else {
        const parent = folderCache.get(segments.slice(0, depth).join("/"));
        parent?.children?.push(folder);
      }
    }

    return folder.children ?? [];
  };

  for (const filePath of paths) {
    const segments = filePath.split("/").filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    for (let depth = 0; depth < segments.length - 1; depth++) {
      ensureFolder(segments, depth);
    }

    const leafName = segments[segments.length - 1]!;
    const leaf: TreeDataItem = {
      id: filePath,
      labelContent: leafName,
      search: leafName.toLocaleLowerCase(),
      type: "leaf",
      icon: FileCode2,
      data: { path: filePath },
    };

    if (segments.length === 1) {
      roots.push(leaf);
      continue;
    }

    const parent = folderCache.get(segments.slice(0, -1).join("/"));
    parent?.children?.push(leaf);
  }

  const sortNodes = (nodes: TreeDataItem[]) => {
    nodes.sort((left, right) => {
      const leftIsFolder = (left.type ?? "leaf") === "folder";
      const rightIsFolder = (right.type ?? "leaf") === "folder";
      if (leftIsFolder !== rightIsFolder) {
        return leftIsFolder ? -1 : 1;
      }
      return String(left.id).localeCompare(String(right.id));
    });

    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(roots);
  return roots;
}

function buildViewerUrl(
  pathname: string,
  options: {
    path: string;
    highlightedStartLine?: number;
    highlightedEndLine?: number;
    viewStartLine?: number;
    viewEndLine?: number;
  }
): string {
  const searchParams = new URLSearchParams({ path: options.path });
  if (options.highlightedStartLine != null) {
    searchParams.set("startLine", String(options.highlightedStartLine));
  }
  if (options.highlightedEndLine != null) {
    searchParams.set("endLine", String(options.highlightedEndLine));
  }
  if (options.viewStartLine != null) {
    searchParams.set("viewStartLine", String(options.viewStartLine));
  }
  if (options.viewEndLine != null) {
    searchParams.set("viewEndLine", String(options.viewEndLine));
  }
  return BasePath.getURL(`${pathname}?${searchParams.toString()}`);
}

function matchFileTreeNode(node: TreeDataItem, pattern: string) {
  const normalizedPattern = pattern.trim().toLocaleLowerCase();
  const normalizedLabel = String(node.labelContent).toLocaleLowerCase();

  if (!normalizedPattern) {
    return { matches: true, start: 0, end: 0 };
  }

  const exactIndex = normalizedLabel.indexOf(normalizedPattern);
  if (exactIndex >= 0) {
    const before = exactIndex === 0 ? "" : normalizedLabel[exactIndex - 1]!;
    const afterIndex = exactIndex + normalizedPattern.length;
    const after = afterIndex >= normalizedLabel.length ? "" : normalizedLabel[afterIndex]!;
    const isBoundaryBefore = before === "" || /[^a-z0-9]/.test(before);
    const isBoundaryAfter = after === "" || /[^a-z0-9]/.test(after);

    if (isBoundaryBefore || isBoundaryAfter) {
      return {
        matches: true,
        start: exactIndex,
        end: exactIndex + normalizedPattern.length,
      };
    }
  }

  return {
    matches: false,
    start: -1,
    end: -1,
  };
}

function CodeBlock({
  language,
  content,
  startLine,
  highlightedStartLine,
  highlightedEndLine,
  autoScrollToHighlight,
  scrollContainerRef,
  topSlot,
  bottomSlot,
}: {
  language: string;
  content: string;
  startLine: number;
  highlightedStartLine?: number;
  highlightedEndLine?: number;
  autoScrollToHighlight: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  topSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const effectiveHighlightEndLine = highlightedEndLine ?? highlightedStartLine;

  useEffect(() => {
    if (highlightedStartLine == null || !autoScrollToHighlight) {
      return;
    }

    const container = containerRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!container || !scrollContainer) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) {
        return;
      }

      const target = container.querySelector<HTMLElement>(
        `[data-code-line="${highlightedStartLine}"]`
      );
      if (!target) {
        attempts += 1;
        if (attempts < 20) {
          window.requestAnimationFrame(tryScroll);
        }
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const nextTop =
        scrollContainer.scrollTop +
        (targetRect.top - containerRect.top) -
        scrollContainer.clientHeight / 2 +
        targetRect.height / 2;

      scrollContainer.scrollTo({
        top: Math.max(0, nextTop),
        behavior: "smooth",
      });
    };

    const frameId = window.requestAnimationFrame(tryScroll);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    autoScrollToHighlight,
    highlightedStartLine,
    highlightedEndLine,
    content,
    scrollContainerRef,
  ]);

  return (
    <div ref={containerRef} className="min-w-0">
      {topSlot ? <div className="px-5 pt-3">{topSlot}</div> : null}
      <ThemedSyntaxHighlighter
        language={language}
        showLineNumbers={true}
        startingLineNumber={startLine}
        wrapLines={true}
        lineProps={(lineNumber: number) => ({
          "data-code-line": String(lineNumber),
          style:
            highlightedStartLine != null &&
            lineNumber >= highlightedStartLine &&
            lineNumber <= (effectiveHighlightEndLine ?? highlightedStartLine)
              ? {
                  display: "block",
                  backgroundColor: "rgba(250, 204, 21, 0.12)",
                }
              : { display: "block" },
        })}
        customStyle={{
          margin: 0,
          padding: "1rem 1.25rem",
          minWidth: "100%",
          fontSize: "0.9rem",
        }}
      >
        {content}
      </ThemedSyntaxHighlighter>
      {bottomSlot ? <div className="px-5 pb-3">{bottomSlot}</div> : null}
    </div>
  );
}

export function CodeViewerContent({
  filePaths,
  path,
  content,
  startLine,
  endLine,
  totalLines,
  highlightedStartLine,
  highlightedEndLine,
  autoScrollToHighlight,
  truncated,
  hasPrevious,
  hasNext,
}: {
  filePaths: string[];
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  highlightedStartLine?: number;
  highlightedEndLine?: number;
  autoScrollToHighlight: boolean;
  truncated: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const codeScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const language = inferLanguage(path);
  const treeData = useMemo(() => buildFileTree(filePaths), [filePaths]);
  const effectiveHighlightEndLine = highlightedEndLine ?? highlightedStartLine;
  const windowSize = endLine - startLine + 1;

  const navigateToWindow = (nextWindowStart: number, nextWindowEnd: number) => {
    startTransition(() => {
      router.push(
        buildViewerUrl(pathname, {
          path,
          highlightedStartLine,
          highlightedEndLine,
          viewStartLine: nextWindowStart,
          viewEndLine: nextWindowEnd,
        })
      );
    });
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-background text-foreground">
      <PanelGroup direction="horizontal" className="h-full w-full min-w-0">
        <Panel defaultSize={24} minSize={16} maxSize={40} className="min-w-0 bg-background">
          <div className="flex h-full min-h-0 flex-col border-r">
            <div className="relative flex h-9 items-center border-b bg-background">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={cn("h-9 rounded-none border-0 pl-11 pr-9 focus-visible:ring-0")}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Clear file search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-2">
              {treeData.length > 0 ? (
                <Tree
                  data={treeData}
                  className="h-full"
                  search={search}
                  selectedItemId={path}
                  initialSlelectedItemId={path}
                  pathSeparator="/"
                  rowHeight={30}
                  folderIcon={FolderClosed}
                  itemIcon={FileCode2}
                  showChildCount={true}
                  searchOptions={{
                    includeMatchedNodeChildren: false,
                    match: matchFileTreeNode,
                  }}
                  onSelectChange={(item) => {
                    const nextPath =
                      item?.type === "leaf" &&
                      item.data &&
                      typeof item.data === "object" &&
                      "path" in item.data &&
                      typeof (item.data as { path?: unknown }).path === "string"
                        ? (item.data as { path: string }).path
                        : undefined;

                    if (!nextPath || nextPath === path) {
                      return;
                    }

                    startTransition(() => {
                      router.push(
                        buildViewerUrl(pathname, {
                          path: nextPath,
                        })
                      );
                    });
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  No files match "{search}"
                </div>
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-0.5 cursor-col-resize bg-border transition-colors hover:bg-border/80" />

        <Panel defaultSize={76} minSize={40} className="min-w-0 bg-background">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-9 items-center border-b px-5">
              <div className="truncate font-mono text-sm text-muted-foreground">{path}</div>
            </div>

            <div ref={codeScrollContainerRef} className="min-h-0 flex-1 overflow-auto">
              <CodeBlock
                language={language}
                content={content}
                startLine={startLine}
                highlightedStartLine={highlightedStartLine}
                highlightedEndLine={highlightedEndLine}
                autoScrollToHighlight={autoScrollToHighlight}
                scrollContainerRef={codeScrollContainerRef}
                topSlot={
                  hasPrevious ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigateToWindow(Math.max(1, startLine - windowSize), endLine)}
                    >
                      <ChevronUp className="mr-1 h-4 w-4" />
                      Load previous lines
                    </Button>
                  ) : undefined
                }
                bottomSlot={
                  hasNext || truncated ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {hasNext ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigateToWindow(startLine, Math.min(totalLines, endLine + windowSize))
                          }
                        >
                          <ChevronDown className="mr-1 h-4 w-4" />
                          Load next lines
                        </Button>
                      ) : null}
                      {truncated ? (
                        <span className="text-sm text-amber-700 dark:text-amber-300">
                          Large window content was byte-truncated.
                        </span>
                      ) : null}
                    </div>
                  ) : undefined
                }
              />
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

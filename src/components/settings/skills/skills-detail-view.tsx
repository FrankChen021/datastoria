"use client";

import { MessageMarkdownSql } from "@/components/chat/message/message-markdown-sql";
import { useRuntimeConfig } from "@/components/runtime-config-provider";
import FloatingProgressBar from "@/components/shared/floating-progress-bar";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SkillDetailResponse, SkillResourceResponse } from "@/lib/ai/skills/skill-provider";
import { BasePath } from "@/lib/base-path";
import matter from "gray-matter";
import {
  ArrowLeft,
  ChevronRight,
  File,
  FileText,
  Folder,
  Loader2,
  Plus,
  Save,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import remarkGfm from "remark-gfm";

interface SkillsDetailViewProps {
  skillId: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Directory tree helpers
// ---------------------------------------------------------------------------

interface DirNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DirNode[];
}

function buildDirTree(paths: string[]): DirNode[] {
  const root: DirNode = { name: "", path: "", isDir: true, children: [] };

  for (const p of paths) {
    const parts = p.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existing = current.children.find((c) => c.name === part);
      if (existing) {
        current = existing;
      } else {
        const nodePath = parts.slice(0, i + 1).join("/");
        const node: DirNode = {
          name: part,
          path: nodePath,
          isDir: !isLast,
          children: [],
        };
        current.children.push(node);
        // Sort: dirs first, then files
        current.children.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        if (!isLast) {
          current = node;
        }
      }
    }
  }

  return root.children;
}

interface DirNodeRowProps {
  node: DirNode;
  depth?: number;
  selectedPath: string | null;
  onFileClick: (path: string) => void;
}

function DirNodeRow({ node, depth = 0, selectedPath, onFileClick }: DirNodeRowProps) {
  const [expanded, setExpanded] = useState(true);

  if (node.isDir) {
    return (
      <div>
        <button
          className="flex items-center gap-1 w-full text-left py-0.5 hover:bg-accent/40 rounded px-1"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          onClick={() => setExpanded((e) => !e)}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <DirNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onFileClick={onFileClick}
            />
          ))}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <button
      className={`flex items-center gap-1 w-full text-left py-0.5 rounded px-1 transition-colors ${
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"
      }`}
      style={{ paddingLeft: `${depth * 14 + 4 + 16}px` }}
      onClick={() => onFileClick(node.path)}
    >
      <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs truncate">{node.name}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer (strips frontmatter before rendering)
// ---------------------------------------------------------------------------

function SkillMarkdownRenderer({ raw }: { raw: string }) {
  // Strip frontmatter only if the content begins with ---
  const { content } = raw.trimStart().startsWith("---") ? matter(raw) : { content: raw };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2.5 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-sm mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => (
          <ul className="text-sm list-disc ml-4 mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="text-sm list-decimal ml-4 mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ className, children, ...props }) => {
          if (className === "language-sql") {
            return (
              <MessageMarkdownSql
                className="pb-2"
                code={String(children).replace(/\n$/, "")}
                language="sql"
                showExecuteButton={false}
                showLineNumbers={false}
                expandable={false}
              />
            );
          }
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-muted rounded p-3 overflow-x-auto my-2">
                <code className="text-xs font-mono">{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono" {...props}>
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted pl-3 text-muted-foreground italic my-2">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border px-2 py-1 bg-muted font-semibold text-left">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
        hr: () => <hr className="my-3 border-border" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function buildSkillDetailUrl(skillId: string, includeDraft: boolean): string {
  const query = includeDraft ? "?includeDraft=1" : "";
  return BasePath.getURL(`/api/ai/skills/${encodeURIComponent(skillId)}${query}`);
}

function buildSkillResourceUrl(
  skillId: string,
  resourcePath: string,
  includeDraft: boolean
): string {
  const searchParams = new URLSearchParams({ path: resourcePath });
  if (includeDraft) {
    searchParams.set("includeDraft", "1");
  }
  return BasePath.getURL(`/api/ai/skills/${encodeURIComponent(skillId)}/resource?${searchParams}`);
}

function normalizeReferencePath(input: string): string {
  const trimmed = input.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("references/") ? trimmed : `references/${trimmed}`;
}

function isSafeReferencePath(input: string): boolean {
  if (!input || input === "SKILL.md") {
    return false;
  }
  if (!input.startsWith("references/")) {
    return false;
  }
  if (input.includes("../") || input.includes("/../") || input.endsWith("/..")) {
    return false;
  }
  return !input.endsWith("/");
}

async function readJsonError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Main detail view
// ---------------------------------------------------------------------------

export function SkillsDetailView({ skillId, onBack }: SkillsDetailViewProps) {
  const { allowEditSkill } = useRuntimeConfig();
  const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Left panel: null = SKILL.md, string = resource path
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [resourceCache, setResourceCache] = useState<Record<string, SkillResourceResponse>>({});
  const [resourceDrafts, setResourceDrafts] = useState<Record<string, string>>({});
  const [resourceLoadingPath, setResourceLoadingPath] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isNewReferenceOpen, setIsNewReferenceOpen] = useState(false);
  const [newReferencePath, setNewReferencePath] = useState("");
  const [newReferenceContent, setNewReferenceContent] = useState("");
  const [newReferenceError, setNewReferenceError] = useState<string | null>(null);

  const [renderMode, setRenderMode] = useState<"rendered" | "raw">("rendered");
  const detailRequestIdRef = useRef(0);
  const resourceRequestIdRef = useRef(0);
  const resourceAbortControllerRef = useRef<AbortController | null>(null);

  // Load skill detail
  useEffect(() => {
    const requestId = ++detailRequestIdRef.current;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setDetail(null);
    setSelectedFile(null);
    setResourceCache({});
    setResourceDrafts({});
    setResourceError(null);
    setSaveError(null);
    setSaveInfo(null);
    setResourceLoadingPath(null);
    resourceAbortControllerRef.current?.abort();
    resourceAbortControllerRef.current = null;

    fetch(buildSkillDetailUrl(skillId, allowEditSkill), {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SkillDetailResponse>;
      })
      .then((data) => {
        if (detailRequestIdRef.current !== requestId) return;
        setDetail(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || detailRequestIdRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : "Failed to load skill");
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [allowEditSkill, skillId]);

  const fetchResource = useCallback(
    async (resourcePath: string): Promise<SkillResourceResponse> => {
      const response = await fetch(buildSkillResourceUrl(skillId, resourcePath, allowEditSkill));
      if (!response.ok) {
        throw new Error(await readJsonError(response, `HTTP ${response.status}`));
      }
      return (await response.json()) as SkillResourceResponse;
    },
    [allowEditSkill, skillId]
  );

  // Load a resource file when a tree node is clicked
  const handleFileClick = useCallback(
    (resourcePath: string) => {
      if (resourceDrafts[resourcePath] !== undefined || resourceCache[resourcePath]) {
        resourceRequestIdRef.current += 1;
        resourceAbortControllerRef.current?.abort();
        resourceAbortControllerRef.current = null;
        setSelectedFile(resourcePath);
        setResourceError(null);
        setResourceLoadingPath(null);
        setRenderMode("raw");
        return;
      }

      const requestId = ++resourceRequestIdRef.current;
      resourceAbortControllerRef.current?.abort();
      const controller = new AbortController();
      resourceAbortControllerRef.current = controller;

      setSelectedFile(resourcePath);
      setResourceError(null);
      setResourceLoadingPath(resourcePath);
      setRenderMode("raw");

      fetch(buildSkillResourceUrl(skillId, resourcePath, allowEditSkill), {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<SkillResourceResponse>;
        })
        .then((data) => {
          if (resourceRequestIdRef.current !== requestId) return;
          setResourceCache((prev) => ({ ...prev, [resourcePath]: data }));
          setResourceLoadingPath(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || resourceRequestIdRef.current !== requestId) return;
          setResourceError(err instanceof Error ? err.message : "Failed to load file");
          setResourceLoadingPath(null);
        });
    },
    [allowEditSkill, resourceCache, resourceDrafts, skillId]
  );

  // Click SKILL.md → go back to main content
  const handleSkillMdClick = useCallback(() => {
    resourceRequestIdRef.current += 1;
    resourceAbortControllerRef.current?.abort();
    resourceAbortControllerRef.current = null;
    setSelectedFile(null);
    setResourceError(null);
    setResourceLoadingPath(null);
    setRenderMode("rendered");
  }, []);

  const reloadDetail = useCallback(async () => {
    const response = await fetch(buildSkillDetailUrl(skillId, allowEditSkill));
    if (!response.ok) {
      throw new Error(await readJsonError(response, `HTTP ${response.status}`));
    }
    const data = (await response.json()) as SkillDetailResponse;
    setDetail(data);
    return data;
  }, [allowEditSkill, skillId]);

  const ensureResourceContent = useCallback(
    async (resourcePath: string): Promise<string> => {
      if (resourceDrafts[resourcePath] !== undefined) {
        return resourceDrafts[resourcePath];
      }
      if (resourceCache[resourcePath]) {
        return resourceCache[resourcePath].content;
      }
      const data = await fetchResource(resourcePath);
      setResourceCache((prev) => ({ ...prev, [resourcePath]: data }));
      return data.content;
    },
    [fetchResource, resourceCache, resourceDrafts]
  );

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!detail) {
      return false;
    }

    setIsSavingDraft(true);
    setSaveError(null);
    setSaveInfo(null);

    try {
      const effectiveResourcePaths = Array.from(
        new Set([...detail.resourcePaths, ...Object.keys(resourceDrafts)])
      ).sort();
      const resources = await Promise.all(
        effectiveResourcePaths.map(async (path) => ({
          path,
          content: await ensureResourceContent(path),
        }))
      );

      const response = await fetch(buildSkillDetailUrl(skillId, false), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: detail.content,
          resources,
          ...(detail.source === "database" && detail.scope ? { scope: detail.scope } : {}),
          ...(detail.version ? { version: detail.version } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, "Failed to save draft"));
      }

      setResourceDrafts({});
      await reloadDetail();
      if (selectedFile) {
        const refreshed = await fetchResource(selectedFile);
        setResourceCache((prev) => ({ ...prev, [selectedFile]: refreshed }));
      }
      setSaveInfo("Draft saved");
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save draft");
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  }, [
    detail,
    ensureResourceContent,
    fetchResource,
    reloadDetail,
    resourceDrafts,
    selectedFile,
    skillId,
  ]);

  const publishSkill = useCallback(async () => {
    if (!detail) {
      return;
    }

    setIsPublishing(true);
    setSaveError(null);
    setSaveInfo(null);

    try {
      if (Object.keys(resourceDrafts).length > 0) {
        const saved = await saveDraft();
        if (!saved) {
          return;
        }
      }

      const response = await fetch(buildSkillDetailUrl(skillId, false), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "publish" }),
      });
      if (!response.ok) {
        throw new Error(await readJsonError(response, "Failed to publish skill"));
      }

      await reloadDetail();
      if (selectedFile) {
        const refreshed = await fetchResource(selectedFile);
        setResourceCache((prev) => ({ ...prev, [selectedFile]: refreshed }));
      }
      setSaveInfo("Skill published");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to publish skill");
    } finally {
      setIsPublishing(false);
    }
  }, [detail, fetchResource, reloadDetail, resourceDrafts, saveDraft, selectedFile, skillId]);

  const createReference = useCallback(() => {
    const normalizedPath = normalizeReferencePath(newReferencePath);
    const existingPaths = new Set(detail ? detail.resourcePaths : []);
    Object.keys(resourceDrafts).forEach((path) => existingPaths.add(path));

    if (!isSafeReferencePath(normalizedPath)) {
      setNewReferenceError("Reference path must be under references/ and stay within the skill.");
      return;
    }
    if (existingPaths.has(normalizedPath)) {
      setNewReferenceError("A reference with this path already exists.");
      return;
    }

    setResourceDrafts((prev) => ({ ...prev, [normalizedPath]: newReferenceContent }));
    setSelectedFile(normalizedPath);
    setResourceError(null);
    setResourceLoadingPath(null);
    setSaveError(null);
    setSaveInfo(null);
    setRenderMode("raw");
    setIsNewReferenceOpen(false);
    setNewReferencePath("");
    setNewReferenceContent("");
    setNewReferenceError(null);
  }, [detail, newReferenceContent, newReferencePath, resourceDrafts]);

  // Derived display state
  const hasUnsavedReferenceChanges = Object.keys(resourceDrafts).length > 0;
  const displayedResourcePaths = detail
    ? Array.from(new Set([...detail.resourcePaths, ...Object.keys(resourceDrafts)])).sort()
    : [];
  const selectedCachedResource = selectedFile ? resourceCache[selectedFile] : null;
  const selectedDraftResource = selectedFile ? resourceDrafts[selectedFile] : undefined;
  const isMarkdownFile =
    selectedFile === null || selectedFile.endsWith(".md") || selectedFile.endsWith(".MD");
  const isJsonFile = selectedFile?.endsWith(".json") || selectedFile?.endsWith(".JSON");
  const isReferenceFile = selectedFile?.startsWith("references/") ?? false;
  const canEditSelectedReference = allowEditSkill && isReferenceFile;
  const displayedFilename = selectedFile === null ? "SKILL.md" : selectedFile.split("/").pop()!;
  const currentContent =
    selectedFile === null
      ? (detail?.content ?? "")
      : (selectedDraftResource ?? selectedCachedResource?.content ?? "");
  const currentState =
    selectedFile === null
      ? (detail?.state ?? null)
      : selectedDraftResource !== undefined
        ? "draft"
        : (selectedCachedResource?.state ?? null);
  const dirTree = buildDirTree(displayedResourcePaths);
  const canPublish =
    !isSavingDraft &&
    !isPublishing &&
    !!detail &&
    (detail.state === "draft" || hasUnsavedReferenceChanges);
  const showEditingHint = allowEditSkill && detail?.source === "disk";
  const resourceLoading = selectedFile !== null && resourceLoadingPath === selectedFile;

  return (
    <div className="h-full flex flex-col relative">
      <FloatingProgressBar show={loading || resourceLoading || isSavingDraft || isPublishing} />

      <Dialog open={isNewReferenceOpen} onOpenChange={setIsNewReferenceOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>New Reference</DialogTitle>
            <DialogDescription>
              Add a new reference file under <code>references/</code>.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-reference-path">Reference path</FieldLabel>
              <Input
                id="new-reference-path"
                value={newReferencePath}
                onChange={(event) => {
                  setNewReferencePath(event.target.value);
                  if (newReferenceError) {
                    setNewReferenceError(null);
                  }
                }}
                placeholder="47.md"
              />
              <p className="text-xs text-muted-foreground">Saved under references/</p>
            </Field>
            <Field>
              <FieldLabel htmlFor="new-reference-content">Initial content</FieldLabel>
              <Textarea
                id="new-reference-content"
                value={newReferenceContent}
                onChange={(event) => setNewReferenceContent(event.target.value)}
                className="min-h-[220px] font-mono text-xs"
                placeholder="# Error 47&#10;&#10;Describe the cause, symptoms, and remediation."
              />
            </Field>
          </FieldGroup>
          {newReferenceError ? (
            <p className="text-sm text-destructive">{newReferenceError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewReferenceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createReference}>
              <Plus className="h-4 w-4" />
              Create Reference
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : detail ? (
          <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm truncate">{detail.name}</span>
              <Badge variant="secondary" className="text-xs px-1.5 py-0 shrink-0 capitalize">
                {detail.source}
              </Badge>
              {detail.state && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0 capitalize">
                  {detail.state}
                </Badge>
              )}
              {detail.version && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 shrink-0">
                  v{detail.version}
                </Badge>
              )}
              {detail.author && (
                <span className="text-xs text-muted-foreground shrink-0">
                  author: {detail.author}
                </span>
              )}
            </div>
            {allowEditSkill ? (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveDraft}
                  disabled={isSavingDraft || isPublishing || !hasUnsavedReferenceChanges}
                >
                  {isSavingDraft ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Draft
                </Button>
                <Button size="sm" onClick={publishSkill} disabled={!canPublish}>
                  {isPublishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Publish
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex-1 px-4 py-4 space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : detail ? (
        <PanelGroup direction="horizontal" className="flex-1 overflow-hidden min-h-0">
          {/* ── Left panel — file content ── */}
          <Panel defaultSize={70} minSize={20} className="flex flex-col overflow-hidden">
            <div className="flex h-10 flex-shrink-0 items-center justify-between gap-2 border-b px-4">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground truncate">
                  {displayedFilename}
                </span>
                {currentState && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 capitalize">
                    {currentState}
                  </Badge>
                )}
              </div>
              <ToggleGroup
                type="single"
                value={renderMode}
                onValueChange={(v) => v && setRenderMode(v as "rendered" | "raw")}
                size="sm"
                variant="outline"
                className={
                  isMarkdownFile && !canEditSelectedReference
                    ? undefined
                    : "invisible pointer-events-none"
                }
              >
                <ToggleGroupItem value="rendered" className="text-xs h-6 px-2">
                  Rendered
                </ToggleGroupItem>
                <ToggleGroupItem value="raw" className="text-xs h-6 px-2">
                  Raw
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-4 py-3">
                {saveError ? <p className="mb-3 text-sm text-destructive">{saveError}</p> : null}
                {saveInfo ? <p className="mb-3 text-sm text-muted-foreground">{saveInfo}</p> : null}
                {showEditingHint ? (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Saving references here creates a database draft override for this built-in
                    skill.
                  </p>
                ) : null}
                {resourceLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-4/6" />
                  </div>
                ) : resourceError ? (
                  <p className="text-sm text-destructive">{resourceError}</p>
                ) : canEditSelectedReference ? (
                  <div className="space-y-3">
                    <Textarea
                      value={currentContent}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setResourceDrafts((prev) => ({ ...prev, [selectedFile!]: nextValue }));
                        setSaveError(null);
                        setSaveInfo(null);
                      }}
                      className="min-h-[60vh] font-mono text-xs leading-relaxed"
                    />
                    <p className="text-xs text-muted-foreground">
                      Changes are staged locally until you save a draft.
                    </p>
                  </div>
                ) : isJsonFile ? (
                  <ThemedSyntaxHighlighter
                    language="json"
                    customStyle={{
                      margin: 0,
                      padding: 0,
                      fontSize: "0.75rem",
                      background: "transparent",
                    }}
                    showLineNumbers={false}
                  >
                    {currentContent}
                  </ThemedSyntaxHighlighter>
                ) : isMarkdownFile && renderMode === "rendered" ? (
                  <SkillMarkdownRenderer raw={currentContent} />
                ) : (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                    {currentContent}
                  </pre>
                )}
              </div>
            </ScrollArea>
          </Panel>

          <PanelResizeHandle className="w-0.5 bg-border hover:bg-primary/40 active:bg-primary/60 cursor-col-resize transition-colors" />

          {/* ── Right panel — directory tree ── */}
          <Panel defaultSize={30} minSize={20} className="flex flex-col overflow-hidden">
            <div className="flex h-10 flex-shrink-0 items-center justify-between gap-2 border-b px-3">
              <span className="text-xs font-medium text-muted-foreground">Files</span>
              {allowEditSkill ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setNewReferenceError(null);
                    setIsNewReferenceOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Reference
                </Button>
              ) : null}
            </div>

            <ScrollArea className="flex-1">
              <div className="px-2 py-2">
                {/* SKILL.md root entry */}
                <button
                  className={`flex items-center gap-1 w-full text-left py-0.5 rounded px-1 transition-colors ${
                    selectedFile === null
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/40"
                  }`}
                  onClick={handleSkillMdClick}
                >
                  <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-xs font-medium">SKILL.md</span>
                </button>

                {dirTree.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 mt-2">No additional files</p>
                ) : (
                  dirTree.map((node) => (
                    <DirNodeRow
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedPath={selectedFile}
                      onFileClick={handleFileClick}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </Panel>
        </PanelGroup>
      ) : null}
    </div>
  );
}

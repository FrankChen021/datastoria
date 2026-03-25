"use client";

import { useRuntimeConfig } from "@/components/runtime-config-provider";
import FloatingProgressBar from "@/components/shared/floating-progress-bar";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Dialog as SharedDialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { SkillDetailResponse, SkillResourceResponse } from "@/lib/ai/skills/skill-provider";
import { BasePath } from "@/lib/base-path";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { NewReferenceForm, type NewReferenceFormController } from "./detail/new-reference-form";
import { SkillDetailHeader } from "./detail/skill-detail-header";
import { buildDirTree } from "./detail/skill-detail-tree";
import { SkillFileHeader } from "./detail/skill-file-header";
import { SkillFileTreePanel } from "./detail/skill-file-tree-panel";
import { SkillMarkdownRenderer } from "./detail/skill-markdown-renderer";

interface SkillsDetailViewProps {
  skillId: string;
  onBack: () => void;
}

function buildSkillDetailUrl(skillId: string): string {
  return BasePath.getURL(`/api/ai/skills/${encodeURIComponent(skillId)}`);
}

function buildSkillResourceUrl(skillId: string, resourcePath: string): string {
  const searchParams = new URLSearchParams({ path: resourcePath });
  return BasePath.getURL(`/api/ai/skills/${encodeURIComponent(skillId)}/resource?${searchParams}`);
}

function normalizeReferencePath(folderPath: string, input: string): string {
  const trimmed = input.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  const normalizedFolder = folderPath.replaceAll("\\", "/").replace(/\/+$/, "");
  if (!trimmed || !normalizedFolder) {
    return "";
  }
  return `${normalizedFolder}/${trimmed}`;
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
  const [resourceDetail, setResourceDetail] = useState<SkillResourceResponse | null>(null);
  const [resourceDrafts, setResourceDrafts] = useState<Record<string, string>>({});
  const [deletedResourcePaths, setDeletedResourcePaths] = useState<string[]>([]);
  const [resourceLoadingPath, setResourceLoadingPath] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [isDeleteReferenceConfirmOpen, setIsDeleteReferenceConfirmOpen] = useState(false);

  const [renderMode, setRenderMode] = useState<"rendered" | "raw">("rendered");
  const detailRequestIdRef = useRef(0);
  const resourceRequestIdRef = useRef(0);
  const resourceAbortControllerRef = useRef<AbortController | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const newReferenceFormRef = useRef<NewReferenceFormController | null>(null);

  // Load skill detail
  useEffect(() => {
    const requestId = ++detailRequestIdRef.current;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setDetail(null);
    setSelectedFile(null);
    setResourceDetail(null);
    setResourceDrafts({});
    setDeletedResourcePaths([]);
    setResourceError(null);
    setSaveError(null);
    setResourceLoadingPath(null);
    resourceAbortControllerRef.current?.abort();
    resourceAbortControllerRef.current = null;

    fetch(buildSkillDetailUrl(skillId), {
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
  }, [skillId]);

  const fetchResource = useCallback(
    async (resourcePath: string): Promise<SkillResourceResponse> => {
      const response = await fetch(buildSkillResourceUrl(skillId, resourcePath));
      if (!response.ok) {
        throw new Error(await readJsonError(response, `HTTP ${response.status}`));
      }
      return (await response.json()) as SkillResourceResponse;
    },
    [skillId]
  );

  // Load a resource file when a tree node is clicked
  const handleFileClick = useCallback(
    (resourcePath: string) => {
      if (resourceDrafts[resourcePath] !== undefined) {
        resourceRequestIdRef.current += 1;
        resourceAbortControllerRef.current?.abort();
        resourceAbortControllerRef.current = null;
        setSelectedFile(resourcePath);
        setResourceDetail(null);
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
      setResourceDetail(null);
      setResourceError(null);
      setResourceLoadingPath(resourcePath);
      setRenderMode("raw");

      fetch(buildSkillResourceUrl(skillId, resourcePath), {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<SkillResourceResponse>;
        })
        .then((data) => {
          if (resourceRequestIdRef.current !== requestId) return;
          setResourceDetail(data);
          setResourceLoadingPath(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || resourceRequestIdRef.current !== requestId) return;
          setResourceError(err instanceof Error ? err.message : "Failed to load file");
          setResourceLoadingPath(null);
        });
    },
    [resourceDrafts, skillId]
  );

  // Click SKILL.md → go back to main content
  const handleSkillMdClick = useCallback(() => {
    resourceRequestIdRef.current += 1;
    resourceAbortControllerRef.current?.abort();
    resourceAbortControllerRef.current = null;
    setSelectedFile(null);
    setResourceDetail(null);
    setResourceError(null);
    setResourceLoadingPath(null);
    setRenderMode("rendered");
  }, []);

  const reloadDetail = useCallback(async () => {
    const response = await fetch(buildSkillDetailUrl(skillId));
    if (!response.ok) {
      throw new Error(await readJsonError(response, `HTTP ${response.status}`));
    }
    const data = (await response.json()) as SkillDetailResponse;
    setDetail(data);
    return data;
  }, [skillId]);

  const publishSkill = useCallback(async () => {
    if (!detail) {
      return;
    }

    setIsPublishing(true);
    setSaveError(null);

    try {
      const resources = Object.entries(resourceDrafts).map(([path, content]) => ({
        path,
        content,
      }));

      const response = await fetch(buildSkillDetailUrl(skillId), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "publish",
          resources,
          deletedResourcePaths,
          ...(detail.source === "database" && detail.scope ? { scope: detail.scope } : {}),
          ...(detail.version ? { version: detail.version } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(await readJsonError(response, "Failed to publish skill"));
      }

      setResourceDrafts({});
      setDeletedResourcePaths([]);
      await reloadDetail();
      if (selectedFile) {
        const refreshed = await fetchResource(selectedFile);
        setResourceDetail(refreshed);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to publish skill");
    } finally {
      setIsPublishing(false);
    }
  }, [
    deletedResourcePaths.length,
    detail,
    fetchResource,
    reloadDetail,
    resourceDrafts,
    selectedFile,
    skillId,
  ]);

  const revertDraft = useCallback(async () => {
    setIsReverting(true);
    setSaveError(null);

    try {
      setResourceDrafts({});
      setDeletedResourcePaths([]);
      if (!selectedFile) {
        return;
      }

      if (!detail?.resourcePaths.includes(selectedFile)) {
        setSelectedFile(null);
        setResourceDetail(null);
        setRenderMode("rendered");
        return;
      }

      const nextDetail = await fetchResource(selectedFile);
      setResourceDetail(nextDetail);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to revert local changes");
    } finally {
      setIsReverting(false);
    }
  }, [detail, fetchResource, selectedFile]);

  const createReference = useCallback(
    (folderPath: string, rawReferenceName: string) => {
      const normalizedPath = normalizeReferencePath(folderPath, rawReferenceName);
      const existingPaths = new Set(detail ? detail.resourcePaths : []);
      Object.keys(resourceDrafts).forEach((path) => existingPaths.add(path));
      deletedResourcePaths.forEach((path) => existingPaths.delete(path));

      if (!isSafeReferencePath(normalizedPath)) {
        return { ok: false as const, error: "Reference name must stay within references/." };
      }
      if (existingPaths.has(normalizedPath)) {
        return { ok: false as const, error: "A reference with this path already exists." };
      }

      setResourceDrafts((prev) => ({
        ...prev,
        [normalizedPath]: prev[normalizedPath] ?? `# ${normalizedPath.split("/").pop()}\n`,
      }));
      setDeletedResourcePaths((prev) => prev.filter((path) => path !== normalizedPath));
      setSelectedFile(normalizedPath);
      setResourceError(null);
      setResourceLoadingPath(null);
      setSaveError(null);
      setRenderMode("raw");
      return { ok: true as const };
    },
    [deletedResourcePaths, detail, resourceDrafts]
  );

  const openNewReferenceDialog = useCallback(
    (folderPath: string) => {
      SharedDialog.showDialog({
        title: "New File",
        description: `Add a new file under ${folderPath}/.`,
        className: "w-full max-w-[560px] sm:max-w-[560px]",
        mainContent: (
          <NewReferenceForm controllerRef={newReferenceFormRef} folderPath={folderPath} />
        ),
        dialogButtons: [
          {
            text: "Cancel",
            default: false,
            variant: "outline",
            onClick: async () => true,
          },
          {
            text: "Create File",
            default: true,
            onClick: async () => {
              const result = createReference(
                folderPath,
                newReferenceFormRef.current?.getFileName() ?? ""
              );
              if (!result.ok) {
                newReferenceFormRef.current?.setError(result.error);
                return false;
              }
              return true;
            },
          },
        ],
      });
    },
    [createReference]
  );

  const deleteSelectedReference = useCallback(() => {
    if (!selectedFile || !selectedFile.startsWith("references/")) {
      return;
    }

    const isUnsavedNewReference =
      resourceDrafts[selectedFile] !== undefined && !detail?.resourcePaths.includes(selectedFile);

    setResourceDrafts((prev) => {
      if (prev[selectedFile] === undefined) {
        return prev;
      }
      const next = { ...prev };
      delete next[selectedFile];
      return next;
    });

    if (!isUnsavedNewReference) {
      setDeletedResourcePaths((prev) =>
        prev.includes(selectedFile) ? prev : [...prev, selectedFile]
      );
    }

    setSelectedFile(null);
    setResourceDetail(null);
    setResourceError(null);
    setResourceLoadingPath(null);
    setSaveError(null);
    setRenderMode("rendered");
  }, [detail?.resourcePaths, resourceDrafts, selectedFile]);

  // Derived display state
  const hasUnsavedReferenceChanges = Object.keys(resourceDrafts).length > 0;
  const hasDeletedReferenceChanges = deletedResourcePaths.length > 0;
  const displayedResourcePaths = useMemo(
    () =>
      detail
        ? Array.from(new Set([...detail.resourcePaths, ...Object.keys(resourceDrafts)])).sort()
        : [],
    [detail, resourceDrafts]
  );
  const draftPaths = useMemo(() => new Set(Object.keys(resourceDrafts)), [resourceDrafts]);
  const deletedPaths = useMemo(() => new Set(deletedResourcePaths), [deletedResourcePaths]);
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
      : (selectedDraftResource ?? resourceDetail?.content ?? "");
  const currentState =
    selectedFile === null
      ? (detail?.state ?? null)
      : selectedDraftResource !== undefined
        ? "draft"
        : (resourceDetail?.state ?? null);
  const currentSource =
    selectedFile === null
      ? (detail?.source ?? null)
      : selectedDraftResource !== undefined
        ? "database"
        : (resourceDetail?.source ?? null);
  const dirTree = useMemo(() => buildDirTree(displayedResourcePaths), [displayedResourcePaths]);
  const canPublish =
    !isPublishing &&
    !isReverting &&
    !!detail &&
    (hasUnsavedReferenceChanges || hasDeletedReferenceChanges);
  const canRevert =
    !isPublishing && !isReverting && (hasUnsavedReferenceChanges || hasDeletedReferenceChanges);
  const resourceLoading = selectedFile !== null && resourceLoadingPath === selectedFile;
  const showRenderToggle = isMarkdownFile;
  const showDeleteSelectedReference = allowEditSkill && isReferenceFile;
  const isUnsavedNewSelectedReference =
    selectedFile !== null &&
    selectedDraftResource !== undefined &&
    !(detail?.resourcePaths.includes(selectedFile) ?? false);
  const canDeleteSelectedReference =
    showDeleteSelectedReference &&
    (isUnsavedNewSelectedReference || resourceDetail?.source === "database");

  useEffect(() => {
    if (!canEditSelectedReference || renderMode !== "raw" || resourceLoading || resourceError) {
      return;
    }

    const textarea = editorTextareaRef.current;
    if (!textarea) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      textarea.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    canEditSelectedReference,
    currentContent,
    renderMode,
    resourceError,
    resourceLoading,
    selectedFile,
  ]);

  return (
    <div className="h-full flex flex-col relative">
      <FloatingProgressBar show={loading || resourceLoading || isPublishing || isReverting} />

      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : detail ? (
          <SkillDetailHeader
            detail={detail}
            allowEditSkill={allowEditSkill}
            canPublish={canPublish}
            canRevert={canRevert}
            isPublishing={isPublishing}
            isReverting={isReverting}
            onRevert={revertDraft}
            onPublish={publishSkill}
          />
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
          <Panel defaultSize={75} minSize={20} className="flex flex-col overflow-hidden">
            <SkillFileHeader
              displayedFilename={displayedFilename}
              currentSource={currentSource}
              renderMode={renderMode}
              canEditSelectedReference={canEditSelectedReference}
              showDeleteSelectedReference={showDeleteSelectedReference}
              canDeleteSelectedReference={canDeleteSelectedReference}
              showRenderToggle={showRenderToggle}
              isDeleteReferenceConfirmOpen={isDeleteReferenceConfirmOpen}
              onRenderModeChange={setRenderMode}
              onDeleteReference={deleteSelectedReference}
              onDeleteReferenceConfirmOpenChange={setIsDeleteReferenceConfirmOpen}
            />

            {canEditSelectedReference ? (
              <div className="flex flex-1 min-h-0 flex-col">
                {saveError ? <p className="mb-3 text-sm text-destructive">{saveError}</p> : null}
                {resourceLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-4/6" />
                  </div>
                ) : resourceError ? (
                  <p className="text-sm text-destructive">{resourceError}</p>
                ) : renderMode === "raw" ? (
                  <Textarea
                    ref={editorTextareaRef}
                    value={currentContent}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setResourceDrafts((prev) => ({ ...prev, [selectedFile!]: nextValue }));
                      setSaveError(null);
                    }}
                    className="h-full min-h-0 flex-1 border-0 resize-none font-mono text-xs leading-relaxed focus-visible:border-input focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                ) : (
                  <ScrollArea className="flex-1">
                    <div className="px-4 py-3">
                      <SkillMarkdownRenderer raw={currentContent} />
                    </div>
                  </ScrollArea>
                )}
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="px-4 py-3">
                  {saveError ? <p className="mb-3 text-sm text-destructive">{saveError}</p> : null}
                  {resourceLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-4/6" />
                    </div>
                  ) : resourceError ? (
                    <p className="text-sm text-destructive">{resourceError}</p>
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
            )}
          </Panel>

          <PanelResizeHandle className="w-0.5 bg-border hover:bg-primary/40 active:bg-primary/60 cursor-col-resize transition-colors" />

          {/* ── Right panel — directory tree ── */}
          <Panel defaultSize={25} minSize={20} className="flex flex-col overflow-hidden">
            <SkillFileTreePanel
              allowEditSkill={allowEditSkill}
              selectedFile={selectedFile}
              dirTree={dirTree}
              draftPaths={draftPaths}
              deletedPaths={deletedPaths}
              onNewFile={openNewReferenceDialog}
              onSkillMdClick={handleSkillMdClick}
              onFileClick={handleFileClick}
            />
          </Panel>
        </PanelGroup>
      ) : null}
    </div>
  );
}

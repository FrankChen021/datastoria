"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SkillDetailResponse } from "@/lib/ai/skills/skill-provider";
import matter from "gray-matter";
import { ArrowLeft, ChevronRight, File, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
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

function DirNodeRow({ node, depth = 0 }: { node: DirNode; depth?: number }) {
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
            <DirNodeRow key={child.path} node={child} depth={depth + 1} />
          ))}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 py-0.5 hover:bg-accent/40 rounded px-1"
      style={{ paddingLeft: `${depth * 14 + 4 + 16}px` }}
    >
      <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs truncate text-muted-foreground">{node.name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer (strips frontmatter before rendering)
// ---------------------------------------------------------------------------

function SkillMarkdownRenderer({ raw }: { raw: string }) {
  const { content } = matter(raw);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold mt-3 mb-1.5">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mt-2.5 mb-1">{children}</h3>
        ),
        p: ({ children }) => <p className="text-sm mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => (
          <ul className="text-sm list-disc ml-4 mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="text-sm list-decimal ml-4 mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-muted rounded p-3 overflow-x-auto my-2">
                <code className="text-xs font-mono">{children}</code>
              </pre>
            );
          }
          return (
            <code
              className="bg-muted rounded px-1 py-0.5 text-xs font-mono"
              {...props}
            >
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
        td: ({ children }) => (
          <td className="border border-border px-2 py-1">{children}</td>
        ),
        hr: () => <hr className="my-3 border-border" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ---------------------------------------------------------------------------
// Main detail view
// ---------------------------------------------------------------------------

export function SkillsDetailView({ skillId, onBack }: SkillsDetailViewProps) {
  const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"rendered" | "raw">("rendered");

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);

    fetch(`/api/ai/skills/${encodeURIComponent(skillId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SkillDetailResponse>;
      })
      .then((data) => {
        setDetail(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load skill");
        setLoading(false);
      });
  }, [skillId]);

  const dirTree = detail ? buildDirTree(detail.resourcePaths) : [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : detail ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm truncate">{detail.name}</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0 shrink-0">
              Built-in
            </Badge>
            {detail.version && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 font-mono shrink-0">
                v{detail.version}
              </Badge>
            )}
            {detail.provider && (
              <span className="text-xs text-muted-foreground shrink-0">by {detail.provider}</span>
            )}
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
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left panel — SKILL.md content */}
          <div className="flex flex-col border-r overflow-hidden" style={{ flex: "0 0 60%" }}>
            {/* Panel header with toggle */}
            <div className="flex-shrink-0 px-3 py-1.5 border-b flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">SKILL.md</span>
              <ToggleGroup
                type="single"
                value={renderMode}
                onValueChange={(v) => v && setRenderMode(v as "rendered" | "raw")}
                size="sm"
                variant="outline"
              >
                <ToggleGroupItem value="rendered" className="text-xs h-6 px-2">
                  Rendered
                </ToggleGroupItem>
                <ToggleGroupItem value="raw" className="text-xs h-6 px-2">
                  Raw
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="px-4 py-3">
                {renderMode === "rendered" ? (
                  <SkillMarkdownRenderer raw={detail.content} />
                ) : (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                    {detail.content}
                  </pre>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right panel — Directory tree */}
          <div className="flex flex-col overflow-hidden" style={{ flex: "0 0 40%" }}>
            <div className="flex-shrink-0 px-3 py-1.5 border-b">
              <span className="text-xs font-medium text-muted-foreground">Files</span>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-2 py-2">
                {/* Always show SKILL.md as the root entry */}
                <div className="flex items-center gap-1 py-0.5 px-1 mb-0.5">
                  <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium">SKILL.md</span>
                </div>

                {dirTree.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 mt-1">No additional files</p>
                ) : (
                  dirTree.map((node) => <DirNodeRow key={node.path} node={node} depth={0} />)
                )}
              </div>
            </ScrollArea>

            {/* Footer note */}
            <div className="flex-shrink-0 px-3 py-1.5 border-t">
              <p className="text-xs text-muted-foreground">
                This skill is loaded by the V2 agent on demand.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

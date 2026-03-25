"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronRight, File, Folder, MoreVertical } from "lucide-react";
import { memo, useState } from "react";
import type { DirNode } from "./skill-detail-tree";

export const SkillFileTreeNode = memo(function SkillFileTreeNode({
  node,
  depth = 0,
  selectedPath,
  draftPaths,
  deletedPaths,
  allowEditSkill,
  onFileClick,
  onNewFile,
}: {
  node: DirNode;
  depth?: number;
  selectedPath: string | null;
  draftPaths: Set<string>;
  deletedPaths: Set<string>;
  allowEditSkill: boolean;
  onFileClick: (path: string) => void;
  onNewFile: (folderPath: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (node.isDir) {
    const canCreateInFolder = allowEditSkill && node.path.startsWith("references");

    return (
      <div>
        <div
          className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent/40"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
            <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs truncate">{node.name}</span>
          </button>
          {canCreateInFolder ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="!h-3 !w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[10000]">
                <DropdownMenuItem onClick={() => onNewFile(node.path)}>New file</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {expanded
          ? node.children.map((child) => (
              <SkillFileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                draftPaths={draftPaths}
                deletedPaths={deletedPaths}
                allowEditSkill={allowEditSkill}
                onFileClick={onFileClick}
                onNewFile={onNewFile}
              />
            ))
          : null}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  const isDraft = draftPaths.has(node.path);
  const isDeleted = deletedPaths.has(node.path);

  return (
    <button
      className={`flex items-center gap-1.5 w-full text-left py-0.5 rounded px-1 transition-colors ${
        isDeleted
          ? "cursor-default text-muted-foreground"
          : isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/40"
      }`}
      style={{ paddingLeft: `${depth * 14 + 20}px` }}
      onClick={() => {
        if (!isDeleted) {
          onFileClick(node.path);
        }
      }}
      disabled={isDeleted}
      aria-disabled={isDeleted}
    >
      <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span
        className={`text-xs truncate flex-1 min-w-0 ${isDeleted ? "line-through text-muted-foreground" : ""}`}
      >
        {node.name}
      </span>
      {isDraft ? (
        <Badge
          variant="secondary"
          className="h-4 rounded-sm px-1.5 py-0 text-[9px] capitalize shrink-0"
        >
          draft
        </Badge>
      ) : null}
    </button>
  );
});

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SectionHeaderProps {
  /** Section title */
  title: string;
  /** Number of panels in the section */
  panelCount: number;
  /** Whether the section is collapsed */
  isCollapsed: boolean;
  /** Callback when collapse state changes */
  onToggleCollapse: () => void;
  /** Whether edit controls should be shown (for custom dashboards) */
  showEditControls?: boolean;
  /** Callback when section is renamed */
  onRename?: (newTitle: string) => void;
  /** Callback when section is deleted */
  onDelete?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Section header component with collapse toggle and optional edit controls.
 * Used to group dashboard panels into collapsible sections.
 */
export function SectionHeader({
  title,
  panelCount,
  isCollapsed,
  onToggleCollapse,
  showEditControls = false,
  onRename,
  onDelete,
  className,
}: SectionHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Reset edit value when title changes externally
  useEffect(() => {
    setEditValue(title);
  }, [title]);

  const handleSaveRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title && onRename) {
      onRename(trimmed);
    }
    setIsEditing(false);
  }, [editValue, title, onRename]);

  const handleCancelRename = useCallback(() => {
    setEditValue(title);
    setIsEditing(false);
  }, [title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSaveRename();
      } else if (e.key === "Escape") {
        handleCancelRename();
      }
    },
    [handleSaveRename, handleCancelRename]
  );

  const handleDelete = useCallback(() => {
    if (showDeleteConfirm && onDelete) {
      onDelete();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
    }
  }, [showDeleteConfirm, onDelete]);

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 bg-muted/30 select-none group",
        className,
        isCollapsed && "border-b"
      )}
    >
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => {
          console.log("[SectionHeader] Click - isCollapsed:", isCollapsed);
          onToggleCollapse();
        }}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            !isCollapsed && "rotate-90"
          )}
        />
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveRename}
            className="h-6 text-sm font-medium px-1 py-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-medium truncate">{title}</span>
            <span className="text-xs text-muted-foreground shrink-0">({panelCount} panels)</span>
          </div>
        )}
      </button>

      {/* Edit controls (visible on hover for custom dashboards) */}
      {showEditControls && !isEditing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {showDeleteConfirm ? (
            <>
              <span className="text-xs text-muted-foreground mr-1">Delete?</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={handleDelete}
                title="Confirm delete"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCancelDelete}
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                title="Rename section"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                title="Delete section"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      )}

      {/* Save/Cancel buttons when editing */}
      {isEditing && (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleSaveRename}
            title="Save"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCancelRename}
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, ArrowRight, Check, Copy, Pencil, Play, Trash2, X } from "lucide-react";
import { useState } from "react";
import { ThemedSyntaxHighlighter } from "../../shared/themed-syntax-highlighter";
import { TabManager } from "../../tab-manager";
import { QuerySnippetManager } from "./query-snippet-manager";
import type { Snippet } from "./snippet";

interface SnippetTooltipContentProps {
  snippet: Snippet;
}

export function SnippetTooltipContent({ snippet }: SnippetTooltipContentProps) {
  const isBuiltin = snippet.builtin;
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(snippet.caption);
  const [editSql, setEditSql] = useState(snippet.sql);
  const [editError, setEditError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleRun = (target: Snippet) => {
    TabManager.activateQueryTab({
      query: target.sql,
      execute: true,
      mode: "none",
    });
  };

  const handleInsert = (target: Snippet) => {
    TabManager.activateQueryTab({
      query: "-- " + target.caption + "\n" + target.sql,
      execute: false,
      mode: "insert",
    });
  };

  const handleEditClick = () => {
    setEditCaption(snippet.caption);
    setEditSql(snippet.sql);
    setEditError(null);
    setIsEditing(true);
  };

  const handleCloneClick = () => {
    setEditCaption(`${snippet.caption}_copy`);
    setEditSql(snippet.sql);
    setEditError(null);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const normalizedCaption = editCaption.trim();
    const normalizedSql = editSql.trim();

    if (!normalizedCaption || !normalizedSql) {
      setEditError("Name and SQL are required.");
      return;
    }
    try {
      const manager = QuerySnippetManager.getInstance();
      if (normalizedCaption !== snippet.caption && manager.hasSnippet(normalizedCaption)) {
        setEditError("Snippet name already exists.");
        return;
      }

      manager.replaceSnippet(snippet.caption, normalizedCaption, normalizedSql);
      setEditError(null);
      setIsEditing(false);
    } catch {
      setEditError("Failed to save snippet.");
    }
  };

  const handleCancelEdit = () => {
    setEditError(null);
    setIsEditing(false);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    QuerySnippetManager.getInstance().deleteSnippet(snippet.caption);
    setShowDeleteConfirm(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  if (isEditing) {
    return (
      <div className="w-[400px] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 p-2 bg-muted/30">
          <Input
            id="edit-caption"
            value={editCaption}
            onChange={(e) => {
              setEditCaption(e.target.value);
              setEditError(null);
            }}
            className="h-8 text-sm"
            autoFocus
          />
          <div key="edit-caption-actions" className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                handleCancelEdit();
              }}
              title="Cancel"
            >
              <X className="!h-3 !w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                handleSaveEdit();
              }}
              title="Save"
            >
              <Check className="!h-3 !w-3" />
            </Button>
          </div>
        </div>
        <Separator />
        {editError && (
          <>
            <div
              className="bg-destructive/10 border-l-4 border-destructive px-3 py-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm mb-1 text-destructive">
                    Validation error
                  </div>
                  <div className="text-xs text-muted-foreground">{editError}</div>
                </div>
              </div>
            </div>
            <Separator />
          </>
        )}
        <div className="flex flex-col p-[12px] gap-2">
          <Textarea
            id="edit-sql"
            value={editSql}
            onChange={(e) => {
              setEditSql(e.target.value);
              setEditError(null);
            }}
            className="font-mono text-xs min-h-[200px]"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-[400px] overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 p-2 bg-muted/30">
        <span className="font-medium text-sm truncate">{snippet.caption}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              handleRun(snippet);
            }}
            title="Run in new tab"
          >
            <Play className="!h-3 !w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              handleInsert(snippet);
            }}
            title="Insert at cursor"
          >
            <ArrowRight className="!h-3 !w-3" />
          </Button>
          {isBuiltin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                handleCloneClick();
              }}
              title="Clone / Edit Copy"
            >
              <Copy className="!h-3 !w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${isBuiltin ? "opacity-50" : ""}`}
            disabled={isBuiltin}
            onClick={(e) => {
              e.stopPropagation();
              if (!isBuiltin) {
                handleEditClick();
              }
            }}
            title={isBuiltin ? "Built-in snippets are read-only. Clone to edit a copy." : "Edit"}
          >
            <Pencil className="!h-3 !w-3" />
          </Button>
          {!isBuiltin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick();
              }}
              title="Delete"
            >
              <Trash2 className="!h-3 !w-3" />
            </Button>
          )}
        </div>
      </div>
      <Separator />
      {showDeleteConfirm && (
        <div
          id="delete-confirm-section"
          className="bg-destructive/10 border-l-4 border-destructive px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm mb-1 text-destructive">Confirm deletion</div>
              <div className="text-xs mb-3 text-muted-foreground">
                Are you sure you want to delete this snippet? This action cannot be undone.
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCancel();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConfirm();
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && <Separator />}
      <div id="snippet-sql" className="max-h-[300px] min-h-[200px] overflow-auto">
        <ThemedSyntaxHighlighter
          language="sql"
          customStyle={{
            margin: 0,
            padding: "12px",
            fontSize: "0.75rem",
            borderRadius: 0,
            minHeight: "200px",
          }}
        >
          {snippet.sql}
        </ThemedSyntaxHighlighter>
      </div>
    </div>
  );
}

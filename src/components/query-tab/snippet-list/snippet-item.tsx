import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TextHighlighter } from "@/lib/text-highlighter";
import {
  AlertCircle,
  ArrowRight,
  Code,
  FileText,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { ThemedSyntaxHighlighter } from "../../shared/themed-syntax-highlighter";
import { Dialog } from "../../shared/use-dialog";
import { TabManager } from "../../tab-manager";
import { QuerySnippetManager } from "../query-input/snippet/query-snippet-manager";
import type { Snippet } from "../query-input/snippet/snippet";
import type { UISnippet } from "./ui-snippet";

interface SnippetItemProps {
  uiSnippet: UISnippet;
}

export function SnippetItem({ uiSnippet }: SnippetItemProps) {
  const { snippet, matchedIndex, matchedLength } = uiSnippet;
  const isBuiltin = snippet.builtin;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const captionNode = matchedIndex >= 0 
    ? TextHighlighter.highlight2(snippet.caption, matchedIndex, matchedIndex + matchedLength, "text-yellow-500")
    : snippet.caption;

  const handleRun = (snippet: Snippet) => {
    TabManager.activateQueryTab({ query: snippet.sql, execute: true, mode: "replace" });
  };

  const handleInsert = (snippet: Snippet) => {
    window.dispatchEvent(
      new CustomEvent("snippet-insert", { detail: snippet.sql })
    );
  };

  const handleEdit = (snippet: Snippet) => {
    let name = snippet.caption;
    let sql = snippet.sql;

    Dialog.showDialog({
      title: "Edit Snippet",
      description: "Update your snippet details.",
      mainContent: (
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              placeholder="e.g., daily_active_users"
              defaultValue={name}
              onChange={(e) => (name = e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-sql">SQL</Label>
            <Textarea
              id="edit-sql"
              placeholder="SELECT * FROM ..."
              className="font-mono text-xs min-h-[150px]"
              defaultValue={sql}
              onChange={(e) => (sql = e.target.value)}
            />
          </div>
        </div>
      ),
      dialogButtons: [
        {
          text: "Cancel",
          default: false,
          onClick: async () => true,
        },
        {
          text: "Save",
          default: true,
          onClick: async () => {
            if (!name.trim() || !sql.trim()) {
              Dialog.alert({
                title: "Validation Error",
                description: "Name and SQL are required.",
              });
              return false;
            }
            try {
              QuerySnippetManager.getInstance().addSnippet(name, sql);
              return true;
            } catch (e) {
              Dialog.alert({
                title: "Error",
                description: "Failed to save snippet.",
              });
              return false;
            }
          },
        },
      ],
    });
  };

  const handleClone = (snippet: Snippet) => {
    let name = `${snippet.caption}_copy`;
    let sql = snippet.sql;

    Dialog.showDialog({
      title: "Clone Snippet",
      description: "Save a copy of this snippet.",
      mainContent: (
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="clone-name">Name</Label>
            <Input
              id="clone-name"
              placeholder="e.g., daily_active_users"
              defaultValue={name}
              onChange={(e) => (name = e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="clone-sql">SQL</Label>
            <Textarea
              id="clone-sql"
              placeholder="SELECT * FROM ..."
              className="font-mono text-xs min-h-[150px]"
              defaultValue={sql}
              onChange={(e) => (sql = e.target.value)}
            />
          </div>
        </div>
      ),
      dialogButtons: [
        {
          text: "Cancel",
          default: false,
          onClick: async () => true,
        },
        {
          text: "Save",
          default: true,
          onClick: async () => {
            if (!name.trim() || !sql.trim()) {
              Dialog.alert({
                title: "Validation Error",
                description: "Name and SQL are required.",
              });
              return false;
            }
            try {
              QuerySnippetManager.getInstance().addSnippet(name, sql);
              return true;
            } catch (e) {
              Dialog.alert({
                title: "Error",
                description: "Failed to save snippet.",
              });
              return false;
            }
          },
        },
      ],
    });
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

  return (
    <div className="group flex items-center justify-between py-1.5 pl-5 pr-1 hover:bg-accent hover:text-accent-foreground rounded-none text-sm transition-colors cursor-pointer">
      <div className="flex items-center gap-2 overflow-hidden flex-1">
        {isBuiltin ? (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Code className="h-4 w-4 shrink-0 text-blue-500" />
        )}
        <HoverCard openDelay={300}>
          <HoverCardTrigger asChild>
            <div className="flex flex-col overflow-hidden min-w-0">
              <span className="font-medium truncate">{captionNode}</span>
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="right" className="w-[400px] p-0 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-2 bg-muted/30">
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
                {isBuiltin ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClone(snippet);
                    }}
                    title="Clone / Edit Copy"
                  >
                    <Pencil className="!h-3 !w-3" />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(snippet);
                      }}
                      title="Edit"
                    >
                      <Pencil className="!h-3 !w-3" />
                    </Button>
                    <Popover open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                      <PopoverTrigger asChild>
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
                      </PopoverTrigger>
                      <PopoverContent className="p-0 overflow-hidden w-auto" side="left" align="start">
                        <div className="flex items-start gap-2 px-3 py-3">
                          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm mb-1">Confirm deletion</div>
                            <div className="text-xs mb-3">
                              Are you sure to delete this snippet? This action cannot be reverted.
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
                      </PopoverContent>
                    </Popover>
                  </>
                )}
              </div>
            </div>
            <Separator />
            <div className="max-h-[300px] overflow-auto">
              <ThemedSyntaxHighlighter
                language="sql"
                customStyle={{
                  margin: 0,
                  padding: "12px",
                  fontSize: "0.75rem",
                  borderRadius: 0,
                }}
              >
                {snippet.sql}
              </ThemedSyntaxHighlighter>
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>
    </div>
  );
}

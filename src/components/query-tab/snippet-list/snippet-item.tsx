import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TextHighlighter } from "@/lib/text-highlighter";
import {
  ArrowRight,
  Code,
  FileText,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Dialog } from "../../shared/use-dialog";
import { ThemedSyntaxHighlighter } from "../../shared/themed-syntax-highlighter";
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

  const handleDelete = (snippet: Snippet) => {
    Dialog.confirm({
      title: "Delete Snippet",
      description: `Are you sure you want to delete snippet "${snippet.caption}"?`,
      dialogButtons: [
        {
          text: "Cancel",
          default: false,
          onClick: async () => true,
        },
        {
          text: "Delete",
          default: true,
          variant: "destructive",
          onClick: async () => {
            QuerySnippetManager.getInstance().deleteSnippet(snippet.caption);
            return true;
          },
        },
      ],
    });
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(snippet);
                      }}
                      title="Delete"
                    >
                      <Trash2 className="!h-3 !w-3" />
                    </Button>
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

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import { TextHighlighter } from "@/lib/text-highlighter";
import {
  ArrowRight,
  Code,
  FileText,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { ThemedSyntaxHighlighter } from "../../shared/themed-syntax-highlighter";
import { TabManager } from "../../tab-manager";
import type { Snippet } from "../query-input/snippet/snippet";
import type { UISnippet } from "./ui-snippet";

interface SnippetItemProps {
  uiSnippet: UISnippet;
  onEdit: (snippet: Snippet) => void;
  onClone: (snippet: Snippet) => void;
  onDelete: (snippet: Snippet) => void;
}

export function SnippetItem({ uiSnippet, onEdit, onClone, onDelete }: SnippetItemProps) {
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
                      onClone(snippet);
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
                        onEdit(snippet);
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
                        onDelete(snippet);
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

      {/* Actions - visible on hover */}
      <div className="flex items-center gap-0.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 hover:bg-muted"
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
          className="h-5 w-5 hover:bg-muted"
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
            className="h-4 w-4 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onClone(snippet);
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
              className="h-4 w-4 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(snippet);
              }}
              title="Edit"
            >
              <Pencil className="!h-3 !w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(snippet);
              }}
              title="Delete"
            >
              <Trash2 className="!h-3 !w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

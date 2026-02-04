import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Code,
  FileText,
  Pencil,
  Play,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TextHighlighter } from "@/lib/text-highlighter";
import { ThemedSyntaxHighlighter } from "../../shared/themed-syntax-highlighter";
import { TabManager } from "../../tab-manager";
import { QuerySnippetManager } from "../query-input/snippet/query-snippet-manager";
import { SaveSnippetDialog } from "../query-input/snippet/save-snippet-dialog";
import type { Snippet } from "../query-input/snippet/snippet";

interface UISnippet {
  snippet: Snippet;
  matchedIndex: number;
  matchedLength: number;
}

export function SnippetListView() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState("");
  const [userSnippets, setUserSnippets] = useState<UISnippet[]>([]);
  const [builtinSnippets, setBuiltinSnippets] = useState<UISnippet[]>([]);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<"edit" | "clone">("edit");

  useEffect(() => {
    const manager = QuerySnippetManager.getInstance();
    setSnippets(manager.getSnippets());

    const unsubscribe = manager.subscribe(() => {
      setSnippets(manager.getSnippets());
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const lowerSearch = search.toLowerCase().trim();
    const user: UISnippet[] = [];
    const builtin: UISnippet[] = [];

    for (const snippet of snippets) {
      const lowerCaption = snippet.caption.toLowerCase();
      const matchedIndex = lowerSearch ? lowerCaption.indexOf(lowerSearch) : -1;

      if (lowerSearch && matchedIndex === -1) {
        continue;
      }

      const uiSnippet: UISnippet = {
        snippet,
        matchedIndex,
        matchedLength: lowerSearch.length,
      };

      if (snippet.builtin) {
        builtin.push(uiSnippet);
      } else {
        user.push(uiSnippet);
      }
    }

    setUserSnippets(user);
    setBuiltinSnippets(builtin);
  }, [snippets, search]);

  const handleRun = (snippet: Snippet) => {
    TabManager.activateQueryTab({ query: snippet.sql, execute: true, mode: "replace" });
  };

  const handleInsert = (snippet: Snippet) => {
    window.dispatchEvent(
      new CustomEvent("snippet-insert", { detail: snippet.sql })
    );
  };

  const handleEdit = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setEditMode("edit");
    setIsEditDialogOpen(true);
  };

  const handleClone = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setEditMode("clone");
    setIsEditDialogOpen(true);
  };

  const handleDelete = (snippet: Snippet) => {
    if (confirm(`Are you sure you want to delete snippet "${snippet.caption}"?`)) {
      QuerySnippetManager.getInstance().deleteSnippet(snippet.caption);
    }
  };

  const SnippetItem = ({ uiSnippet }: { uiSnippet: UISnippet }) => {
    const { snippet, matchedIndex, matchedLength } = uiSnippet;
    const isBuiltin = snippet.builtin;
    const captionNode = matchedIndex >= 0 
      ? TextHighlighter.highlight2(snippet.caption, matchedIndex, matchedIndex + matchedLength, "text-yellow-500")
      : snippet.caption;
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
                className="h-4 w-4 hover:bg-muted"
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
                className="h-4 w-4 hover:bg-destructive/10 hover:text-destructive"
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
    );
  };

  const SnippetItems = ({ snippets, title }: { snippets: UISnippet[]; title: string }) => {
    if (snippets.length === 0) return null;

    return (
      <div>
        <div className="text-xs font-semibold text-muted-foreground px-2 py-1 tracking-wider">
          {title}
        </div>
        <div className="space-y-0.5">
          {snippets.map((s) => (
            <SnippetItem key={s.snippet.caption} uiSnippet={s} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="relative border-b-2 flex items-center h-9">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          placeholder="Search snippets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            "pl-8 pr-20 rounded-none border-none flex-1 h-9",
            search.length > 0 ? "pr-16" : "pr-8"
          )}
        />
        {search && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
            onClick={() => setSearch("")}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="h-full overflow-y-auto">
        <SnippetItems snippets={userSnippets} title="User Defined" />

        <SnippetItems snippets={builtinSnippets} title="Built-in" />

        {userSnippets.length === 0 && builtinSnippets.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No snippets found
          </div>
        )}
      </div>


      <SaveSnippetDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        initialName={editMode === "clone" ? `${editingSnippet?.caption}_copy` : editingSnippet?.caption}
        initialSql={editingSnippet?.sql}
      />
    </div>
  );
}

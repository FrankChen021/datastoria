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
import { useEffect, useMemo, useState } from "react";
import { ThemedSyntaxHighlighter } from "../../shared/themed-syntax-highlighter";
import { TabManager } from "../../tab-manager";
import { QuerySnippetManager } from "../query-input/snippet/query-snippet-manager";
import { SaveSnippetDialog } from "../query-input/snippet/save-snippet-dialog";
import type { Snippet } from "../query-input/snippet/snippet";

export function SnippetListView() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState("");
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

  const filteredSnippets = useMemo(() => {
    if (!search.trim()) return snippets;
    const lowerSearch = search.toLowerCase();
    return snippets.filter(
      (s) =>
        s.caption.toLowerCase().includes(lowerSearch) ||
        s.sql.toLowerCase().includes(lowerSearch)
    );
  }, [snippets, search]);

  const userSnippets = useMemo(
    () => filteredSnippets.filter((s) => !s.builtin),
    [filteredSnippets]
  );
  const builtinSnippets = useMemo(
    () => filteredSnippets.filter((s) => s.builtin),
    [filteredSnippets]
  );

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

  const SnippetItem = ({ snippet }: { snippet: Snippet }) => {
    const isBuiltin = snippet.builtin;
    return (
      <div className="group flex items-center justify-between py-1.5 px-2 hover:bg-accent hover:text-accent-foreground rounded-sm text-sm transition-colors cursor-pointer">
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          {isBuiltin ? (
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Code className="h-4 w-4 shrink-0 text-blue-500" />
          )}
          <HoverCard openDelay={300}>
            <HoverCardTrigger asChild>
              <div className="flex flex-col overflow-hidden min-w-0">
                <span className="font-medium truncate">{snippet.caption}</span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="right" className="w-[400px] p-0 overflow-hidden">
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
        <div className="flex items-center gap-0.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity bg-accent">
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4"
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
            className="h-5 w-5"
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
              className="h-4 w-4"
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
                className="h-4 w-4"
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
                className="h-4 w-4 hover:text-destructive"
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

      <div className="p-2 space-y-4 h-full overflow-y-auto">
        {userSnippets.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider">
              User Defined
            </div>
            <div className="space-y-0.5">
              {userSnippets.map((s) => (
                <SnippetItem key={s.caption} snippet={s} />
              ))}
            </div>
          </div>
        )}

        {userSnippets.length > 0 && builtinSnippets.length > 0 && (
          <Separator className="my-2" />
        )}

        {builtinSnippets.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider">
              Built-in
            </div>
            <div className="space-y-0.5">
              {builtinSnippets.map((s) => (
                <SnippetItem key={s.caption} snippet={s} />
              ))}
            </div>
          </div>
        )}

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

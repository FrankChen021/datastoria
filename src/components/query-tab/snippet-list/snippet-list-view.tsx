import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <div className="flex flex-col overflow-hidden min-w-0">
                  <span className="font-medium truncate">{snippet.caption}</span>
                  <span className="text-xs text-muted-foreground truncate font-mono opacity-80">
                    {snippet.sql.replace(/\n/g, " ").substring(0, 50)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[300px] whitespace-pre-wrap font-mono text-xs">
                {snippet.sql}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Actions - visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-accent pl-2">
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
            <Play className="h-3 w-3" />
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
            <ArrowRight className="h-3 w-3" />
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
              <Pencil className="h-3 w-3" />
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
                <Pencil className="h-3 w-3" />
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
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="relative border-b p-2">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search snippets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8"
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

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
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
      </ScrollArea>

      <SaveSnippetDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        initialName={editMode === "clone" ? `${editingSnippet?.caption}_copy` : editingSnippet?.caption}
        initialSql={editingSnippet?.sql}
      />
    </div>
  );
}

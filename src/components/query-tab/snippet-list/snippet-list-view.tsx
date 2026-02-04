import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Code, FileText, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { QuerySnippetManager } from "../query-input/snippet/query-snippet-manager";
import { SaveSnippetDialog } from "../query-input/snippet/save-snippet-dialog";
import type { Snippet } from "../query-input/snippet/snippet";
import { SnippetItems } from "./snippet-items";
import type { UISnippet } from "./ui-snippet";
import { TextHighlighter } from "@/lib/text-highlighter";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

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
        <SnippetItems
          snippets={userSnippets}
          title="User Defined"
          onEdit={handleEdit}
          onClone={handleClone}
          onDelete={handleDelete}
        />

        <SnippetItems
          snippets={builtinSnippets}
          title="Built-in"
          onEdit={handleEdit}
          onClone={handleClone}
          onDelete={handleDelete}
        />

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

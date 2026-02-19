import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { QuerySnippetManager } from "./query-snippet-manager";
import { SaveSnippetDialog } from "./save-snippet-dialog";
import type { Snippet } from "./snippet";
import { SnippetItems } from "./snippet-items";
import type { UISnippet } from "./ui-snippet";

export function SnippetListView() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState("");
  const [userSnippets, setUserSnippets] = useState<UISnippet[]>([]);
  const [builtinSnippets, setBuiltinSnippets] = useState<UISnippet[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

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

  return (
    <div className="flex flex-col h-full w-full">
      <div className="relative border-b-2 flex items-center h-9">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search snippets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            "pl-8 rounded-none border-none flex-1 h-9",
            search.length > 0 ? "pr-16" : "pr-10"
          )}
        />
        {search && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-8 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
            onClick={() => setSearch("")}
            title="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
          onClick={() => setShowAddDialog(true)}
          title="Add new snippet"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-full overflow-y-auto">
        <SnippetItems userSnippets={userSnippets} builtinSnippets={builtinSnippets} />

        {userSnippets.length === 0 && builtinSnippets.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-4">No snippets found</div>
        )}
      </div>

      <SaveSnippetDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        initialSql=""
        initialName=""
      />
    </div>
  );
}

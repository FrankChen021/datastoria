import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Dialog } from "../../shared/use-dialog";
import { QuerySnippetManager } from "../snippet/query-snippet-manager";

interface OpenSaveSnippetDialogOptions {
  initialSql?: string;
  initialName?: string;
  onSaved?: () => void;
}

function SaveSnippetForm({
  initialName,
  initialSql,
  onSaved,
}: {
  initialName: string;
  initialSql: string;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [sql, setSql] = useState(initialSql);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const normalizedName = name.trim();
    const normalizedSql = sql.trim();

    if (!normalizedName) {
      setError("Name is required");
      return;
    }

    if (!normalizedSql) {
      setError("SQL is required");
      return;
    }

    const manager = QuerySnippetManager.getInstance();
    if (manager.hasSnippet(normalizedName)) {
      setError("Snippet name already exists");
      return;
    }

    try {
      manager.addSnippet(normalizedName, normalizedSql);
      onSaved?.();
      Dialog.close();
    } catch (saveError) {
      console.error(saveError);
      setError("Failed to save snippet");
    }
  };

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name(will be used as the suggestion for auto-completion)</Label>
        <Input
          id="name"
          placeholder="e.g., daily_active_users"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sql">SQL</Label>
        <Textarea
          id="sql"
          placeholder="SELECT * FROM ..."
          className="font-mono text-xs min-h-[150px]"
          value={sql}
          onChange={(e) => {
            setSql(e.target.value);
            setError(null);
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => Dialog.close()}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function openSaveSnippetDialog({
  initialSql = "",
  initialName = "",
  onSaved,
}: OpenSaveSnippetDialogOptions = {}) {
  Dialog.showDialog({
    title: "Save Snippet",
    description:
      "Save your query as a reusable snippet. You can access it from the snippet library or auto-complete it in the editor.",
    className: "sm:max-w-[800px]",
    mainContent: (
      <SaveSnippetForm initialName={initialName} initialSql={initialSql} onSaved={onSaved} />
    ),
  });
}

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { Dialog } from "../../shared/use-dialog";
import { QuerySnippetManager } from "../snippet/query-snippet-manager";

interface OpenSaveSnippetDialogOptions {
  initialSql?: string;
  initialName?: string;
  onSaved?: () => void;
}

interface SaveSnippetFormRef {
  getName: () => string;
  getSql: () => string;
  setError: (message: string | null) => void;
}

function SaveSnippetForm({
  initialName,
  initialSql,
  formRef,
}: {
  initialName: string;
  initialSql: string;
  formRef: { current: SaveSnippetFormRef | null };
}) {
  const [name, setName] = useState(initialName);
  const [sql, setSql] = useState(initialSql);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    formRef.current = {
      getName: () => name,
      getSql: () => sql,
      setError,
    };

    return () => {
      formRef.current = null;
    };
  }, [name, sql, formRef]);

  return (
    <div className="grid gap-4 py-4">
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
    </div>
  );
}

export function openSaveSnippetDialog({
  initialSql = "",
  initialName = "",
  onSaved,
}: OpenSaveSnippetDialogOptions = {}) {
  const formRef: { current: SaveSnippetFormRef | null } = { current: null };

  Dialog.showDialog({
    title: "Save Snippet",
    description:
      "Save your query as a reusable snippet. You can access it from the snippet library or auto-complete it in the editor.",
    className: "sm:max-w-[800px]",
    mainContent: (
      <SaveSnippetForm initialName={initialName} initialSql={initialSql} formRef={formRef} />
    ),
    dialogButtons: [
      {
        text: "Cancel",
        default: false,
        variant: "outline",
        onClick: async () => true,
      },
      {
        text: "Save",
        default: true,
        onClick: async () => {
          const name = formRef.current?.getName().trim() ?? "";
          const sql = formRef.current?.getSql().trim() ?? "";

          if (!name) {
            formRef.current?.setError("Name is required");
            return false;
          }
          if (!sql) {
            formRef.current?.setError("SQL is required");
            return false;
          }

          const manager = QuerySnippetManager.getInstance();
          if (manager.hasSnippet(name)) {
            formRef.current?.setError("Snippet name already exists");
            return false;
          }

          try {
            manager.addSnippet(name, sql);
            onSaved?.();
            return true;
          } catch (error) {
            console.error(error);
            formRef.current?.setError("Failed to save snippet");
            return false;
          }
        },
      },
    ],
  });
}

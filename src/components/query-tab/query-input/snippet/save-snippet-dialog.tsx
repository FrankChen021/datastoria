import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { QuerySnippetManager } from "../snippet/query-snippet-manager";

interface SaveSnippetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSql?: string;
  initialName?: string;
  onSaved?: () => void;
}

export function SaveSnippetDialog({
  open,
  onOpenChange,
  initialSql = "",
  initialName = "",
  onSaved,
}: SaveSnippetDialogProps) {
  const [name, setName] = useState(initialName);
  const [sql, setSql] = useState(initialSql);
  const [error, setError] = useState<string | null>(null);

  // Update state when initial values change
  useEffect(() => {
    if (open) {
      setName(initialName);
      setSql(initialSql);
      setError(null);
    }
  }, [open, initialName, initialSql]);

  const handleSave = () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!sql.trim()) {
      setError("SQL is required");
      return;
    }

    try {
      const manager = QuerySnippetManager.getInstance();
      
      // If updating an existing snippet (based on name match), we are just overwriting it.
      // If we wanted to support "renaming" where we delete the old one, we'd need the old name passed in.
      // For now, this is a simple save/overwrite by name.
      
      manager.addSnippet(name, sql);
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      setError("Failed to save snippet");
      console.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Snippet</DialogTitle>
          <DialogDescription>
            Save your query as a reusable snippet. You can access it from the snippet library or auto-complete it in the editor.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., daily_active_users"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sql">SQL</Label>
            <Textarea
              id="sql"
              placeholder="SELECT * FROM ..."
              className="font-mono text-xs min-h-[150px]"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

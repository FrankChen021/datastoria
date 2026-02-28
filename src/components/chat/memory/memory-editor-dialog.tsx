"use client";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PIN_PRIORITY } from "@/lib/ai/memory/memory-retrieval-spec";
import type { MemoryRecord } from "@/lib/ai/memory/memory-types";
import { useEffect, useState } from "react";

export interface MemoryEditorValue {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  pinPriority: 1 | 2 | 3;
}

function toValue(record?: Partial<MemoryRecord> | null): MemoryEditorValue {
  return {
    title: record?.title ?? "",
    content: record?.content ?? "",
    tags: record?.tags ?? [],
    pinned: record?.pinned ?? false,
    pinPriority: (record?.pinPriority ?? DEFAULT_PIN_PRIORITY) as 1 | 2 | 3,
  };
}

export function MemoryEditorDialog({
  open,
  onOpenChange,
  record,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: Partial<MemoryRecord> | null;
  onSave: (value: MemoryEditorValue) => Promise<void> | void;
}) {
  const [value, setValue] = useState<MemoryEditorValue>(() => toValue(record));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(toValue(record));
  }, [record, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{record?.id ? "Edit Memory" : "Create Memory"}</DialogTitle>
          <DialogDescription>
            Edit the durable memory record that the agent can reuse across chats.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="memory-title">Title</Label>
            <Input
              id="memory-title"
              value={value.title}
              onChange={(event) =>
                setValue((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="memory-content">Content</Label>
            <Textarea
              id="memory-content"
              rows={5}
              value={value.content}
              onChange={(event) =>
                setValue((current) => ({ ...current, content: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="memory-tags">Tags</Label>
            <Input
              id="memory-tags"
              value={value.tags.join(", ")}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  tags: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Pinned</div>
              <div className="text-xs text-muted-foreground">
                Pinned memories are favored during prompt retrieval.
              </div>
            </div>
            <Switch
              checked={value.pinned}
              onCheckedChange={(checked) =>
                setValue((current) => ({ ...current, pinned: checked }))
              }
            />
          </div>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
            <div className="mt-3 grid gap-2">
              <Label htmlFor="memory-pin-priority">Pin priority</Label>
              <select
                id="memory-pin-priority"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={value.pinPriority}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    pinPriority: Number(event.target.value) as 1 | 2 | 3,
                  }))
                }
              >
                <option value={1}>1 - Low</option>
                <option value={2}>2 - Normal</option>
                <option value={3}>3 - High</option>
              </select>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || !value.title.trim() || !value.content.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(value);
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

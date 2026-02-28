"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DEFAULT_MEMORY_PAGE_SIZE,
  MEMORY_PIN_SOFT_CAP,
} from "@/lib/ai/memory/memory-retrieval-spec";
import { MemoryService } from "@/lib/ai/memory/memory-service";
import type { MemoryKind, MemoryRecord, MemoryStatus } from "@/lib/ai/memory/memory-types";
import { StorageManager } from "@/lib/storage/storage-provider-manager";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MemoryEditorDialog, type MemoryEditorValue } from "./memory-editor-dialog";
import { MemoryList } from "./memory-list";

type FilterState = {
  search: string;
  kind: MemoryKind | "all";
  status: MemoryStatus | "all";
};

export function MemoryPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [filter, setFilter] = useState<FilterState>({ search: "", kind: "all", status: "active" });
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<MemoryRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const pinnedCount = useMemo(
    () => records.filter((record) => record.status === "active" && record.pinned).length,
    [records]
  );

  const load = async () => {
    const result = filter.search.trim()
      ? await MemoryService.search({
          text: filter.search,
          kind: filter.kind === "all" ? undefined : filter.kind,
          status: filter.status === "all" ? undefined : filter.status,
          limit: DEFAULT_MEMORY_PAGE_SIZE,
          offset,
        })
      : await MemoryService.list({
          kind: filter.kind === "all" ? undefined : filter.kind,
          status: filter.status === "all" ? undefined : filter.status,
          limit: DEFAULT_MEMORY_PAGE_SIZE,
          offset,
        });

    setRecords(result.records);
    setTotal(result.total);
  };

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, offset]);

  const handleSave = async (value: MemoryEditorValue) => {
    const userId = StorageManager.getInstance().getCurrentUserId();
    if (editing) {
      await MemoryService.updateMemory({
        ...editing,
        title: value.title,
        content: value.content,
        tags: value.tags,
        pinned: value.pinned,
        pinPriority: value.pinPriority,
      });
    } else {
      await MemoryService.saveManualMemory({
        userId,
        scopeType: "user",
        kind: "preference",
        title: value.title,
        content: value.content,
        tags: value.tags,
        confidence: 1,
        pinned: value.pinned,
        pinPriority: value.pinPriority,
        writeMode: "manual",
        sourceType: "manual",
        status: "active",
        deletedAt: undefined,
      });
    }
    setEditing(null);
    await load();
  };

  const maxPage = Math.max(1, Math.ceil(total / DEFAULT_MEMORY_PAGE_SIZE));
  const currentPage = Math.floor(offset / DEFAULT_MEMORY_PAGE_SIZE) + 1;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Memory Manager</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_180px_auto]">
              <div className="grid gap-1">
                <Label htmlFor="memory-search">Search</Label>
                <Input
                  id="memory-search"
                  value={filter.search}
                  onChange={(event) => {
                    setOffset(0);
                    setFilter((current) => ({ ...current, search: event.target.value }));
                  }}
                  placeholder="Search title, content, or tags"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="memory-kind">Kind</Label>
                <select
                  id="memory-kind"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={filter.kind}
                  onChange={(event) => {
                    setOffset(0);
                    setFilter((current) => ({
                      ...current,
                      kind: event.target.value as FilterState["kind"],
                    }));
                  }}
                >
                  <option value="all">All kinds</option>
                  <option value="preference">Preference</option>
                  <option value="connection_fact">Connection fact</option>
                  <option value="workflow_note">Workflow note</option>
                  <option value="investigation_finding">Finding</option>
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="memory-status">Status</Label>
                <select
                  id="memory-status"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={filter.status}
                  onChange={(event) => {
                    setOffset(0);
                    setFilter((current) => ({
                      ...current,
                      status: event.target.value as FilterState["status"],
                    }));
                  }}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="deleted">Deleted</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full md:w-auto"
                  onClick={() => {
                    setEditing(null);
                    setEditorOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New memory
                </Button>
              </div>
            </div>

            {pinnedCount > MEMORY_PIN_SOFT_CAP && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                You currently have more than {MEMORY_PIN_SOFT_CAP} pinned memories in this view.
                Retrieval will start omitting lower-priority pins when the prompt budget is
                exceeded.
              </div>
            )}

            <Separator />

            <MemoryList
              records={records}
              onEdit={(record) => {
                setEditing(record);
                setEditorOpen(true);
              }}
              onArchive={async (record) => {
                await MemoryService.archiveMemory(record.id);
                await load();
              }}
              onDelete={async (record) => {
                await MemoryService.deleteMemory(record.id);
                await load();
              }}
            />

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {maxPage}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() =>
                    setOffset((current) => Math.max(0, current - DEFAULT_MEMORY_PAGE_SIZE))
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={offset + DEFAULT_MEMORY_PAGE_SIZE >= total}
                  onClick={() => setOffset((current) => current + DEFAULT_MEMORY_PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MemoryEditorDialog
        open={editorOpen}
        onOpenChange={(next) => {
          setEditorOpen(next);
          if (!next) {
            setEditing(null);
          }
        }}
        record={editing}
        onSave={handleSave}
      />
    </>
  );
}

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MemoryRecord } from "@/lib/ai/memory/memory-types";
import { Archive, Pencil, Pin, PinOff, Trash2 } from "lucide-react";

export function MemoryList({
  records,
  onEdit,
  onArchive,
  onDelete,
}: {
  records: MemoryRecord[];
  onEdit: (record: MemoryRecord) => void;
  onArchive: (record: MemoryRecord) => void;
  onDelete: (record: MemoryRecord) => void;
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        No memories match the current filters.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {records.map((record) => (
        <div key={record.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-medium">{record.title}</div>
                <Badge variant="outline">{record.kind}</Badge>
                <Badge variant="secondary">{record.scopeType}</Badge>
                {record.pinned ? (
                  <Badge variant="default" className="gap-1">
                    <Pin className="h-3 w-3" />P{record.pinPriority ?? 2}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    <PinOff className="h-3 w-3" />
                    Not pinned
                  </Badge>
                )}
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {record.content}
              </div>
              {record.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {record.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(record)}
                title="Edit memory"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onArchive(record)}
                title="Archive memory"
              >
                <Archive className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => onDelete(record)}
                title="Delete memory"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

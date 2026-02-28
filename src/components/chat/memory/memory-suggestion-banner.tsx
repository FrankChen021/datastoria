"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { MemoryCandidate } from "@/lib/ai/memory/memory-types";

export function MemorySuggestionBanner({
  candidate,
  onAccept,
  onDismiss,
  onEdit,
}: {
  candidate: MemoryCandidate | null;
  onAccept: () => Promise<void> | void;
  onDismiss: () => void;
  onEdit: () => void;
}) {
  if (!candidate) return null;

  return (
    <div className="border-t px-3 pt-3">
      <Alert>
        <AlertTitle>Remember this preference?</AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <div>{candidate.content}</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onAccept}>
              Remember
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

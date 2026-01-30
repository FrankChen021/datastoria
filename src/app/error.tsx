"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 shadow-sm">
        <AlertTriangle className="size-12 text-destructive" aria-hidden />
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-center text-sm text-muted-foreground">{error.message}</p>
        <Button type="button" variant="default" onClick={() => reset()} className="gap-2">
          <RotateCcw className="size-4" aria-hidden />
          Try again
        </Button>
      </div>
    </div>
  );
}

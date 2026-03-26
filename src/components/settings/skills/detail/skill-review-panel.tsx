"use client";

import { Button } from "@/components/ui/button";
import type { SkillReviewResponse } from "@/lib/ai/skills/skill-review";
import { X } from "lucide-react";
import { memo } from "react";
import { SkillMarkdownRenderer } from "./skill-markdown-renderer";

export const SkillReviewPanel = memo(function SkillReviewPanel({
  review,
  onDismiss,
}: {
  review: SkillReviewResponse;
  onDismiss: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b px-4">
        <p className="text-xs font-medium text-muted-foreground">Review Findings</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-xs"
          onClick={onDismiss}
          aria-label="Dismiss review findings"
        >
          <X className="!h-3.5 !w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <SkillMarkdownRenderer raw={review.findings} />
      </div>
    </div>
  );
});

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SkillDetailResponse } from "@/lib/ai/skills/skill-provider";
import { Loader2, Upload } from "lucide-react";
import { memo } from "react";

export const SkillDetailHeader = memo(function SkillDetailHeader({
  detail,
  allowEditSkill,
  canPublish,
  canRevert: canDiscard,
  isPublishing,
  isReverting,
  onRevert: onDiscard,
  onPublish,
}: {
  detail: SkillDetailResponse;
  allowEditSkill: boolean;
  canPublish: boolean;
  canRevert: boolean;
  isPublishing: boolean;
  isReverting: boolean;
  onRevert: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold">{detail.name}</span>
        {detail.version ? (
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-xs">
            v{detail.version}
          </Badge>
        ) : null}
        {detail.author ? (
          <span className="shrink-0 text-xs text-muted-foreground">author: {detail.author}</span>
        ) : null}
      </div>
      {allowEditSkill ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {canDiscard && (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onDiscard}>
              {isReverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Discard Draft
            </Button>
          )}
          <Button size="sm" className="h-7 px-2 text-xs" onClick={onPublish} disabled={!canPublish}>
            {isPublishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Publish
          </Button>
        </div>
      ) : null}
    </div>
  );
});

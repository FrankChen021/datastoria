"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SkillCatalogItem } from "@/lib/ai/skills/skill-manager";

interface SkillsCardProps {
  skill: SkillCatalogItem;
  onClick: (skill: SkillCatalogItem) => void;
}

export function SkillsCard({ skill, onClick }: SkillsCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => onClick(skill)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-snug">{skill.name}</CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            {skill.source === "built-in" && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                Built-in
              </Badge>
            )}
            {skill.version && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 font-mono">
                v{skill.version}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground line-clamp-3">
          {skill.summary || skill.description}
        </p>
        {skill.provider && (
          <p className="mt-2 text-xs text-muted-foreground/70">by {skill.provider}</p>
        )}
      </CardContent>
    </Card>
  );
}

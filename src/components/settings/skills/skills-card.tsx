"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SkillCatalogItem } from "@/lib/ai/skills/skill-types";

interface SkillsCardProps {
  skill: SkillCatalogItem;
  onClick: (skill: SkillCatalogItem) => void;
}

export function SkillsCard({ skill, onClick }: SkillsCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors flex flex-col h-full"
      onClick={() => onClick(skill)}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-semibold leading-snug line-clamp-2 flex-1">
            {skill.name}
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {skill.version && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                v{skill.version}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 flex flex-col">
        <div className="h-8 overflow-hidden">
          <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
        </div>
        <p
          className="mt-1.5 text-xs text-muted-foreground/70"
          style={{ visibility: skill.author ? "visible" : "hidden" }}
        >
          {skill.author ? `author: ${skill.author}` : "\u00a0"}
        </p>
      </CardContent>
    </Card>
  );
}

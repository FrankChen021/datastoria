"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { SkillCatalogItem } from "@/lib/ai/skills/skill-types";
import { BasePath } from "@/lib/base-path";
import { useCallback, useEffect, useState } from "react";
import { SkillsCard } from "./skills-card";
import { SkillsDetailView } from "./skills-detail-view";

export function SkillsEdit({ initialSkillId }: { initialSkillId?: string }) {
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(initialSkillId ?? null);

  const loadSkills = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch(BasePath.getURL("/api/ai/skills"))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SkillCatalogItem[]>;
      })
      .then((data) => {
        setSkills(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load skills");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  if (selectedSkillId) {
    return (
      <SkillsDetailView
        skillId={selectedSkillId}
        onBack={() => {
          setSelectedSkillId(null);
          loadSkills();
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto px-4 py-4">
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : skills.length === 0 ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-sm text-muted-foreground">No skills found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {skills.map((skill) => (
            <SkillsCard key={skill.id} skill={skill} onClick={(s) => setSelectedSkillId(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

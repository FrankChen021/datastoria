"use client";

import { Dialog } from "@/components/shared/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import { Bug, ChevronDown, ChevronRight, Rocket, Zap } from "lucide-react";
import { useEffect, useState } from "react";

const TYPE_PRIORITY_ORDER: Array<"highlight" | "feature" | "fix"> = ["highlight", "feature", "fix"];

const TYPE_LABELS: Record<"highlight" | "feature" | "fix", string> = {
  highlight: "Highlights",
  feature: "Features",
  fix: "Bug fixes",
};

interface ReleaseNoteItem {
  text: string;
  pr: number | null;
  type: "highlight" | "feature" | "fix";
  merged_at?: string | null;
}

interface Release {
  id: string;
  date: string;
  notes: ReleaseNoteItem[];
  repo_url?: string;
}

function groupNotesByType(notes: ReleaseNoteItem[]) {
  const byType: Record<"highlight" | "feature" | "fix", ReleaseNoteItem[]> = {
    highlight: [],
    feature: [],
    fix: [],
  };
  for (const note of notes) {
    byType[note.type].push(note);
  }
  for (const type of TYPE_PRIORITY_ORDER) {
    byType[type].sort((a, b) => {
      const aTime = a.merged_at ? new Date(a.merged_at).getTime() : 0;
      const bTime = b.merged_at ? new Date(b.merged_at).getTime() : 0;
      return bTime - aTime; // latest first
    });
  }
  return byType;
}

function ReleaseNoteRow({ note, repoUrl }: { note: ReleaseNoteItem; repoUrl: string }) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 p-1 rounded-md transition-colors",
        note.type === "highlight" ? "bg-primary/5 border border-primary/10" : "hover:bg-accent/50"
      )}
    >
      <div className="mt-1 shrink-0">
        {note.type === "highlight" && <Zap className="h-4 w-4 text-amber-500 fill-amber-500/20" />}
        {note.type === "feature" && <Rocket className="h-4 w-4 text-blue-500" />}
        {note.type === "fix" && <Bug className="h-4 w-4 text-green-500" />}
      </div>
      <div className="flex-1 min-w-0 space-y-0">
        <p className="text-sm text-foreground leading-relaxed">
          {note.pr ? (
            <a
              href={`${repoUrl}/pull/${note.pr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1"
            >
              {note.text}{" "}
            </a>
          ) : (
            note.text
          )}
        </p>
      </div>
    </div>
  );
}

export function ReleaseNotesView() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/release-notes.json")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [data];
        setReleases(list);
        if (list.length > 0) setExpandedId(list[0].id);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load release notes:", err);
        setLoading(false);
      });
  }, []);

  if (loading && releases.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (releases.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No release notes available.</div>;
  }

  const repoUrl = releases[0]?.repo_url ?? "https://github.com/FrankChen021/datastoria";

  return (
    <ScrollArea className="h-full pr-4">
      <div className="space-y-1 py-2">
        {releases.map((release, index) => {
          const isLatest = index === 0;
          const isExpanded = expandedId === release.id;
          const grouped = groupNotesByType(release.notes);

          return (
            <Collapsible
              key={release.id}
              open={isExpanded}
              onOpenChange={(open) => setExpandedId(open ? release.id : null)}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-2 text-left hover:bg-accent/50 transition-colors group/trigger">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold text-foreground">
                  {DateTimeExtension.formatDateTime(new Date(release.date), "yyyy-MM-dd")}
                </span>
                <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono font-normal">
                  {release.notes.length > 0 ? `${release.notes.length} Improvements` : ""}
                </Badge>
                <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono font-normal">
                  {release.id.substring(0, 7)}
                </Badge>
                {isLatest && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] py-0 px-1 bg-blue-500/10 text-blue-500 border-blue-500/20"
                  >
                    Latest
                  </Badge>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-4 pb-4 pt-1 border-l ml-2 pl-6">
                  {TYPE_PRIORITY_ORDER.map((type) => {
                    const items = grouped[type];
                    if (items.length === 0) return null;
                    return (
                      <div key={type} className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {TYPE_LABELS[type]}
                        </p>
                        <div className="space-y-0.5">
                          {items.map((note, idx) => (
                            <ReleaseNoteRow
                              key={`${note.pr ?? idx}-${note.text.slice(0, 20)}`}
                              note={note}
                              repoUrl={repoUrl}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </ScrollArea>
  );
}

export function openReleaseNotes() {
  Dialog.showDialog({
    title: "What's New",
    description: "Latest updates and improvements to DataStoria",
    mainContent: <ReleaseNotesView />,
    className: "max-w-2xl h-[60vh]",
  });
}

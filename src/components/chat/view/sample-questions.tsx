"use client";

import { AppLogo } from "@/components/app-logo";
import { useChatCommands } from "@/components/chat/command-context";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Activity, BarChart, Code2, Globe, Lightbulb, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Question = { text: string; autoRun?: boolean; requiredSkillId?: string };

export type QuestionGroupData = {
  icon: ReactNode;
  questions: Question[];
};

export const DEFAULT_CHAT_QUESTION_GROUPS: Record<string, QuestionGroupData> = {
  Diagnostics: {
    icon: <Activity className="h-4 w-4 text-blue-500" />,
    questions: [
      { text: "What's the status of the current cluster?", autoRun: true },
      { text: "Which table has the largest number of parts and what's the cause?", autoRun: true },
    ],
  },
  "Data Exploration": {
    icon: <Globe className="h-4 w-4 text-green-500" />,
    questions: [
      {
        text: "What're the top 3 SELECT queries that consume the most CPU time over the past 3 hours?",
        autoRun: true,
      },
      {
        text: "How many INSERT queries, insert rows, insert bytes were executed in the last 1 hour from @system.query_log ?",
        autoRun: true,
      },
    ],
  },
  Visualization: {
    icon: <BarChart className="h-4 w-4 text-purple-500" />,
    questions: [
      {
        text: "Show me the number of SELECT queries by minute from @system.query_log over the past 3 hours in bar chart",
        autoRun: true,
      },
      {
        text: "Visualize the trend of ProfileEvent_DistributedConnectionFailTry from the @system.metric_log by hour in the last 12 hours",
        autoRun: true,
      },
      {
        text: "Show the distribution of query kind from the @system.query_log in the last 12 hours in pie chart",
        autoRun: true,
      },
    ],
  },
  "SQL Optimization": {
    icon: <Zap className="h-4 w-4 text-amber-500" />,
    questions: [
      { text: "Help me optimize a query", autoRun: true },
      { text: "Find the top 1 slowest query in the last 1 day and optimize it", autoRun: true },
    ],
  },
  "SQL Generation": {
    icon: <Code2 className="h-4 w-4 text-green-500" />,
    questions: [
      {
        text: "Generate a SELECT query to get the slowest query from the query log in the last 1 hour",
        autoRun: true,
      },
    ],
  },
  General: {
    icon: <Lightbulb className="h-4 w-4 text-yellow-500" />,
    questions: [
      { text: "What are the best practices for partitioning?", autoRun: true },
      {
        text: "How does async_insert work from the source code? Will data be lost if the server is restarted when this setting is enabled?",
        autoRun: true,
        requiredSkillId: "source-code-inspection",
      },
    ],
  },
};

const GREETINGS = [
  "Hello there! How can I help you today?",
  "Hi there! What would you like to explore?",
  "Good to see you! Ready to dive into your data?",
  "Nice to meet you! What can I help you analyze?",
  "Hello and welcome! Let's explore your ClickHouse cluster and data!",
];

function SampleQuestionsShell({ greeting, children }: { greeting: string; children: ReactNode }) {
  return (
    <div
      data-sample-questions-scroll-root="true"
      className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-2"
    >
      <div className="mb-0 flex shrink-0 w-full max-w-full flex-col items-center pb-0">
        <div className="mb-0">
          <AppLogo width={64} height={64} />
        </div>
        <p className="mt-0 mb-0 text-center text-xl font-medium">{greeting}</p>
      </div>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto mt-6 grid w-full max-w-5xl gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
      <div className="hidden flex-col gap-2 md:flex">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-36 rounded-lg" />
        ))}
      </div>
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SampleQuestions({
  onQuestionClick,
}: {
  onQuestionClick: (question: Question) => void;
}) {
  const { commands, loading } = useChatCommands();
  const isMobile = useIsMobile();
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);

  const availableSkillIds = useMemo(
    () => new Set(commands.map((command) => command.skillId)),
    [commands]
  );

  const filteredGroups = useMemo(() => {
    return Object.entries(DEFAULT_CHAT_QUESTION_GROUPS)
      .map(([group, data]) => {
        const questions = data.questions.filter(
          (question) => !question.requiredSkillId || availableSkillIds.has(question.requiredSkillId)
        );
        return [group, { ...data, questions }] as const;
      })
      .filter(([, data]) => data.questions.length > 0);
  }, [availableSkillIds]);

  useEffect(() => {
    setActiveGroup(filteredGroups[0]?.[0] ?? null);
  }, [filteredGroups]);

  useEffect(() => {
    if (isMobile || filteredGroups.length === 0) {
      return;
    }

    const scrollRoot = rightPaneRef.current;
    if (!(scrollRoot instanceof HTMLElement)) {
      return;
    }

    const updateActiveGroup = () => {
      const rootRect = scrollRoot.getBoundingClientRect();
      const threshold = rootRect.top + 12;
      let nextGroup = filteredGroups[filteredGroups.length - 1]?.[0] ?? null;

      for (let index = 0; index < filteredGroups.length; index += 1) {
        const [group] = filteredGroups[index];
        const section = sectionRefs.current[group];
        if (!section) {
          continue;
        }

        const rect = section.getBoundingClientRect();

        if (rect.bottom > threshold) {
          nextGroup = group;
          break;
        }
      }

      setActiveGroup((current) => (current === nextGroup ? current : nextGroup));
    };

    updateActiveGroup();

    let ticking = false;
    const onScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateActiveGroup();
      });
    };

    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      scrollRoot.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [filteredGroups, isMobile]);

  if (loading) {
    return (
      <SampleQuestionsShell greeting={greeting}>
        <LoadingSkeleton />
      </SampleQuestionsShell>
    );
  }

  if (filteredGroups.length === 0) {
    return null;
  }

  const questionCardClassName =
    "group relative w-full rounded-xl border border-border/50 bg-card px-3 py-3 text-left shadow-sm transition-colors duration-150 hover:border-primary/40 hover:bg-accent/60 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0 active:bg-accent/70";

  const renderGroupSection = (
    [group, { icon, questions }]: readonly [string, QuestionGroupData],
    index: number
  ) => (
    <section
      key={group}
      ref={(element) => {
        sectionRefs.current[group] = element;
      }}
      data-group-name={group}
      className={cn("space-y-1.5", index > 0 && "pt-1")}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/40">
            {icon}
          </div>
          <h3 className="text-base font-semibold text-foreground">{group}</h3>
        </div>
        <div className="h-px bg-border/60" />
      </div>
      <div className="space-y-2">
        {questions.map((question) => (
          <button
            key={question.text}
            type="button"
            className={questionCardClassName}
            onClick={() => onQuestionClick(question)}
          >
            <span className="block break-words [overflow-wrap:anywhere] text-sm font-medium leading-6 text-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary">
              {question.text}
            </span>
          </button>
        ))}
      </div>
    </section>
  );

  if (isMobile) {
    return (
      <SampleQuestionsShell greeting={greeting}>
        <div className="mx-auto mt-6 w-full max-w-3xl flex-1 overflow-y-auto space-y-6">
          {filteredGroups.map(renderGroupSection)}
        </div>
      </SampleQuestionsShell>
    );
  }

  return (
    <SampleQuestionsShell greeting={greeting}>
      <div className="mx-auto mt-6 grid min-h-0 flex-1 w-full max-w-5xl gap-0 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden self-start md:block">
          <div className="space-y-1">
            {filteredGroups.map(([group, { icon }]) => {
              const isActive = group === activeGroup;
              return (
                <button
                  key={group}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-muted/40 text-foreground"
                      : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                  )}
                  onClick={() => {
                    const scrollRoot = rightPaneRef.current;
                    const section = sectionRefs.current[group];
                    if (!scrollRoot || !section) {
                      return;
                    }

                    setActiveGroup(group);
                    section.scrollIntoView({
                      block: "start",
                      behavior: "smooth",
                    });
                  }}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center opacity-80 transition-opacity",
                      isActive ? "opacity-100" : "opacity-70"
                    )}
                  >
                    {icon}
                  </span>
                  <span className="truncate font-medium">{group}</span>
                </button>
              );
            })}
          </div>
        </nav>
        <div
          ref={rightPaneRef}
          data-sample-questions-right-pane="true"
          className="min-h-0 self-stretch space-y-6 overflow-y-auto md:pr-2"
        >
          {filteredGroups.map(renderGroupSection)}

          {/* 24rem = 384px padding for scroll */}
          <div aria-hidden="true" className="hidden md:block md:h-[24rem]" />
        </div>
      </div>
    </SampleQuestionsShell>
  );
}

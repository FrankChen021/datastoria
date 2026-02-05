"use client";

import { Button } from "@/components/ui/button";
import { Fragment, memo, useMemo } from "react";

export type UserAction = {
  id: string;
  action: (onClick: () => void) => React.ReactNode;
  text: string;
  autoRun: boolean;
  breakAfter?: boolean;
};

type UserActionType = "optimization_skill_input";

const renderActionButton = (label: string | React.ReactNode, onClick: () => void) => (
  <Button
    type="button"
    size="sm"
    variant="secondary"
    className="rounded-md shadow-sm hover:shadow-md transition-shadow border border-border/50 text-xs h-8"
    onClick={onClick}
  >
    {label}
  </Button>
);

const ACTIONS_BY_TYPE: Record<UserActionType, { hint: string; actions: UserAction[] }> = {
  optimization_skill_input: {
    hint: "You can use the following quick actions to provide more context to get optimization suggestions, or provide context in the chat.",
    actions: [
      {
        id: "provide_sql",
        action: (onClick) => renderActionButton("I have a SQL", onClick),
        text: "Please optimize this SQL:\n<sql>",
        autoRun: false,
      },
      {
        id: "provide_query_id",
        action: (onClick) => renderActionButton("I have a query_id", onClick),
        text: "My query_id is: <paste here>",
        autoRun: false,
        breakAfter: true,
      },
      {
        id: "find_duration_24h",
        action: (onClick) =>
          renderActionButton(
            <span>
              Find and optimize <span className="font-bold text-primary">SLOWEST</span> queries
              (last 24h)
            </span>,
            onClick
          ),
        text: "Find expensive queries by duration in the last 24 hours",
        autoRun: true,
      },
      {
        id: "find_cpu_24h",
        action: (onClick) =>
          renderActionButton(
            <span>
              Find and optimize queries that use the{" "}
              <span className="font-bold text-primary">most CPU</span> (last 24h)
            </span>,
            onClick
          ),
        text: "Find slowest queries by cpu in the last 24 hours",
        autoRun: true,
      },
      {
        id: "find_memory_24h",
        action: (onClick) =>
          renderActionButton(
            <span>
              Find and optimize queries that use the{" "}
              <span className="font-bold text-primary">most memory</span> (last 24h)
            </span>,
            onClick
          ),
        text: "Find expensive queries by memory in the last 24 hours",
        autoRun: true,
      },
      {
        id: "find_disk_24h",
        action: (onClick) =>
          renderActionButton(
            <span>
              Find and optimize queries that read the{" "}
              <span className="font-bold text-primary">most disk</span> (last 24h)
            </span>,
            onClick
          ),
        text: "Find expensive queries by disk in the last 24 hours",
        autoRun: true,
      },
    ],
  },
};

export const MessageMarkdownUserActions = memo(function MessageMarkdownUserActions({
  spec,
  onAction,
}: {
  spec: string;
  onAction?: (action: UserAction) => void;
}) {
  const actionType = useMemo(() => {
    try {
      const payload = JSON.parse(spec) as { type?: UserActionType };
      return payload?.type;
    } catch {
      return undefined;
    }
  }, [spec]);

  if (!actionType || !onAction) {
    return null;
  }

  const config = ACTIONS_BY_TYPE[actionType];
  if (!config || config.actions.length === 0) {
    return null;
  }

  const actionGroups = useMemo(() => {
    if (!config) return [];
    const groups: UserAction[][] = [];
    let currentGroup: UserAction[] = [];

    config.actions.forEach((action) => {
      currentGroup.push(action);
      if (action.breakAfter) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }, [config]);

  return (
    <div className="mt-3 bg-muted/30 font-sans border-t pt-2">
      <div className="text-sm font-medium text-foreground/80 mb-3">{config.hint}</div>
      <div className="flex flex-col gap-2">
        {actionGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="flex flex-wrap gap-2">
            {group.map((action) => (
              <Fragment key={action.id}>{action.action(() => onAction(action))}</Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

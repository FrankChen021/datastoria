"use client";

import { Button } from "@/components/ui/button";
import { Fragment, memo, useMemo } from "react";

export type UserAction = {
  id: string;
  label: string;
  text: string;
  autoRun: boolean;
  breakAfter?: boolean;
};

type UserActionType = "optimization_skill_input";

const ACTIONS_BY_TYPE: Record<UserActionType, { hint: string; actions: UserAction[] }> = {
  optimization_skill_input: {
    hint: "You can use the following quick actions to provide more context to get optimization suggestions, or provide context in the chat.",
    actions: [
      {
        id: "provide_query_id",
        label: "I have a query_id",
        text: "My query_id is: <paste here>",
        autoRun: false,
      },
      {
        id: "provide_sql",
        label: "I have SQL",
        text: "Please optimize this SQL:\n<sql>",
        autoRun: false,
        breakAfter: true,
      },
      {
        id: "find_cpu_60m",
        label: "Find expensive queries by CPU (last 1h)",
        text: "Find expensive queries by cpu in the last 60 minutes",
        autoRun: true,
      },
      {
        id: "find_memory_60m",
        label: "Find expensive queries by memory (last 1h)",
        text: "Find expensive queries by memory in the last 60 minutes",
        autoRun: true,
      },
      {
        id: "find_duration_60m",
        label: "Find expensive queries by duration (last 1h)",
        text: "Find expensive queries by duration in the last 60 minutes",
        autoRun: true,
      },
      {
        id: "find_disk_60m",
        label: "Find expensive queries by disk (last 1h)",
        text: "Find expensive queries by disk in the last 60 minutes",
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

  return (
    <div className="mt-3 bg-muted/30 font-sans border-t pt-2">
      <div className="text-sm font-medium text-foreground/80 mb-3">{config.hint}</div>
      <div className="flex flex-wrap gap-2">
        {config.actions.map((action) => (
          <Fragment key={action.id}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-md shadow-sm hover:shadow-md transition-shadow border border-border/50"
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
            {action.breakAfter && <div className="w-full h-0" />}
          </Fragment>
        ))}
      </div>
    </div>
  );
});

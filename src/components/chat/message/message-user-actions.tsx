"use client";

import { Button } from "@/components/ui/button";
import { memo } from "react";

export type UserAction = {
  id: string;
  label: string;
  text: string;
  autoRun: boolean;
};

type UserActionType = "find_expensive_queries_input";

const ACTIONS_BY_TYPE: Record<UserActionType, UserAction[]> = {
  find_expensive_queries_input: [
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
    },
  ],
};

const USER_ACTION_BLOCK = /```user_actions\s*([\s\S]*?)```/;

export function extractUserActionBlock(text: string): {
  cleanedText: string;
  actionType?: UserActionType;
} {
  const match = text.match(USER_ACTION_BLOCK);
  if (!match) {
    return { cleanedText: text };
  }

  const payloadText = match[1].trim();
  try {
    const payload = JSON.parse(payloadText) as { type?: string };
    if (payload?.type !== "find_expensive_queries_input") {
      return { cleanedText: text };
    }

    const cleanedText = text.replace(match[0], "").trim();
    return { cleanedText, actionType: payload.type };
  } catch {
    return { cleanedText: text };
  }
}

export const MessageUserActions = memo(function MessageUserActions({
  actionType,
  onAction,
}: {
  actionType?: UserActionType;
  onAction?: (action: UserAction) => void;
}) {
  if (!actionType || !onAction) {
    return null;
  }

  const actions = ACTIONS_BY_TYPE[actionType];
  if (!actions || actions.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.id}
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onAction(action)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
});

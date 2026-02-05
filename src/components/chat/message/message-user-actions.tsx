"use client";

import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Fragment, memo, useMemo } from "react";
import { useChatAction } from "../chat-action-context";

export type UserAction = {
  id: string;
  action: (onInput: (value: string) => void) => React.ReactNode;
  text: string;
  autoRun: boolean;
  breakAfter?: boolean;
};

type UserActionConfig = Omit<UserAction, "text">;

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

const InputAction = ({
  label,
  title,
  description,
  placeholder,
  onInput,
}: {
  label: string;
  title: string;
  description: string;
  placeholder: string;
  onInput: (value: string) => void;
}) => {
  const handleClick = () => {
    let value = "";
    Dialog.showDialog({
      title,
      description,
      mainContent: (
        <div className="py-2">
          <Textarea
            placeholder={placeholder}
            className="min-h-[150px] font-mono text-sm"
            onChange={(e) => (value = e.target.value)}
          />
        </div>
      ),
      dialogButtons: [
        {
          text: "Cancel",
          onClick: async () => true,
          default: false,
        },
        {
          text: "Analyze",
          variant: "default",
          default: true,
          onClick: async () => {
            if (!value.trim()) return false;
            onInput(value.trim());
            return true;
          },
        },
      ],
    });
  };

  return renderActionButton(label, handleClick);
};

const ACTIONS_BY_TYPE: Record<UserActionType, { hint: string; actions: UserActionConfig[] }> = {
  optimization_skill_input: {
    hint: "You can use the following quick actions to provide more context to get optimization suggestions, or provide context in the chat.",
    actions: [
      {
        id: "provide_sql",
        action: (onInput) => (
          <InputAction
            label="I have a SQL"
            title="Provide SQL"
            description="Paste your SQL query below to analyze and optimize it."
            placeholder="SELECT * FROM ..."
            onInput={(value) => onInput(`Please optimize this SQL:\n${value}`)}
          />
        ),
        autoRun: false,
      },
      {
        id: "provide_query_id",
        action: (onInput) => (
          <InputAction
            label="I have a query_id"
            title="Provide Query ID"
            description="Enter the ClickHouse query_id you want to analyze."
            placeholder="e.g. 12345678-1234-1234-1234-123456789012"
            onInput={(value) => onInput(`My query_id is: ${value}`)}
          />
        ),
        autoRun: false,
        breakAfter: true,
      },
      {
        id: "find_duration_24h",
        action: (onInput) =>
          renderActionButton(
            <span>
              Find and optimize <span className="font-bold text-primary">SLOWEST</span> queries in
              past 1 day
            </span>,
            () => onInput("Find expensive queries by duration in the last 1 day")
          ),
        autoRun: true,
      },
      {
        id: "find_cpu_24h",
        action: (onInput) =>
          renderActionButton(
            <span>
              Find and optimize queries that use the{" "}
              <span className="font-bold text-primary">most CPU</span> in past 1 day
            </span>,
            () => onInput("Find queries that use the most CPU in the last 1 day")
          ),
        autoRun: true,
      },
      {
        id: "find_memory_24h",
        action: (onInput) =>
          renderActionButton(
            <span>
              Find and optimize queries that use the{" "}
              <span className="font-bold text-primary">most memory</span> in past 1 day
            </span>,
            () => onInput("Find expensive queries by memory in the last 1 day")
          ),
        autoRun: true,
      },
      {
        id: "find_disk_24h",
        action: (onInput) =>
          renderActionButton(
            <span>
              Find and optimize queries that read the{" "}
              <span className="font-bold text-primary">most disk</span> in past 1 day
            </span>,
            () => onInput("Find expensive queries by disk in the last 1 day")
          ),
        autoRun: true,
      },
    ],
  },
};

export const MessageMarkdownUserActions = memo(function MessageMarkdownUserActions({
  spec,
}: {
  spec: string;
}) {
  const { onAction } = useChatAction();
  const actionType = useMemo(() => {
    try {
      const payload = JSON.parse(spec) as { type?: UserActionType };
      return payload?.type;
    } catch {
      return undefined;
    }
  }, [spec]);

  if (!actionType) {
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
              <Fragment key={action.id}>
                {action.action((text) => onAction({ ...action, text }))}
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

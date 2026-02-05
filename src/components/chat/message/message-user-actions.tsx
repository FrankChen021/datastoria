"use client";

import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Fragment, memo, useMemo } from "react";

export type UserAction = {
  id: string;
  action: (onAction: (action: UserAction) => void) => React.ReactNode;
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

const InputAction = ({
  label,
  title,
  description,
  placeholder,
  onAction,
  actionId,
  template,
}: {
  label: string;
  title: string;
  description: string;
  placeholder: string;
  onAction: (action: UserAction) => void;
  actionId: string;
  template: (value: string) => string;
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
            onAction({
              id: actionId,
              text: template(value.trim()),
              autoRun: true,
              action: () => null,
            });
            return true;
          },
        },
      ],
    });
  };

  return renderActionButton(label, handleClick);
};

const ACTIONS_BY_TYPE: Record<UserActionType, { hint: string; actions: UserAction[] }> = {
  optimization_skill_input: {
    hint: "You can use the following quick actions to provide more context to get optimization suggestions, or provide context in the chat.",
    actions: [
      {
        id: "provide_sql",
        action: (onAction) => (
          <InputAction
            label="I have a SQL"
            title="Provide SQL"
            description="Paste your SQL query below to analyze and optimize it."
            placeholder="SELECT * FROM ..."
            onAction={onAction}
            actionId="provide_sql_input"
            template={(value) => `Please optimize this SQL:\n${value}`}
          />
        ),
        text: "Please optimize this SQL:\n<sql>",
        autoRun: false,
      },
      {
        id: "provide_query_id",
        action: (onAction) => (
          <InputAction
            label="I have a query_id"
            title="Provide Query ID"
            description="Enter the ClickHouse query_id you want to analyze."
            placeholder="e.g. 12345678-1234-1234-1234-123456789012"
            onAction={onAction}
            actionId="provide_query_id_input"
            template={(value) => `My query_id is: ${value}`}
          />
        ),
        text: "My query_id is: <paste here>",
        autoRun: false,
        breakAfter: true,
      },
      {
        id: "find_duration_24h",
        action: (onAction) =>
          renderActionButton(
            <span>
              Find and optimize <span className="font-bold text-primary">SLOWEST</span> queries
              (last 24h)
            </span>,
            () =>
              onAction({
                id: "find_duration_24h",
                text: "Find expensive queries by duration in the last 24 hours",
                autoRun: true,
                action: () => null,
              })
          ),
        text: "Find expensive queries by duration in the last 24 hours",
        autoRun: true,
      },
      {
        id: "find_cpu_24h",
        action: (onAction) =>
          renderActionButton(
            <span>
              Find and optimize queries that use the{" "}
              <span className="font-bold text-primary">most CPU</span> (last 24h)
            </span>,
            () =>
              onAction({
                id: "find_cpu_24h",
                text: "Find slowest queries by cpu in the last 24 hours",
                autoRun: true,
                action: () => null,
              })
          ),
        text: "Find slowest queries by cpu in the last 24 hours",
        autoRun: true,
      },
      {
        id: "find_memory_24h",
        action: (onAction) =>
          renderActionButton(
            <span>
              Find and optimize queries that use the{" "}
              <span className="font-bold text-primary">most memory</span> (last 24h)
            </span>,
            () =>
              onAction({
                id: "find_memory_24h",
                text: "Find expensive queries by memory in the last 24 hours",
                autoRun: true,
                action: () => null,
              })
          ),
        text: "Find expensive queries by memory in the last 24 hours",
        autoRun: true,
      },
      {
        id: "find_disk_24h",
        action: (onAction) =>
          renderActionButton(
            <span>
              Find and optimize queries that read the{" "}
              <span className="font-bold text-primary">most disk</span> (last 24h)
            </span>,
            () =>
              onAction({
                id: "find_disk_24h",
                text: "Find expensive queries by disk in the last 24 hours",
                autoRun: true,
                action: () => null,
              })
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

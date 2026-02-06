"use client";

import { Dialog } from "@/components/shared/use-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { useChatAction } from "../chat-action-context";
import { chatActionStorage } from "../storage/chat-action-storage";

/** Payload passed to onAction when a user triggers a quick action. */
export type UserActionInput = {
  text: string;
  autoRun?: boolean;
};

/** Definition of a single quick-action button (text is produced at trigger time). */
type UserActionConfig = {
  id: string;
  component: (onInput: (input: UserActionInput) => void) => React.ReactNode;
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
  onInput,
}: {
  label: string;
  title: string;
  description: string;
  placeholder: string;
  onInput: (text: string) => void;
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
    hint: "Or you can use the following quick actions to provide more context.",
    actions: [
      {
        id: "provide_sql",
        component: (onInput) => (
          <InputAction
            label="I have a SQL"
            title="Provide SQL"
            description="Paste your SQL query below to analyze and optimize it."
            placeholder="SELECT * FROM ..."
            onInput={(text) =>
              onInput({
                text: `Please optimize this SQL:\n${text}`,
                autoRun: true,
              })
            }
          />
        ),
      },
      {
        id: "provide_query_id",
        component: (onInput) => (
          <InputAction
            label="I have a query_id"
            title="Provide Query ID"
            description="Enter the ClickHouse query_id you want to analyze."
            placeholder="e.g. 12345678-1234-1234-1234-123456789012"
            onInput={(text) =>
              onInput({
                text: `My query_id is: ${text}`,
                autoRun: true,
              })
            }
          />
        ),
        breakAfter: true,
      },
      {
        id: "find_duration_24h",
        component: (onInput) =>
          renderActionButton(
            <span>
              Find and optimize <span className="font-bold text-primary">SLOWEST</span> queries in
              past 1 day
            </span>,
            () =>
              onInput({
                text: "Find the top 1 expensive queries by duration in the last 1 day and optimize it",
                autoRun: true,
              })
          ),
      },
      {
        id: "find_cpu_24h",
        component: (onInput) =>
          renderActionButton(
            <span>
              Find and optimize queries that use the{" "}
              <span className="font-bold text-primary">most CPU</span> in past 1 day
            </span>,
            () =>
              onInput({
                text: "Find the top 1 queries that use the most CPU in the last 1 day and optimize it",
                autoRun: true,
              })
          ),
      },
      {
        id: "find_memory_24h",
        component: (onInput) =>
          renderActionButton(
            <span>
              Find and optimize queries that use the{" "}
              <span className="font-bold text-primary">most memory</span> in past 1 day
            </span>,
            () =>
              onInput({
                text: "Find the top 1expensive queries by memory in the last 1 day and optimize it",
                autoRun: true,
              })
          ),
      },
      {
        id: "find_disk_24h",
        component: (onInput) =>
          renderActionButton(
            <span>
              Find and optimize queries that read the{" "}
              <span className="font-bold text-primary">most disk</span> in past 1 day
            </span>,
            () =>
              onInput({
                text: "Find the top 1 expensive queries by disk in the last 1 day and optimize it",
                autoRun: true,
              })
          ),
      },
    ],
  },
};

export const MessageMarkdownUserActions = memo(function MessageMarkdownUserActions({
  spec,
  messageId,
}: {
  spec: string;
  messageId?: string;
}) {
  const { onAction, chatId } = useChatAction();
  const [hidden, setHidden] = useState(() => chatActionStorage.isActionHidden(chatId, messageId));

  useEffect(() => {
    setHidden(chatActionStorage.isActionHidden(chatId, messageId));
  }, [chatId, messageId]);

  const actionType = useMemo(() => {
    try {
      const parsed = JSON.parse(spec) as { type?: UserActionType };
      return parsed?.type;
    } catch {
      return undefined;
    }
  }, [spec]);

  const actionOfType = useMemo(
    () => (actionType ? ACTIONS_BY_TYPE[actionType] : undefined),
    [actionType]
  );

  const actionGroups = useMemo(() => {
    if (!actionOfType?.actions.length) return [];
    const groups: UserActionConfig[][] = [];
    let currentGroup: UserActionConfig[] = [];

    actionOfType.actions.forEach((action) => {
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
  }, [actionOfType]);

  const handleAction = (input: UserActionInput) => {
    setHidden(true);
    if (chatId && messageId) {
      chatActionStorage.markActionHidden(chatId, messageId);
    }
    onAction(input);
  };

  if (!actionType || hidden || !actionOfType || actionOfType.actions.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 bg-muted/30 font-sans">
      <div className="text-sm font-medium text-foreground/80 mb-2">{actionOfType.hint}</div>
      <div className="flex flex-col gap-2">
        {actionGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="flex flex-wrap gap-2">
            {group.map((action) => (
              <Fragment key={action.id}>
                {action.component((actionData) => handleAction(actionData))}
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

"use client";

import { ChatUIContext } from "@/components/chat/chat-ui-context";
import {
  SessionManager,
  useSessionPageInfo,
  useSessions,
  type ManagedSession,
} from "@/components/chat/session/session-manager";
import { useConnection } from "@/components/connection/connection-context";
import { ConnectionDetailContent } from "@/components/connection/connection-detail-panel";
import { StatusPopover } from "@/components/connection/connection-edit-component";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tree, type TreeDataItem } from "@/components/ui/tree";
import type { Chat } from "@/lib/ai/ai-types";
import { Connection } from "@/lib/connection/connection";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import "@/lib/number-utils";
import { toastManager } from "@/lib/toast";
import { searchTree } from "@/lib/tree-search";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CalendarDays,
  Database,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";

interface ChatHistoryListProps {
  currentChatId: string;
  onNewChat: () => void;
  onClose?: () => void;
  onSelectChat?: (id: string, connectionId?: string) => void;
  className?: string;
}

type HistoryNodeData =
  | {
      kind: "group";
      label: string;
      chatIds: string[];
    }
  | {
      kind: "connection";
      connectionId: string;
      chatIds: string[];
    }
  | {
      kind: "chat";
      chat: ManagedSession;
    };

type RenameState = {
  chatId: string;
  title: string;
} | null;

type DeleteState = {
  nodeId: string;
  title: string;
  description: string;
  confirmLabel: string;
} | null;

type SwitchConfirmState = {
  chat: ManagedSession;
  connectionName: string;
} | null;

const chatNodeId = (chatId: string) => `chat:${chatId}`;
const groupNodeId = (parentId: string, label: string) => `group:${parentId}:${label}`;
const connectionNodeId = (connectionId: string) => `connection:${connectionId}`;

const getChatTitle = (chat: Pick<Chat, "title">) => chat.title || "New Chat";
const getGroupLabel = (dateInput: Date | string) => {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = today.getTime() - itemDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return "Earlier";
};

type ConnectionGroupMeta = {
  label: string;
  secondaryLabel?: string;
  isCurrent: boolean;
  config: ConnectionConfig | null;
};

function getConnectionGroupMeta(
  connectionId: string,
  currentConnectionId?: string
): ConnectionGroupMeta {
  const matchingConnections = ConnectionManager.getInstance()
    .getConnections()
    .filter((item) => Connection.create(item).connectionId === connectionId);
  const labels = Array.from(new Set(matchingConnections.map((item) => item.name)));
  const label = labels[0] ?? connectionId;
  const secondaryLabel =
    labels.length > 1 ? labels.slice(1).join(", ") : labels.length === 0 ? connectionId : undefined;

  return {
    label,
    secondaryLabel,
    isCurrent: connectionId === currentConnectionId,
    config: matchingConnections[0] ?? null,
  };
}

function HistoryNodeDeleteButton({
  nodeId,
  deleteState,
  onDeleteStateChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  nodeId: string;
  deleteState: DeleteState;
  onDeleteStateChange: (next: DeleteState) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const isOpen = deleteState?.nodeId === nodeId;

  return (
    <StatusPopover
      open={isOpen}
      onOpenChange={(open) =>
        onDeleteStateChange(
          open
            ? {
                nodeId,
                title,
                description,
                confirmLabel,
              }
            : null
        )
      }
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-[18px] w-[18px] text-muted-foreground opacity-0 transition-opacity group-hover/tree:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:text-destructive"
          title={title}
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="!h-3 !w-3" />
        </Button>
      }
      side="bottom"
      align="end"
      className="w-72"
      icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
      title={title}
    >
      <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteStateChange(null);
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={async (e) => {
            e.stopPropagation();
            onDeleteStateChange(null);
            await onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </StatusPopover>
  );
}

function CrossConnectionSwitchPopover({
  chat,
  currentConnectionId,
  confirmState,
  onConfirmStateChange,
  onConfirm,
  children,
}: {
  chat: ManagedSession;
  currentConnectionId?: string;
  confirmState: SwitchConfirmState;
  onConfirmStateChange: (next: SwitchConfirmState) => void;
  onConfirm: (chat: ManagedSession) => Promise<void>;
  children: React.ReactNode;
}) {
  if (!currentConnectionId || !chat.databaseId || chat.databaseId === currentConnectionId) {
    return <>{children}</>;
  }

  const isOpen = confirmState?.chat.chatId === chat.chatId;
  const connectionName = getConnectionGroupMeta(chat.databaseId).label;

  return (
    <StatusPopover
      open={isOpen}
      onOpenChange={(open) =>
        onConfirmStateChange(
          open
            ? {
                chat,
                connectionName,
              }
            : null
        )
      }
      trigger={<span>{children}</span>}
      side="right"
      align="start"
      className="w-[400px]"
      icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
      title="Switch connection?"
    >
      <p className="mb-3 text-xs text-muted-foreground">
        This chat belongs to another cluster <u>{connectionName}</u>.<br />
        You need to switch to it before opening this chat.
      </p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onConfirmStateChange(null);
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={async (e) => {
            e.stopPropagation();
            onConfirmStateChange(null);
            await onConfirm(chat);
          }}
        >
          Switch & open
        </Button>
      </div>
    </StatusPopover>
  );
}

function buildHistoryTree(
  history: ManagedSession[],
  currentConnectionId: string | undefined,
  switchConfirmState: SwitchConfirmState,
  onSwitchConfirmStateChange: (next: SwitchConfirmState) => void,
  onConfirmSwitch: (chat: ManagedSession) => Promise<void>,
  onRenameChat: (chat: ManagedSession) => void,
  onDeleteChat: (chat: ManagedSession) => Promise<void>,
  onDeleteGroup: (label: string, chats: ManagedSession[]) => Promise<void>,
  deleteState: DeleteState,
  onDeleteStateChange: (next: DeleteState) => void
): TreeDataItem[] {
  const connectionGroups = new Map<string, ManagedSession[]>();

  for (const chat of history) {
    if (!chat.databaseId) {
      continue;
    }

    const existing = connectionGroups.get(chat.databaseId);
    if (existing) {
      existing.push(chat);
    } else {
      connectionGroups.set(chat.databaseId, [chat]);
    }
  }

  const sortedConnectionGroups = Array.from(connectionGroups.entries()).sort(
    ([leftConnectionId], [rightConnectionId]) => {
      if (leftConnectionId === currentConnectionId) {
        return -1;
      }
      if (rightConnectionId === currentConnectionId) {
        return 1;
      }
      return 0;
    }
  );

  return sortedConnectionGroups.map(([connectionId, connectionChats]) => {
    const dateGroups: Array<{ label: string; chats: ManagedSession[] }> = [];
    const dateGroupIndex = new Map<string, number>();

    for (const chat of connectionChats) {
      const label = getGroupLabel(chat.updatedAt);
      const existingIndex = dateGroupIndex.get(label);
      if (existingIndex === undefined) {
        dateGroupIndex.set(label, dateGroups.length);
        dateGroups.push({ label, chats: [chat] });
        continue;
      }
      dateGroups[existingIndex]!.chats.push(chat);
    }

    const meta = getConnectionGroupMeta(connectionId, currentConnectionId);
    const connectionSearchTerms = [meta.label, meta.secondaryLabel, connectionId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      id: connectionNodeId(connectionId),
      labelContent: (
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate", !meta.isCurrent && "text-muted-foreground")}>
            {meta.label}
          </span>
          {!meta.isCurrent && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
            />
          )}
        </div>
      ),
      search: connectionSearchTerms,
      icon: Database,
      iconClassName: !meta.isCurrent ? "text-muted-foreground" : undefined,
      type: "folder",
      data: {
        kind: "connection",
        connectionId,
        chatIds: connectionChats.map((chat) => chat.chatId),
      } satisfies HistoryNodeData,
      labelTooltip: meta.config ? (
        <ConnectionDetailContent
          conn={meta.config}
          className="w-[240px] max-w-[min(240px,calc(100vw-4rem))]"
        />
      ) : (
        connectionId
      ),
      nodeTooltipClassName: "py-0 px-1",
      children: dateGroups.map(({ label, chats }) => ({
        id: groupNodeId(connectionNodeId(connectionId), label),
        labelContent: (
          <span className={cn(!meta.isCurrent && "text-muted-foreground")}>{label}</span>
        ),
        search: `${label.toLowerCase()} ${connectionSearchTerms}`,
        icon: CalendarDays,
        iconClassName: !meta.isCurrent ? "text-muted-foreground" : undefined,
        type: "folder",
        data: {
          kind: "group",
          label,
          chatIds: chats.map((chat) => chat.chatId),
        } satisfies HistoryNodeData,
        tag: () => (
          <HistoryNodeDeleteButton
            nodeId={groupNodeId(connectionNodeId(connectionId), label)}
            deleteState={deleteState}
            onDeleteStateChange={onDeleteStateChange}
            title="Delete folder"
            description={`Delete all ${chats.length} conversations in "${label}" under "${meta.label}"? This action cannot be reverted.`}
            confirmLabel="Delete folder"
            onConfirm={() => onDeleteGroup(label, chats)}
          />
        ),
        children: chats.map((chat) => ({
          id: chatNodeId(chat.chatId),
          labelContent: (
            <CrossConnectionSwitchPopover
              chat={chat}
              currentConnectionId={currentConnectionId}
              confirmState={switchConfirmState}
              onConfirmStateChange={onSwitchConfirmStateChange}
              onConfirm={onConfirmSwitch}
            >
              <span className={cn(!meta.isCurrent && "text-muted-foreground")}>
                {getChatTitle(chat)}
              </span>
            </CrossConnectionSwitchPopover>
          ),
          search: `${getChatTitle(chat).toLowerCase()} ${connectionSearchTerms} ${label.toLowerCase()}`,
          icon: chat.running ? Loader2 : MessageSquareText,
          iconClassName: cn(
            chat.running && "animate-spin",
            !meta.isCurrent && "text-muted-foreground"
          ),
          type: "leaf",
          data: {
            kind: "chat",
            chat,
          } satisfies HistoryNodeData,
          tag: () => (
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-[18px] w-[18px] text-muted-foreground opacity-0 transition-opacity group-hover/tree:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:text-foreground"
                title="Rename conversation"
                aria-label="Rename conversation"
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameChat(chat);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Pencil className="!h-3 !w-3" />
              </Button>
              <HistoryNodeDeleteButton
                nodeId={chatNodeId(chat.chatId)}
                deleteState={deleteState}
                onDeleteStateChange={onDeleteStateChange}
                title="Delete conversation"
                description={`Delete "${getChatTitle(chat)}"? This action cannot be reverted.`}
                confirmLabel="Delete"
                onConfirm={() => onDeleteChat(chat)}
              />
            </div>
          ),
        })),
      })),
    } satisfies TreeDataItem;
  });
}

export const ChatSessionList = React.memo<ChatHistoryListProps>(
  ({ currentChatId, onNewChat, onClose, onSelectChat, className }) => {
    const { connection, switchConnection } = useConnection();
    const history = useSessions(connection?.connectionId, "all");
    const pageInfo = useSessionPageInfo();
    const [search, setSearch] = React.useState("");
    const [renameState, setRenameState] = React.useState<RenameState>(null);
    const [deleteState, setDeleteState] = React.useState<DeleteState>(null);
    const [switchConfirmState, setSwitchConfirmState] = React.useState<SwitchConfirmState>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    const refreshSessions = React.useCallback(async () => {
      setIsRefreshing(true);
      try {
        await SessionManager.loadSessions({ limit: 100, reset: true });
      } finally {
        setIsRefreshing(false);
      }
    }, []);

    React.useEffect(() => {
      if (!pageInfo.loaded) {
        void refreshSessions();
      }
    }, [pageInfo.loaded, refreshSessions]);

    const handleLoadMore = React.useCallback(async () => {
      if (isRefreshing || !pageInfo.hasMore) {
        return;
      }

      setIsRefreshing(true);
      try {
        await SessionManager.loadSessions({ limit: 100, cursor: pageInfo.nextCursor });
      } finally {
        setIsRefreshing(false);
      }
    }, [isRefreshing, pageInfo.hasMore, pageInfo.nextCursor]);

    const handleDeleteChats = React.useCallback(
      async (chatIds: string[]) => {
        await SessionManager.deleteSessions(chatIds);

        if (currentChatId && chatIds.includes(currentChatId)) {
          onNewChat();
          onClose?.();
        }
      },
      [currentChatId, onClose, onNewChat]
    );

    const handleRenameSubmit = React.useCallback(async () => {
      if (!renameState) {
        return;
      }

      const nextTitle = renameState.title.trim();
      if (!nextTitle) {
        return;
      }

      await SessionManager.renameSession(renameState.chatId, nextTitle);

      if (renameState.chatId === currentChatId) {
        ChatUIContext.updateTitle(nextTitle);
      }

      setRenameState(null);
    }, [currentChatId, renameState]);

    const handleSelectSession = React.useCallback(
      async (chat: ManagedSession) => {
        if (chat.chatId === currentChatId) {
          onClose?.();
          return;
        }

        if (chat.databaseId !== connection?.connectionId) {
          const targetConfig = ConnectionManager.getInstance()
            .getConnections()
            .find((item) => Connection.create(item).connectionId === chat.databaseId);

          if (targetConfig) {
            switchConnection(targetConfig);
          } else {
            toastManager.show("Connection for this conversation is no longer available", "error");
            return;
          }
        }

        onSelectChat?.(chat.chatId, chat.databaseId);
        onClose?.();
      },
      [connection?.connectionId, currentChatId, onClose, onSelectChat, switchConnection]
    );

    const treeData = React.useMemo(
      () =>
        buildHistoryTree(
          history,
          connection?.connectionId,
          switchConfirmState,
          setSwitchConfirmState,
          handleSelectSession,
          (chat) =>
            setRenameState({
              chatId: chat.chatId,
              title: getChatTitle(chat),
            }),
          (chat) => handleDeleteChats([chat.chatId]),
          (_label, chats) => handleDeleteChats(chats.map((chat) => chat.chatId)),
          deleteState,
          setDeleteState
        ),
      [
        connection?.connectionId,
        deleteState,
        handleDeleteChats,
        handleSelectSession,
        history,
        switchConfirmState,
      ]
    );

    const initialExpandedIds = React.useMemo(() => {
      if (!connection?.connectionId) {
        return [];
      }

      const currentConnectionNodeId = connectionNodeId(connection.connectionId);
      const currentConnectionNode = treeData.find((node) => node.id === currentConnectionNodeId);
      if (!currentConnectionNode) {
        return [];
      }

      return [
        currentConnectionNodeId,
        ...(currentConnectionNode.children?.map((child) => child.id) ?? []),
      ];
    }, [connection?.connectionId, treeData]);

    const hasVisibleTreeData = React.useMemo(() => {
      if (search.length === 0) {
        return treeData.length > 0;
      }

      return searchTree(treeData, search.toLowerCase(), { pathSeparator: "/" }).length > 0;
    }, [search, treeData]);

    return (
      <>
        <div className={cn("flex flex-col h-full w-full", className)}>
          <div className="relative border-b-2 flex items-center h-9">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chats"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn("pl-8 rounded-none border-none flex-1 h-9", search ? "pr-24" : "pr-16")}
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-16 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearch("")}
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-9 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => void refreshSessions()}
              title="Refresh chats"
              disabled={isRefreshing}
            >
              <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={onNewChat}
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {hasVisibleTreeData ? (
              <div className="flex h-full flex-col">
                <Tree
                  data={treeData}
                  search={search}
                  selectedItemId={currentChatId ? chatNodeId(currentChatId) : undefined}
                  onSelectChange={(item) => {
                    const data = item?.data as HistoryNodeData | undefined;
                    if (!data || data.kind !== "chat") {
                      return;
                    }

                    if (
                      data.chat.chatId !== currentChatId &&
                      connection?.connectionId &&
                      data.chat.databaseId &&
                      data.chat.databaseId !== connection.connectionId
                    ) {
                      setSwitchConfirmState({
                        chat: data.chat,
                        connectionName: getConnectionGroupMeta(data.chat.databaseId).label,
                      });
                      return;
                    }

                    void handleSelectSession(data.chat);
                  }}
                  className="min-h-0 flex-1"
                  itemIcon={MessageSquareText}
                  showChildCount={true}
                  initialExpandedIds={initialExpandedIds}
                  pathSeparator="/"
                  rowHeight={30}
                />
                {search.length === 0 && pageInfo.hasMore && (
                  <div className="border-t p-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => void handleLoadMore()}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? "Loading..." : "Load more"}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center px-4 text-sm text-muted-foreground">
                No chats found.
              </div>
            )}
          </div>
        </div>

        <Dialog open={renameState !== null} onOpenChange={(open) => !open && setRenameState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
              <DialogDescription>Update the session title shown in chat history.</DialogDescription>
            </DialogHeader>
            <Input
              value={renameState?.title ?? ""}
              onChange={(e) =>
                setRenameState((current) =>
                  current
                    ? {
                        ...current,
                        title: e.target.value,
                      }
                    : current
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRenameSubmit();
                }
              }}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameState(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleRenameSubmit()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

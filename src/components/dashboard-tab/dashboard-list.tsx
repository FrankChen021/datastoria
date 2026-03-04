"use client";

import { StatusPopover } from "@/components/connection/connection-edit-component";
import { TabManager } from "@/components/tab-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Connection } from "@/lib/connection/connection";
import { hostNameManager } from "@/lib/host-name-manager";
import { AlertCircle, LayoutDashboard, Monitor, Network, Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { CustomDashboardStorage, type CustomDashboardConfig } from "./custom-dashboard-storage";

interface DashboardListProps {
  onClose?: () => void;
  connection?: Connection | null;
}

/**
 * A list of all saved custom dashboards with create/open/delete actions.
 * Used inside the sidebar hover card or popover.
 */
const DashboardListComponent = ({ onClose, connection }: DashboardListProps) => {
  const storage = CustomDashboardStorage.getInstance();
  const [dashboards, setDashboards] = useState<CustomDashboardConfig[]>(() => storage.getAll());
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshList = useCallback(() => {
    setDashboards(storage.getAll());
  }, [storage]);

  const handleCreate = useCallback(() => {
    const name = newName.trim() || "Untitled Dashboard";
    const config = storage.createNew(name);
    setNewName("");
    setShowCreate(false);
    refreshList();

    // Open the new dashboard in a tab
    TabManager.openTab({
      id: `custom-dashboard:${config.id}`,
      type: "custom-dashboard",
      dashboardId: config.id,
      dashboardName: config.name,
    });
    onClose?.();
  }, [newName, storage, refreshList, onClose]);

  const handleOpen = useCallback(
    (config: CustomDashboardConfig) => {
      TabManager.openTab({
        id: `custom-dashboard:${config.id}`,
        type: "custom-dashboard",
        dashboardId: config.id,
        dashboardName: config.name,
      });
      onClose?.();
    },
    [onClose]
  );

  const handleDeleteConfirm = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      TabManager.closeTab(`custom-dashboard:${id}`);
      storage.delete(id);
      setDeletingId(null);
      refreshList();
    },
    [storage, refreshList]
  );

  const isClusterMode = connection?.cluster && connection.cluster.length > 0;

  const handleOpenNode = useCallback(() => {
    if (!connection) return;
    TabManager.openTab({
      id: `node:${connection.metadata.displayName}`,
      type: "node",
      host: hostNameManager.getShortHostname(connection.metadata.displayName),
    });
    onClose?.();
  }, [connection, onClose]);

  const handleOpenCluster = useCallback(() => {
    if (!connection?.cluster) return;
    TabManager.openTab({
      id: `cluster:${connection.cluster}`,
      type: "cluster",
      cluster: connection.cluster,
    });
    onClose?.();
  }, [connection, onClose]);

  return (
    <div className="space-y-2">
      {/* Create new */}
      {showCreate ? (
        <div className="flex items-center gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Dashboard name"
            className="h-7 text-sm flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setShowCreate(false);
            }}
          />
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors text-primary"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4" />
          New Dashboard
        </button>
      )}

      {/* Built-in dashboards */}
      {connection && (
        <>
          <div
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
            onClick={handleOpenNode}
          >
            <Monitor className="h-4 w-4 shrink-0" />
            <span className="truncate flex-1 text-left">Default</span>
          </div>
          {isClusterMode && (
            <div
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
              onClick={handleOpenCluster}
            >
              <Network className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1 text-left">Cluster Status</span>
            </div>
          )}
        </>
      )}

      {/* Custom dashboard list */}
      {dashboards.length === 0 && !connection && !showCreate && (
        <p className="text-xs text-muted-foreground px-2 py-1">No dashboards yet</p>
      )}

      {dashboards.map((db) => (
        <div
          key={db.id}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors group"
          onClick={() => handleOpen(db)}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1 text-left">{db.name}</span>
          <StatusPopover
            open={deletingId === db.id}
            onOpenChange={(open) => setDeletingId(open ? db.id : null)}
            trigger={
              <button
                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingId(db.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            }
            side="left"
            align="end"
            icon={
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            }
            title="Confirm deletion"
          >
            <div className="text-xs mb-3">
              Are you sure to delete this dashboard? This action cannot be reverted.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={(e) => handleDeleteConfirm(db.id, e)}
              >
                Delete
              </Button>
            </div>
          </StatusPopover>
        </div>
      ))}
    </div>
  );
};

DashboardListComponent.displayName = "DashboardList";

export const DashboardList = memo(DashboardListComponent);

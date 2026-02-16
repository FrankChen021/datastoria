"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LayoutDashboard, Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";
import type { UserDashboard } from "./dashboard-types";
import { deleteDashboard } from "./dashboard-storage";

interface DashboardSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboards: UserDashboard[];
  onSelect: (dashboard: UserDashboard) => void;
  onCreate: (name: string) => void;
}

const DashboardSelectorDialogComponent = ({
  open,
  onOpenChange,
  dashboards,
  onSelect,
  onCreate,
}: DashboardSelectorDialogProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [localDashboards, setLocalDashboards] = useState(dashboards);

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      onCreate(newName.trim());
      setNewName("");
      setIsCreating(false);
    }
  }, [newName, onCreate]);

  const handleDelete = useCallback(
    (e: React.MouseEvent, dashboard: UserDashboard) => {
      e.stopPropagation();
      deleteDashboard(dashboard.id);
      setLocalDashboards((prev) => prev.filter((d) => d.id !== dashboard.id));
    },
    []
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent className="sm:max-w-[500px]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Select Dashboard</DialogTitle>
        </DialogHeader>

        {isCreating ? (
          <div className="py-4 space-y-4">
            <Input
              placeholder="Dashboard name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreate();
                } else if (e.key === "Escape") {
                  setIsCreating(false);
                  setNewName("");
                }
              }}
              autoFocus
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!newName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2 pr-4">
                {localDashboards.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <LayoutDashboard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No dashboards yet</p>
                    <p className="text-sm">Create your first dashboard to get started</p>
                  </div>
                ) : (
                  localDashboards.map((dashboard) => (
                    <div
                      key={dashboard.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors group"
                      onClick={() => onSelect(dashboard)}
                    >
                      <div className="flex items-center gap-3">
                        <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{dashboard.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {dashboard.views.length} view{dashboard.views.length !== 1 ? "s" : ""}{" "}
                            &middot; Updated {formatDate(dashboard.updatedAt)}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => handleDelete(e, dashboard)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Dashboard
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

DashboardSelectorDialogComponent.displayName = "DashboardSelectorDialog";

export const DashboardSelectorDialog = memo(DashboardSelectorDialogComponent);

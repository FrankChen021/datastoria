"use client";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { memo, useCallback, useState } from "react";
import type { DashboardView } from "./dashboard-types";

interface DashboardViewTabsProps {
  views: DashboardView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onAddView: (name: string) => void;
  onRenameView: (viewId: string, newName: string) => void;
  onDeleteView: (viewId: string) => void;
  isEditing?: boolean;
}

const DashboardViewTabsComponent = ({
  views,
  activeViewId,
  onViewChange,
  onAddView,
  onRenameView,
  onDeleteView,
  isEditing = false,
}: DashboardViewTabsProps) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [renameViewId, setRenameViewId] = useState<string | null>(null);
  const [renameViewName, setRenameViewName] = useState("");

  const handleAddView = useCallback(() => {
    if (newViewName.trim()) {
      onAddView(newViewName.trim());
      setNewViewName("");
      setShowAddDialog(false);
    }
  }, [newViewName, onAddView]);

  const handleStartRename = useCallback((viewId: string, currentName: string) => {
    setRenameViewId(viewId);
    setRenameViewName(currentName);
    setShowRenameDialog(true);
  }, []);

  const handleRename = useCallback(() => {
    if (renameViewId && renameViewName.trim()) {
      onRenameView(renameViewId, renameViewName.trim());
      setRenameViewId(null);
      setRenameViewName("");
      setShowRenameDialog(false);
    }
  }, [renameViewId, renameViewName, onRenameView]);

  return (
    <>
      <div className="flex items-center border-b bg-muted/30 px-2">
        <Tabs value={activeViewId} onValueChange={onViewChange} className="flex-1">
          <TabsList className="h-9 bg-transparent p-0 gap-1">
            {views.map((view) => (
              <ContextMenu key={view.id}>
                <ContextMenuTrigger asChild>
                  <TabsTrigger
                    value={view.id}
                    className="rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-1.5 text-sm"
                  >
                    {view.name}
                  </TabsTrigger>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleStartRename(view.id, view.name)}>
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => onDeleteView(view.id)}
                    disabled={views.length <= 1}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </TabsList>
        </Tabs>

        {isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Add View Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add New View</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="View name"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddView();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddView} disabled={!newViewName.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename View Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename View</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="View name"
              value={renameViewName}
              onChange={(e) => setRenameViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameViewName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

DashboardViewTabsComponent.displayName = "DashboardViewTabs";

export const DashboardViewTabs = memo(DashboardViewTabsComponent);

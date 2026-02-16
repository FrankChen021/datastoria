"use client";

import type { Dashboard, DashboardGroup, GridPos, PanelDescriptor } from "@/components/shared/dashboard/dashboard-model";
import { DashboardVisualizationPanel } from "@/components/shared/dashboard/dashboard-visualization-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GripVertical, Settings, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";

interface DashboardLayoutEditorProps {
  dashboard: Dashboard;
  onLayoutChange: (charts: Dashboard["charts"]) => void;
  headerActions?: React.ReactNode;
}

// Helper to check if item is a group
function isDashboardGroup(item: unknown): item is DashboardGroup {
  return (
    typeof item === "object" &&
    item !== null &&
    "title" in item &&
    "charts" in item &&
    Array.isArray((item as DashboardGroup).charts)
  );
}

// Get gridPos with defaults
function getGridPos(chart: PanelDescriptor): GridPos {
  return chart.gridPos || { w: 12, h: 6 };
}

const DashboardLayoutEditorComponent = ({
  dashboard,
  onLayoutChange,
  headerActions,
}: DashboardLayoutEditorProps) => {
  const [editingPanel, setEditingPanel] = useState<{ index: number; panel: PanelDescriptor } | null>(null);
  const [editWidth, setEditWidth] = useState(12);
  const [editHeight, setEditHeight] = useState(6);

  // Flatten charts for editing (groups are expanded)
  const flatCharts: PanelDescriptor[] = [];
  dashboard.charts.forEach((item) => {
    if (isDashboardGroup(item)) {
      flatCharts.push(...item.charts);
    } else {
      flatCharts.push(item);
    }
  });

  // Handle delete panel
  const handleDelete = useCallback(
    (index: number) => {
      const newCharts = [...flatCharts];
      newCharts.splice(index, 1);
      onLayoutChange(newCharts);
    },
    [flatCharts, onLayoutChange]
  );

  // Handle open edit dialog
  const handleOpenEdit = useCallback((index: number, panel: PanelDescriptor) => {
    const gridPos = getGridPos(panel);
    setEditingPanel({ index, panel });
    setEditWidth(gridPos.w);
    setEditHeight(gridPos.h);
  }, []);

  // Handle save edit
  const handleSaveEdit = useCallback(() => {
    if (!editingPanel) return;

    const newCharts = [...flatCharts];
    newCharts[editingPanel.index] = {
      ...editingPanel.panel,
      gridPos: {
        ...editingPanel.panel.gridPos,
        w: Math.min(24, Math.max(1, editWidth)),
        h: Math.min(20, Math.max(1, editHeight)),
      },
    };
    onLayoutChange(newCharts);
    setEditingPanel(null);
  }, [editingPanel, flatCharts, editWidth, editHeight, onLayoutChange]);

  // Handle move up
  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newCharts = [...flatCharts];
      [newCharts[index - 1], newCharts[index]] = [newCharts[index], newCharts[index - 1]];
      onLayoutChange(newCharts);
    },
    [flatCharts, onLayoutChange]
  );

  // Handle move down
  const handleMoveDown = useCallback(
    (index: number) => {
      if (index === flatCharts.length - 1) return;
      const newCharts = [...flatCharts];
      [newCharts[index], newCharts[index + 1]] = [newCharts[index + 1], newCharts[index]];
      onLayoutChange(newCharts);
    },
    [flatCharts, onLayoutChange]
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden p-2 gap-2">
      {/* Header with edit actions */}
      <div className="flex items-center justify-between px-2 py-1 border-b">
        <div className="text-sm text-muted-foreground">
          Edit Mode - {flatCharts.length} widget{flatCharts.length !== 1 ? "s" : ""}
        </div>
        {headerActions}
      </div>

      {/* Grid layout */}
      <div className="flex-1 min-h-0 overflow-auto">
        {flatCharts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="mb-2">No widgets yet</p>
              <p className="text-sm">Click "Add Widget" to get started</p>
            </div>
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: "repeat(24, 1fr)",
              gridAutoRows: "minmax(32px, auto)",
            }}
          >
            {flatCharts.map((panel, index) => {
              const gridPos = getGridPos(panel);
              const title = panel.titleOption?.title || panel.type;

              return (
                <div
                  key={index}
                  className={cn(
                    "relative border rounded-lg bg-card overflow-hidden group",
                    "ring-2 ring-transparent hover:ring-primary/50"
                  )}
                  style={{
                    gridColumn: `span ${gridPos.w}`,
                    gridRow: `span ${gridPos.h}`,
                  }}
                >
                  {/* Edit toolbar - appears on hover at top */}
                  <div className="absolute top-0 left-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 border-b px-2 py-1 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        title="Move Up"
                      >
                        <span className="text-xs">↑</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === flatCharts.length - 1}
                        title="Move Down"
                      >
                        <span className="text-xs">↓</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleOpenEdit(index, panel)}
                        title="Resize"
                      >
                        <Settings className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(index)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Panel preview */}
                  <div className="h-full w-full">
                    <DashboardVisualizationPanel
                      descriptor={panel}
                      initialLoading={true}
                    />
                  </div>

                  {/* Panel info badge */}
                  <div className="absolute bottom-2 right-2 z-10 bg-background/90 px-2 py-1 rounded text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {gridPos.w}x{gridPos.h}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resize dialog */}
      <Dialog open={!!editingPanel} onOpenChange={(open) => !open && setEditingPanel(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Resize Widget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-width">Width (1-24 columns)</Label>
              <Input
                id="edit-width"
                type="number"
                min={1}
                max={24}
                value={editWidth}
                onChange={(e) => setEditWidth(parseInt(e.target.value) || 12)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-height">Height (1-20 rows)</Label>
              <Input
                id="edit-height"
                type="number"
                min={1}
                max={20}
                value={editHeight}
                onChange={(e) => setEditHeight(parseInt(e.target.value) || 6)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The dashboard uses a 24-column grid. Width of 12 = half screen, 24 = full width.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPanel(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

DashboardLayoutEditorComponent.displayName = "DashboardLayoutEditor";

export const DashboardLayoutEditor = memo(DashboardLayoutEditorComponent);

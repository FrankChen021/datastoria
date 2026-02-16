"use client";

import DashboardPage from "@/components/shared/dashboard/dashboard-page";
import type { TimeSpan } from "@/components/shared/dashboard/timespan-selector";
import { TabManager } from "@/components/tab-manager";
import { Button } from "@/components/ui/button";
import { Pencil, Plus, Save, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { DashboardSelectorDialog } from "./dashboard-selector-dialog";
import { loadDashboard, saveDashboard, loadDashboards } from "./dashboard-storage";
import type { UserDashboard, DashboardView, DashboardEditState } from "./dashboard-types";
import { createEmptyDashboard } from "./dashboard-types";
import { DashboardViewTabs } from "./dashboard-view-tabs";
import { DashboardWidgetPicker } from "./dashboard-widget-picker";
import { DashboardLayoutEditor } from "./dashboard-layout-editor";
import { SimpleDashboardFilter } from "./simple-dashboard-filter";

interface DashboardTabProps {
  dashboardId: string;
  viewId?: string;
  tabId: string;
}

const DashboardTabComponent = ({ dashboardId, viewId, tabId }: DashboardTabProps) => {
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [activeViewId, setActiveViewId] = useState<string>(viewId || "");
  const [editState, setEditState] = useState<DashboardEditState>({
    isEditing: false,
    hasUnsavedChanges: false,
  });
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [showSelectorDialog, setShowSelectorDialog] = useState(false);

  // Filter state
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | null>(null);
  const refreshFnRef = useRef<((timeSpan: TimeSpan, filterExpression: string) => void) | null>(null);

  // Load dashboard on mount or when dashboardId changes
  useEffect(() => {
    if (dashboardId === "new") {
      // Show selector dialog for new dashboard
      setShowSelectorDialog(true);
      return;
    }

    const loaded = loadDashboard(dashboardId);
    if (loaded) {
      setDashboard(loaded);
      setActiveViewId(viewId || loaded.activeViewId);
      // Update tab title
      TabManager.updateTabTitle(tabId, loaded.name);
    } else {
      // Dashboard not found, show selector
      setShowSelectorDialog(true);
    }
  }, [dashboardId, viewId, tabId]);

  // Get active view
  const activeView = dashboard?.views.find((v) => v.id === activeViewId) || dashboard?.views[0];

  // Handle view change
  const handleViewChange = useCallback(
    (newViewId: string) => {
      if (dashboard && editState.hasUnsavedChanges) {
        // Save before switching if there are unsaved changes
        saveDashboard(dashboard);
        setEditState((prev) => ({ ...prev, hasUnsavedChanges: false }));
      }
      setActiveViewId(newViewId);
      if (dashboard) {
        dashboard.activeViewId = newViewId;
        saveDashboard(dashboard);
      }
    },
    [dashboard, editState.hasUnsavedChanges]
  );

  // Handle adding a new view
  const handleAddView = useCallback(
    (name: string) => {
      if (!dashboard) return;

      const newView: DashboardView = {
        id: crypto.randomUUID(),
        name,
        dashboard: {
          version: 3,
          filter: { showTimeSpanSelector: true, showRefresh: true },
          charts: [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      dashboard.views.push(newView);
      dashboard.activeViewId = newView.id;
      saveDashboard(dashboard);
      setDashboard({ ...dashboard });
      setActiveViewId(newView.id);
    },
    [dashboard]
  );

  // Handle renaming a view
  const handleRenameView = useCallback(
    (viewId: string, newName: string) => {
      if (!dashboard) return;

      const view = dashboard.views.find((v) => v.id === viewId);
      if (view) {
        view.name = newName;
        view.updatedAt = new Date().toISOString();
        saveDashboard(dashboard);
        setDashboard({ ...dashboard });
      }
    },
    [dashboard]
  );

  // Handle deleting a view
  const handleDeleteView = useCallback(
    (viewId: string) => {
      if (!dashboard || dashboard.views.length <= 1) return;

      const viewIndex = dashboard.views.findIndex((v) => v.id === viewId);
      if (viewIndex === -1) return;

      dashboard.views.splice(viewIndex, 1);

      // Update active view if needed
      if (activeViewId === viewId) {
        const newActiveId = dashboard.views[Math.min(viewIndex, dashboard.views.length - 1)].id;
        dashboard.activeViewId = newActiveId;
        setActiveViewId(newActiveId);
      }

      saveDashboard(dashboard);
      setDashboard({ ...dashboard });
    },
    [dashboard, activeViewId]
  );

  // Toggle edit mode
  const handleToggleEdit = useCallback(() => {
    if (editState.isEditing && editState.hasUnsavedChanges && dashboard) {
      // Save when exiting edit mode
      saveDashboard(dashboard);
    }
    setEditState((prev) => ({
      isEditing: !prev.isEditing,
      hasUnsavedChanges: false,
    }));
  }, [editState.isEditing, editState.hasUnsavedChanges, dashboard]);

  // Handle save
  const handleSave = useCallback(() => {
    if (dashboard) {
      saveDashboard(dashboard);
      setEditState((prev) => ({ ...prev, hasUnsavedChanges: false }));
    }
  }, [dashboard]);

  // Handle cancel edit
  const handleCancelEdit = useCallback(() => {
    // Reload dashboard to discard changes
    const reloaded = loadDashboard(dashboardId);
    if (reloaded) {
      setDashboard(reloaded);
      setActiveViewId(reloaded.activeViewId);
    }
    setEditState({ isEditing: false, hasUnsavedChanges: false });
  }, [dashboardId]);

  // Handle layout change from editor
  const handleLayoutChange = useCallback(
    (newCharts: DashboardView["dashboard"]["charts"]) => {
      if (!dashboard || !activeView) return;

      activeView.dashboard.charts = newCharts;
      activeView.updatedAt = new Date().toISOString();
      setDashboard({ ...dashboard });
      setEditState((prev) => ({ ...prev, hasUnsavedChanges: true }));
    },
    [dashboard, activeView]
  );

  // Handle database filter change
  const handleDatabaseChange = useCallback(
    (database: string | null) => {
      setSelectedDatabase(database);
      // Trigger refresh with new filter
      if (selectedTimeSpan && refreshFnRef.current) {
        const filterExpr = database ? `database = '${database}'` : "1=1";
        refreshFnRef.current(selectedTimeSpan, filterExpr);
      }
    },
    [selectedTimeSpan]
  );

  // Handle time span change
  const handleTimeSpanChange = useCallback(
    (timeSpan: TimeSpan) => {
      setSelectedTimeSpan(timeSpan);
      // Trigger refresh with new time span
      if (refreshFnRef.current) {
        const filterExpr = selectedDatabase ? `database = '${selectedDatabase}'` : "1=1";
        refreshFnRef.current(timeSpan, filterExpr);
      }
    },
    [selectedDatabase]
  );

  // Handle refresh button
  const handleRefresh = useCallback(() => {
    if (selectedTimeSpan && refreshFnRef.current) {
      const filterExpr = selectedDatabase ? `database = '${selectedDatabase}'` : "1=1";
      refreshFnRef.current(selectedTimeSpan, filterExpr);
    }
  }, [selectedDatabase, selectedTimeSpan]);

  // Store refresh function from DashboardPage
  const handleExternalRefresh = useCallback(
    (refreshFn: (timeSpan: TimeSpan, filterExpression: string) => void) => {
      refreshFnRef.current = refreshFn;
    },
    []
  );

  // Build filter expression
  const filterExpression = selectedDatabase ? `database = '${selectedDatabase}'` : "1=1";

  // Handle adding a widget
  const handleAddWidget = useCallback(
    (panel: DashboardView["dashboard"]["charts"][0]) => {
      if (!dashboard || !activeView) return;

      activeView.dashboard.charts.push(panel);
      activeView.updatedAt = new Date().toISOString();
      saveDashboard(dashboard);
      setDashboard({ ...dashboard });
      setShowWidgetPicker(false);
    },
    [dashboard, activeView]
  );

  // Handle dashboard selection from dialog
  const handleSelectDashboard = useCallback(
    (selected: UserDashboard) => {
      setDashboard(selected);
      setActiveViewId(selected.activeViewId);
      TabManager.updateTabTitle(tabId, selected.name);
      setShowSelectorDialog(false);
    },
    [tabId]
  );

  // Handle creating new dashboard from dialog
  const handleCreateDashboard = useCallback(
    (name: string) => {
      const newDashboard = createEmptyDashboard(name);
      saveDashboard(newDashboard);
      setDashboard(newDashboard);
      setActiveViewId(newDashboard.activeViewId);
      TabManager.updateTabTitle(tabId, newDashboard.name);
      setShowSelectorDialog(false);
      // Start in edit mode for new dashboards
      setEditState({ isEditing: true, hasUnsavedChanges: false });
    },
    [tabId]
  );

  // Show selector dialog if no dashboard
  if (showSelectorDialog || !dashboard) {
    return (
      <div className="flex flex-col h-full w-full items-center justify-center bg-muted/5">
        <DashboardSelectorDialog
          open={true}
          onOpenChange={(open) => {
            if (!open && !dashboard) {
              // Close the tab if no dashboard selected
              TabManager.closeTab(tabId);
            }
            setShowSelectorDialog(open);
          }}
          dashboards={loadDashboards()}
          onSelect={handleSelectDashboard}
          onCreate={handleCreateDashboard}
        />
      </div>
    );
  }

  // Render header actions for edit mode
  const headerActions = editState.isEditing ? (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setShowWidgetPicker(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Add Widget
      </Button>
      <Button variant="outline" size="sm" onClick={handleCancelEdit}>
        <X className="h-4 w-4 mr-1" />
        Cancel
      </Button>
      <Button size="sm" onClick={handleSave} disabled={!editState.hasUnsavedChanges}>
        <Save className="h-4 w-4 mr-1" />
        Save
      </Button>
    </div>
  ) : (
    <Button variant="ghost" size="sm" onClick={handleToggleEdit}>
      <Pencil className="h-4 w-4 mr-1" />
      Edit
    </Button>
  );

  return (
    <div className="flex flex-col h-full w-full">
      {/* View tabs */}
      <DashboardViewTabs
        views={dashboard.views}
        activeViewId={activeViewId}
        onViewChange={handleViewChange}
        onAddView={handleAddView}
        onRenameView={handleRenameView}
        onDeleteView={handleDeleteView}
        isEditing={editState.isEditing}
      />

      {/* Simple filter bar */}
      {!editState.isEditing && (
        <SimpleDashboardFilter
          onDatabaseChange={handleDatabaseChange}
          onTimeSpanChange={handleTimeSpanChange}
          onRefresh={handleRefresh}
          defaultDatabase={selectedDatabase ?? undefined}
        >
          {headerActions}
        </SimpleDashboardFilter>
      )}

      {/* Dashboard content */}
      <div className="flex-1 min-h-0">
        {activeView && (
          <>
            {editState.isEditing ? (
              <DashboardLayoutEditor
                dashboard={activeView.dashboard}
                onLayoutChange={handleLayoutChange}
                headerActions={headerActions}
              />
            ) : (
              <DashboardPage
                panels={activeView.dashboard}
                hideFilterBar={true}
                externalFilterExpression={filterExpression}
                externalTimeSpan={selectedTimeSpan ?? undefined}
                onExternalRefresh={handleExternalRefresh}
              />
            )}
          </>
        )}
      </div>

      {/* Widget picker dialog */}
      <DashboardWidgetPicker
        open={showWidgetPicker}
        onOpenChange={setShowWidgetPicker}
        onAdd={handleAddWidget}
      />
    </div>
  );
};

DashboardTabComponent.displayName = "DashboardTab";

export const DashboardTab = memo(DashboardTabComponent);

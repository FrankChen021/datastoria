import { LocalStorage } from "@/lib/storage/local-storage-provider";
import type { UserDashboard, DashboardView } from "./dashboard-types";
import { createEmptyDashboard, createEmptyView } from "./dashboard-types";

const DASHBOARDS_STORAGE_KEY = "datastoria:dashboards";

const storage = new LocalStorage(DASHBOARDS_STORAGE_KEY, true);

/**
 * Load all user dashboards from localStorage
 */
export function loadDashboards(): UserDashboard[] {
  const dashboardIds = storage.keys();
  const dashboards: UserDashboard[] = [];

  for (const id of dashboardIds) {
    const dashboard = storage.getChildAsJSON<UserDashboard | null>(id, () => null);
    if (dashboard) {
      dashboards.push(dashboard);
    }
  }

  return dashboards.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Load a single dashboard by ID
 */
export function loadDashboard(id: string): UserDashboard | null {
  return storage.getChildAsJSON<UserDashboard | null>(id, () => null);
}

/**
 * Save a dashboard to localStorage
 */
export function saveDashboard(dashboard: UserDashboard): void {
  dashboard.updatedAt = new Date().toISOString();
  storage.setChildJSON(dashboard.id, dashboard);
}

/**
 * Delete a dashboard from localStorage
 */
export function deleteDashboard(id: string): void {
  storage.removeChild(id);
}

/**
 * Create a new dashboard with a given name
 */
export function createDashboard(name: string): UserDashboard {
  const dashboard = createEmptyDashboard(name);
  saveDashboard(dashboard);
  return dashboard;
}

/**
 * Duplicate an existing dashboard
 */
export function duplicateDashboard(original: UserDashboard): UserDashboard {
  const now = new Date().toISOString();
  const newDashboard: UserDashboard = {
    ...structuredClone(original),
    id: crypto.randomUUID(),
    name: `${original.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };

  // Generate new IDs for all views
  const viewIdMap = new Map<string, string>();
  newDashboard.views = newDashboard.views.map((view) => {
    const newId = crypto.randomUUID();
    viewIdMap.set(view.id, newId);
    return {
      ...view,
      id: newId,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Update activeViewId to the new ID
  newDashboard.activeViewId = viewIdMap.get(original.activeViewId) || newDashboard.views[0]?.id || "";

  saveDashboard(newDashboard);
  return newDashboard;
}

/**
 * Add a new view to a dashboard
 */
export function addView(dashboard: UserDashboard, viewName: string): DashboardView {
  const view = createEmptyView(viewName);
  dashboard.views.push(view);
  dashboard.activeViewId = view.id;
  saveDashboard(dashboard);
  return view;
}

/**
 * Remove a view from a dashboard
 */
export function removeView(dashboard: UserDashboard, viewId: string): void {
  const viewIndex = dashboard.views.findIndex((v) => v.id === viewId);
  if (viewIndex === -1) return;

  dashboard.views.splice(viewIndex, 1);

  // Update activeViewId if the removed view was active
  if (dashboard.activeViewId === viewId && dashboard.views.length > 0) {
    dashboard.activeViewId = dashboard.views[Math.min(viewIndex, dashboard.views.length - 1)].id;
  }

  saveDashboard(dashboard);
}

/**
 * Rename a view in a dashboard
 */
export function renameView(dashboard: UserDashboard, viewId: string, newName: string): void {
  const view = dashboard.views.find((v) => v.id === viewId);
  if (view) {
    view.name = newName;
    view.updatedAt = new Date().toISOString();
    saveDashboard(dashboard);
  }
}

/**
 * Update a view's dashboard configuration
 */
export function updateViewDashboard(
  userDashboard: UserDashboard,
  viewId: string,
  dashboardConfig: DashboardView["dashboard"]
): void {
  const view = userDashboard.views.find((v) => v.id === viewId);
  if (view) {
    view.dashboard = dashboardConfig;
    view.updatedAt = new Date().toISOString();
    saveDashboard(userDashboard);
  }
}

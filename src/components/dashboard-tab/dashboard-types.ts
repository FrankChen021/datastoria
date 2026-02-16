import type { Dashboard, PanelDescriptor } from "@/components/shared/dashboard/dashboard-model";

/**
 * A single view within a user dashboard
 */
export interface DashboardView {
  id: string;
  name: string;
  description?: string;
  dashboard: Dashboard;
  createdAt: string;
  updatedAt: string;
}

/**
 * User dashboard configuration with multiple views
 */
export interface UserDashboard {
  id: string;
  name: string;
  description?: string;
  views: DashboardView[];
  activeViewId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Edit mode state for dashboard editing
 */
export interface DashboardEditState {
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  selectedPanelIndex?: number;
}

/**
 * Widget category for the widget picker
 */
export type WidgetCategory = "stat" | "chart" | "table";

/**
 * Widget definition for the widget picker
 */
export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  icon: string;
  defaultDescriptor: PanelDescriptor;
}

/**
 * Creates a new empty dashboard with a default view
 */
export function createEmptyDashboard(name: string): UserDashboard {
  const now = new Date().toISOString();
  const viewId = crypto.randomUUID();

  return {
    id: crypto.randomUUID(),
    name,
    views: [
      {
        id: viewId,
        name: "Default View",
        dashboard: {
          version: 3,
          filter: {
            showTimeSpanSelector: true,
            showRefresh: true,
          },
          charts: [],
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    activeViewId: viewId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates a new empty view
 */
export function createEmptyView(name: string): DashboardView {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name,
    dashboard: {
      version: 3,
      filter: {
        showTimeSpanSelector: true,
        showRefresh: true,
      },
      charts: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

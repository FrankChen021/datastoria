import type { ResponsiveLayouts } from "react-grid-layout";

export const STORAGE_KEY_PREFIX = "dashboard-layout:";
const CURRENT_VERSION = 1;
const SECTION_ORDER_MIGRATION_KEY_PREFIX = `${STORAGE_KEY_PREFIX}section-order-migrated:`;

export interface SavedLayout {
  version: number;
  dashboardId: string;
  layouts: ResponsiveLayouts;
  updatedAt: string;
}

/**
 * Generate storage key for a section-specific layout
 * Format: dashboard-layout:{dashboardId}-section-{sectionIndex}
 */
function getSectionKey(dashboardId: string, sectionIndex: number): string {
  return `${STORAGE_KEY_PREFIX}${dashboardId}-section-${sectionIndex}`;
}

/**
 * Save layout for a specific section of a dashboard
 */
export function saveSectionLayout(
  dashboardId: string,
  sectionIndex: number,
  layouts: ResponsiveLayouts
): void {
  const data: SavedLayout = {
    version: CURRENT_VERSION,
    dashboardId: `${dashboardId}-section-${sectionIndex}`,
    layouts,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(getSectionKey(dashboardId, sectionIndex), JSON.stringify(data));
}

/**
 * Load layout for a specific section of a dashboard
 */
export function loadSectionLayout(
  dashboardId: string,
  sectionIndex: number
): ResponsiveLayouts | null {
  try {
    const stored = localStorage.getItem(getSectionKey(dashboardId, sectionIndex));
    if (!stored) return null;

    const data: SavedLayout = JSON.parse(stored);
    if (data.version !== CURRENT_VERSION) return null;

    return data.layouts;
  } catch {
    return null;
  }
}

/**
 * Clear layout for a specific section of a dashboard
 */
export function clearSectionLayout(dashboardId: string, sectionIndex: number): void {
  localStorage.removeItem(getSectionKey(dashboardId, sectionIndex));
}

/**
 * Clear all section layouts for a dashboard (used for reset)
 * Scans localStorage for all keys matching the dashboard prefix
 */
export function clearAllSectionLayouts(dashboardId: string): void {
  const prefix = `${STORAGE_KEY_PREFIX}${dashboardId}-section-`;
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * Invalidates legacy section-index keys for dashboards whose section ordering changed.
 *
 * This migration is idempotent and only runs once per dashboard.
 */
export function invalidateLegacySectionLayoutKeys(dashboardId: string): void {
  const migrationKey = `${SECTION_ORDER_MIGRATION_KEY_PREFIX}${dashboardId}`;
  if (localStorage.getItem(migrationKey) === "1") {
    return;
  }

  clearAllSectionLayouts(dashboardId);
  localStorage.setItem(migrationKey, "1");
}

// Legacy functions for backwards compatibility (single-grid dashboards)
export function saveDashboardLayout(dashboardId: string, layouts: ResponsiveLayouts): void {
  const data: SavedLayout = {
    version: CURRENT_VERSION,
    dashboardId,
    layouts,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${dashboardId}`, JSON.stringify(data));
}

export function loadDashboardLayout(dashboardId: string): ResponsiveLayouts | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${dashboardId}`);
    if (!stored) return null;

    const data: SavedLayout = JSON.parse(stored);
    if (data.version !== CURRENT_VERSION) return null;

    return data.layouts;
  } catch {
    return null;
  }
}

export function clearDashboardLayout(dashboardId: string): void {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${dashboardId}`);
}

/**
 * @vitest-environment jsdom
 */
import type { LayoutItem } from "react-grid-layout";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllSectionLayouts,
  clearDashboardLayout,
  clearSectionLayout,
  invalidateLegacySectionLayoutKeys,
  loadDashboardLayout,
  loadSectionLayout,
  saveDashboardLayout,
  saveSectionLayout,
  STORAGE_KEY_PREFIX,
  type SavedLayout,
} from "../dashboard-layout-storage";

describe("dashboard-layout-storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("saveDashboardLayout", () => {
    it("saves layout to localStorage with correct key", () => {
      const layouts = {
        lg: [{ i: "panel-0", x: 0, y: 0, w: 6, h: 4 }] as LayoutItem[],
        md: [{ i: "panel-0", x: 0, y: 0, w: 3, h: 4 }] as LayoutItem[],
        sm: [{ i: "panel-0", x: 0, y: 0, w: 1, h: 4 }] as LayoutItem[],
      };

      saveDashboardLayout("test-dashboard", layouts);

      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}test-dashboard`);
      expect(stored).toBeTruthy();

      const parsed: SavedLayout = JSON.parse(stored!);
      expect(parsed.version).toBe(1);
      expect(parsed.dashboardId).toBe("test-dashboard");
      expect(parsed.layouts).toEqual(layouts);
      expect(parsed.updatedAt).toBeDefined();
    });
  });

  describe("loadDashboardLayout", () => {
    it("returns null when no saved layout exists", () => {
      const result = loadDashboardLayout("nonexistent");
      expect(result).toBeNull();
    });

    it("returns saved layouts when they exist", () => {
      const layouts = {
        lg: [{ i: "panel-0", x: 0, y: 0, w: 6, h: 4 }] as LayoutItem[],
        md: [{ i: "panel-0", x: 0, y: 0, w: 3, h: 4 }] as LayoutItem[],
        sm: [{ i: "panel-0", x: 0, y: 0, w: 1, h: 4 }] as LayoutItem[],
      };

      saveDashboardLayout("my-dashboard", layouts);
      const result = loadDashboardLayout("my-dashboard");

      expect(result).toEqual(layouts);
    });

    it("returns null for corrupted data", () => {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}bad`, "not-json");
      const result = loadDashboardLayout("bad");
      expect(result).toBeNull();
    });

    it("returns null for wrong version", () => {
      const oldVersionData = {
        version: 0,
        dashboardId: "old",
        layouts: {},
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}old`, JSON.stringify(oldVersionData));
      const result = loadDashboardLayout("old");
      expect(result).toBeNull();
    });
  });

  describe("clearDashboardLayout", () => {
    it("removes saved layout from localStorage", () => {
      const layouts = {
        lg: [{ i: "panel-0", x: 0, y: 0, w: 6, h: 4 }] as LayoutItem[],
        md: [],
        sm: [],
      };
      saveDashboardLayout("to-clear", layouts);

      clearDashboardLayout("to-clear");

      expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}to-clear`)).toBeNull();
    });
  });

  describe("section layout functions", () => {
    const sampleLayouts = {
      lg: [{ i: "panel-0", x: 0, y: 0, w: 6, h: 4 }] as LayoutItem[],
      md: [{ i: "panel-0", x: 0, y: 0, w: 3, h: 4 }] as LayoutItem[],
      sm: [{ i: "panel-0", x: 0, y: 0, w: 1, h: 4 }] as LayoutItem[],
    };

    describe("saveSectionLayout", () => {
      it("saves section layout with correct key format", () => {
        saveSectionLayout("my-dashboard", 0, sampleLayouts);

        const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}my-dashboard-section-0`);
        expect(stored).toBeTruthy();

        const parsed: SavedLayout = JSON.parse(stored!);
        expect(parsed.version).toBe(1);
        expect(parsed.dashboardId).toBe("my-dashboard-section-0");
        expect(parsed.layouts).toEqual(sampleLayouts);
      });

      it("saves multiple sections independently", () => {
        const layouts1 = { ...sampleLayouts };
        const layouts2 = {
          lg: [{ i: "panel-1", x: 6, y: 0, w: 6, h: 4 }] as LayoutItem[],
          md: [],
          sm: [],
        };

        saveSectionLayout("dashboard", 0, layouts1);
        saveSectionLayout("dashboard", 1, layouts2);

        const result0 = loadSectionLayout("dashboard", 0);
        const result1 = loadSectionLayout("dashboard", 1);

        expect(result0).toEqual(layouts1);
        expect(result1).toEqual(layouts2);
      });
    });

    describe("loadSectionLayout", () => {
      it("returns null when no saved section layout exists", () => {
        const result = loadSectionLayout("nonexistent", 0);
        expect(result).toBeNull();
      });

      it("returns saved section layouts when they exist", () => {
        saveSectionLayout("test-dash", 2, sampleLayouts);
        const result = loadSectionLayout("test-dash", 2);
        expect(result).toEqual(sampleLayouts);
      });
    });

    describe("clearSectionLayout", () => {
      it("removes only the specified section layout", () => {
        saveSectionLayout("dashboard", 0, sampleLayouts);
        saveSectionLayout("dashboard", 1, sampleLayouts);

        clearSectionLayout("dashboard", 0);

        expect(loadSectionLayout("dashboard", 0)).toBeNull();
        expect(loadSectionLayout("dashboard", 1)).toEqual(sampleLayouts);
      });
    });

    describe("clearAllSectionLayouts", () => {
      it("removes all section layouts for a dashboard", () => {
        saveSectionLayout("my-dash", 0, sampleLayouts);
        saveSectionLayout("my-dash", 1, sampleLayouts);
        saveSectionLayout("my-dash", 2, sampleLayouts);
        saveSectionLayout("other-dash", 0, sampleLayouts);

        clearAllSectionLayouts("my-dash");

        expect(loadSectionLayout("my-dash", 0)).toBeNull();
        expect(loadSectionLayout("my-dash", 1)).toBeNull();
        expect(loadSectionLayout("my-dash", 2)).toBeNull();
        // Other dashboard should not be affected
        expect(loadSectionLayout("other-dash", 0)).toEqual(sampleLayouts);
      });
    });

    describe("invalidateLegacySectionLayoutKeys", () => {
      it("clears existing section layouts once and records migration", () => {
        saveSectionLayout("legacy-dash", 0, sampleLayouts);
        saveSectionLayout("legacy-dash", 1, sampleLayouts);

        invalidateLegacySectionLayoutKeys("legacy-dash");

        expect(loadSectionLayout("legacy-dash", 0)).toBeNull();
        expect(loadSectionLayout("legacy-dash", 1)).toBeNull();
        expect(
          localStorage.getItem(`${STORAGE_KEY_PREFIX}section-order-migrated:legacy-dash`)
        ).toBe("1");
      });

      it("does not clear section layouts after migration is marked complete", () => {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}section-order-migrated:legacy-dash`, "1");
        saveSectionLayout("legacy-dash", 0, sampleLayouts);

        invalidateLegacySectionLayoutKeys("legacy-dash");

        expect(loadSectionLayout("legacy-dash", 0)).toEqual(sampleLayouts);
      });
    });
  });
});

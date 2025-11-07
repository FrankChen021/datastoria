/**
 * Unified tab events for event-based communication between components
 */

export type TabType = "query" | "table" | "dependency" | "database" | "dashboard";

export interface BaseTabInfo {
  id: string;
  type: TabType;
}

export interface QueryTabInfo extends BaseTabInfo {
  type: "query";
}

export interface TableTabInfo extends BaseTabInfo {
  type: "table";
  database: string;
  table: string;
  engine?: string;
}

export interface DependencyTabInfo extends BaseTabInfo {
  type: "dependency";
  database: string;
}

export interface DatabaseTabInfo extends BaseTabInfo {
  type: "database";
  database: string;
}

export interface DashboardTabInfo extends BaseTabInfo {
  type: "dashboard";
  host: string;
}

export type TabInfo = QueryTabInfo | TableTabInfo | DependencyTabInfo | DatabaseTabInfo | DashboardTabInfo;

export interface OpenTabEventDetail {
  type: TabType;
  tabId?: string; // Optional tab ID to target specific tab
  // Table tab fields
  database?: string;
  table?: string;
  engine?: string;
  // Dashboard tab fields
  host?: string;
}

/**
 * Type-safe event listener for tab requests
 */
export type OpenTabEventHandler = (event: CustomEvent<OpenTabEventDetail>) => void;

/**
 * Unified TabManager class for handling all tab events
 */
export class TabManager {
  private static readonly OPEN_TAB_EVENT = "OPEN_TAB";

  /**
   * Emit an open table tab event
   */
  static sendOpenTableTabRequest(database: string, table: string, engine?: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "table", database, table, engine, tabId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Emit an open dependency tab event
   */
  static sendOpenDependencyTabRequest(database: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "dependency", database, tabId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Emit an open database tab event
   */
  static sendOpenDatabaseTabRequest(database: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "database", database, tabId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Emit an open dashboard tab event
   */
  static sendOpenDashboardTabRequest(host: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "dashboard", host, tabId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Add a listener for open tab events
   */
  static onOpenTab(handler: OpenTabEventHandler): () => void {
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<OpenTabEventDetail>);
    };
    window.addEventListener(TabManager.OPEN_TAB_EVENT, wrappedHandler);
    return () => window.removeEventListener(TabManager.OPEN_TAB_EVENT, wrappedHandler);
  }
}


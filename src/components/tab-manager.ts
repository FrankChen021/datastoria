/**
 * Unified tab events for event-based communication between components
 */

export type TabType = "query" | "table" | "dependency" | "database" | "server" | "dashboard" | "query-log";

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

export interface QueryLogTabInfo extends BaseTabInfo {
  type: "query-log";
  queryId?: string;
  eventDate?: string;
}

export type TabInfo = QueryTabInfo | TableTabInfo | DependencyTabInfo | DatabaseTabInfo | DashboardTabInfo | QueryLogTabInfo;

export interface OpenTabEventDetail {
  type: TabType;
  tabId?: string; // Optional tab ID to target specific tab
  // Table tab fields
  database?: string;
  table?: string;
  engine?: string;
  // Dashboard tab fields
  host?: string;
  // Query log tab fields
  queryId?: string;
  eventDate?: string;
}

/**
 * Event detail for active tab changes
 */
export interface ActiveTabChangeEventDetail {
  tabId: string;
  tabInfo: TabInfo | null; // null when tab is closed
}

/**
 * Type-safe event listener for tab requests
 */
export type OpenTabEventHandler = (event: CustomEvent<OpenTabEventDetail>) => void;

/**
 * Type-safe event listener for active tab changes
 */
export type ActiveTabChangeEventHandler = (event: CustomEvent<ActiveTabChangeEventDetail>) => void;

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
  static sendOpenServerTabRequest(host: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "server", host, tabId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Emit an open query log tab event
   */
  static sendOpenQueryLogTabRequest(queryId?: string, eventDate?: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "query-log", queryId, eventDate, tabId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Emit an activate query tab event (query tab is always present, this just activates it)
   */
  static sendActivateQueryTabRequest(): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "query" },
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

  private static readonly ACTIVE_TAB_CHANGE_EVENT = "ACTIVE_TAB_CHANGE";

  /**
   * Emit an active tab change event
   */
  static sendActiveTabChange(tabId: string, tabInfo: TabInfo | null): void {
    const event = new CustomEvent<ActiveTabChangeEventDetail>(TabManager.ACTIVE_TAB_CHANGE_EVENT, {
      detail: { tabId, tabInfo },
    });
    window.dispatchEvent(event);
  }

  /**
   * Add a listener for active tab change events
   */
  static onActiveTabChange(handler: ActiveTabChangeEventHandler): () => void {
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<ActiveTabChangeEventDetail>);
    };
    window.addEventListener(TabManager.ACTIVE_TAB_CHANGE_EVENT, wrappedHandler);
    return () => window.removeEventListener(TabManager.ACTIVE_TAB_CHANGE_EVENT, wrappedHandler);
  }
}


/**
 * Unified tab events for event-based communication between components
 */

function isInBrowser(): boolean {
  return typeof window !== "undefined";
}

export type TabType =
  | "query"
  | "table"
  | "dependency"
  | "database"
  | "node"
  | "cluster"
  | "dashboard"
  | "query-log"
  | "span-log"
  | "system-table";

export interface BaseTabInfo {
  id: string;
  type: TabType;
}

export interface QueryTabInfo extends BaseTabInfo {
  type: "query";
  initialQuery?: string;
  initialMode?: "replace" | "insert" | "none";
  initialExecute?: boolean;
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

export interface NodeTabInfo extends BaseTabInfo {
  type: "node";
  host: string;
}

export interface ClusterTabInfo extends BaseTabInfo {
  type: "cluster";
  cluster: string;
}

export interface QueryLogTabInfo extends BaseTabInfo {
  type: "query-log";
  queryId?: string;
  eventDate?: string;
}

export interface SpanLogTabInfo extends BaseTabInfo {
  type: "span-log";
  traceId?: string;
  eventDate?: string;
}

export interface SystemTableTabInfo extends BaseTabInfo {
  type: "system-table";
  tableName: string;
}

export type TabInfo =
  | QueryTabInfo
  | TableTabInfo
  | DependencyTabInfo
  | DatabaseTabInfo
  | NodeTabInfo
  | ClusterTabInfo
  | QueryLogTabInfo
  | SpanLogTabInfo
  | SystemTableTabInfo;

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
export type OpenTabEventHandler = (event: CustomEvent<TabInfo>) => void;

/**
 * Type-safe event listener for active tab changes
 */
export type ActiveTabChangeEventHandler = (event: CustomEvent<ActiveTabChangeEventDetail>) => void;

/**
 * Event detail for tab title updates
 */
export interface TabTitleUpdateEventDetail {
  tabId: string;
  title: string;
}

/**
 * Type-safe event listener for tab title updates
 */
export type TabTitleUpdateEventHandler = (event: CustomEvent<TabTitleUpdateEventDetail>) => void;

/**
 * Unified TabManager class for handling all tab events
 */
export class TabManager {
  private static readonly OPEN_TAB_EVENT = "OPEN_TAB";

  // Queue to store events when no listener is active
  private static eventQueue: CustomEvent<TabInfo>[] = [];
  private static listenerCount = 0;

  /**
   * Dispatch an event immediately or queue it if no listener is active
   */
  private static dispatchOrQueue(event: CustomEvent<TabInfo>): void {
    if (!isInBrowser()) {
      return;
    }
    if (TabManager.listenerCount > 0) {
      // Listener is active, dispatch immediately
      window.dispatchEvent(event);
    } else {
      // No listener yet, queue the event
      TabManager.eventQueue.push(event);
    }
  }

  /**
   * Open a tab with the specified information
   */
  static openTab(tabInfo: TabInfo): void {
    if (!isInBrowser()) {
      return;
    }
    const event = new CustomEvent<TabInfo>(TabManager.OPEN_TAB_EVENT, { detail: tabInfo });
    TabManager.dispatchOrQueue(event);
  }

  /**
   * Emit an activate query tab event (query tab is always present, this just activates it)
   */
  static activateQueryTab(options?: {
    query?: string;
    mode?: "replace" | "insert" | "none";
    execute?: boolean;
  }): void {
    // Query tab always has ID "query"
    TabManager.openTab({
      id: "query",
      type: "query",
      initialQuery: options?.query,
      initialMode: options?.mode,
      initialExecute: options?.execute,
    });
  }

  /**
   * Add a listener for open tab events
   */
  static onOpenTab(handler: OpenTabEventHandler): () => void {
    if (!isInBrowser()) {
      return () => {};
    }
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<TabInfo>);
    };

    window.addEventListener(TabManager.OPEN_TAB_EVENT, wrappedHandler);
    TabManager.listenerCount++;

    // Replay any queued events (only if this is the first listener)
    if (TabManager.listenerCount === 1 && TabManager.eventQueue.length > 0) {
      const queuedEvents = [...TabManager.eventQueue];
      TabManager.eventQueue = []; // Clear the queue

      // Dispatch queued events asynchronously to avoid blocking
      setTimeout(() => {
        for (const event of queuedEvents) {
          window.dispatchEvent(event);
        }
      }, 0);
    }

    return () => {
      window.removeEventListener(TabManager.OPEN_TAB_EVENT, wrappedHandler);
      TabManager.listenerCount = Math.max(0, TabManager.listenerCount - 1);
    };
  }

  private static readonly ACTIVE_TAB_CHANGE_EVENT = "ACTIVE_TAB_CHANGE";
  private static readonly CLOSE_TAB_EVENT = "CLOSE_TAB";
  private static readonly UPDATE_TAB_TITLE_EVENT = "UPDATE_TAB_TITLE";

  /**
   * Emit an active tab change event
   */
  static sendActiveTabChange(tabId: string, tabInfo: TabInfo | null): void {
    if (!isInBrowser()) {
      return;
    }
    const event = new CustomEvent<ActiveTabChangeEventDetail>(TabManager.ACTIVE_TAB_CHANGE_EVENT, {
      detail: { tabId, tabInfo },
    });
    window.dispatchEvent(event);
  }

  /**
   * Emit a close tab event
   */
  static closeTab(tabId: string): void {
    if (!isInBrowser()) {
      return;
    }
    const event = new CustomEvent<string>(TabManager.CLOSE_TAB_EVENT, {
      detail: tabId,
    });
    window.dispatchEvent(event);
  }

  /**
   * Add a listener for close tab events
   */
  static onCloseTab(handler: (event: CustomEvent<string>) => void): () => void {
    if (!isInBrowser()) {
      return () => {};
    }
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<string>);
    };
    window.addEventListener(TabManager.CLOSE_TAB_EVENT, wrappedHandler);
    return () => window.removeEventListener(TabManager.CLOSE_TAB_EVENT, wrappedHandler);
  }

  /**
   * Add a listener for active tab change events
   */
  static onActiveTabChange(handler: ActiveTabChangeEventHandler): () => void {
    if (!isInBrowser()) {
      return () => {};
    }
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<ActiveTabChangeEventDetail>);
    };
    window.addEventListener(TabManager.ACTIVE_TAB_CHANGE_EVENT, wrappedHandler);
    return () => window.removeEventListener(TabManager.ACTIVE_TAB_CHANGE_EVENT, wrappedHandler);
  }

  /**
   * Update a tab's title
   */
  static updateTabTitle(tabId: string, title: string): void {
    if (!isInBrowser()) {
      return;
    }
    const event = new CustomEvent<TabTitleUpdateEventDetail>(TabManager.UPDATE_TAB_TITLE_EVENT, {
      detail: { tabId, title },
    });
    window.dispatchEvent(event);
  }

  /**
   * Add a listener for tab title update events
   */
  static onUpdateTabTitle(handler: TabTitleUpdateEventHandler): () => void {
    if (!isInBrowser()) {
      return () => {};
    }
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<TabTitleUpdateEventDetail>);
    };
    window.addEventListener(TabManager.UPDATE_TAB_TITLE_EVENT, wrappedHandler);
    return () => window.removeEventListener(TabManager.UPDATE_TAB_TITLE_EVENT, wrappedHandler);
  }
}

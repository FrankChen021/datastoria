/**
 * Unified tab events for event-based communication between components
 */

export type TabType =
  | "query"
  | "table"
  | "dependency"
  | "database"
  | "node"
  | "dashboard"
  | "query-log"
  | "chat";

export interface BaseTabInfo {
  id: string;
  type: TabType;
}

export interface QueryTabInfo extends BaseTabInfo {
  type: "query";
  initialQuery?: string;
  initialMode?: "replace" | "insert";
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

export interface QueryLogTabInfo extends BaseTabInfo {
  type: "query-log";
  queryId?: string;
  eventDate?: string;
}

export interface ChatTabInfo extends BaseTabInfo {
  type: "chat";
  chatId?: string;
  initialPrompt?: string;
  autoRun?: boolean;
}

export type TabInfo =
  | QueryTabInfo
  | TableTabInfo
  | DependencyTabInfo
  | DatabaseTabInfo
  | NodeTabInfo
  | QueryLogTabInfo
  | ChatTabInfo;

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
  // Query tab fields
  query?: string;
  mode?: "replace" | "insert";
  editorMode?: "sql" | "chat"; // Editor mode for query tab
  execute?: boolean;
  // Chat tab fields
  chatId?: string;
  initialPrompt?: string;
  autoRun?: boolean;
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

  // Queue to store events when no listener is active
  private static eventQueue: CustomEvent<OpenTabEventDetail>[] = [];
  private static listenerCount = 0;

  /**
   * Dispatch an event immediately or queue it if no listener is active
   */
  private static dispatchOrQueue(event: CustomEvent<OpenTabEventDetail>): void {
    if (TabManager.listenerCount > 0) {
      // Listener is active, dispatch immediately
      window.dispatchEvent(event);
    } else {
      // No listener yet, queue the event
      TabManager.eventQueue.push(event);
    }
  }

  /**
   * Emit an open table tab event
   */
  static openTableTab(database: string, table: string, engine?: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "table", database, table, engine, tabId },
    });
    TabManager.dispatchOrQueue(event);
  }

  /**
   * Emit an open dependency tab event
   */
  static openDependencyTab(database: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "dependency", database, tabId },
    });
    TabManager.dispatchOrQueue(event);
  }

  /**
   * Emit an open database tab event
   */
  static openDatabaseTab(database: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "database", database, tabId },
    });
    TabManager.dispatchOrQueue(event);
  }

  /**
   * Emit an open node tab event
   */
  static openNodeTab(host: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "node", host, tabId },
    });
    TabManager.dispatchOrQueue(event);
  }

  /**
   * Emit an open query log tab event
   */
  static openQueryLogTab(queryId?: string, eventDate?: string, tabId?: string): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "query-log", queryId, eventDate, tabId },
    });
    TabManager.dispatchOrQueue(event);
  }

  /**
   * Emit an activate query tab event (query tab is always present, this just activates it)
   */
  static activateQueryTab(options?: {
    query?: string;
    mode?: "replace" | "insert";
    editorMode?: "sql" | "chat";
    execute?: boolean;
  }): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: {
        type: "query",
        query: options?.query,
        mode: options?.mode,
        editorMode: options?.editorMode,
        execute: options?.execute,
      },
    });
    TabManager.dispatchOrQueue(event);
  }

  /**
   * Emit an open chat tab event
   */
  static openChatTab(
    chatId?: string,
    tabId?: string,
    initialPrompt?: string,
    autoRun?: boolean
  ): void {
    const event = new CustomEvent<OpenTabEventDetail>(TabManager.OPEN_TAB_EVENT, {
      detail: { type: "chat", chatId, tabId, initialPrompt, autoRun },
    });
    TabManager.dispatchOrQueue(event);
  }

  /**
   * Add a listener for open tab events
   */
  static onOpenTab(handler: OpenTabEventHandler): () => void {
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<OpenTabEventDetail>);
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

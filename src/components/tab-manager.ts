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
  | "introspection"
  | "chat";

export interface BaseTabInfo {
  id: string;
  type: TabType;
}

export interface QueryTabInfo extends BaseTabInfo {
  type: "query";
  initialQuery?: string;
  initialMode?: "replace" | "insert";
  initialEditorMode?: "sql" | "chat";
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

export interface IntrospectionTabInfo extends BaseTabInfo {
  type: "introspection";
  tableName: string;
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
  | IntrospectionTabInfo
  | ChatTabInfo;

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
    const event = new CustomEvent<TabInfo>(TabManager.OPEN_TAB_EVENT, { detail: tabInfo });
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
    // Query tab always has ID "query"
    TabManager.openTab({
      id: "query",
      type: "query",
      initialQuery: options?.query,
      initialMode: options?.mode,
      initialEditorMode: options?.editorMode,
      initialExecute: options?.execute,
    });
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
    const id = tabId || (chatId ? `chat:${chatId}` : `chat:${Date.now()}`);
    TabManager.openTab({
      id,
      type: "chat",
      chatId,
      initialPrompt,
      autoRun,
    });
  }

  /**
   * Add a listener for open tab events
   */
  static onOpenTab(handler: OpenTabEventHandler): () => void {
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

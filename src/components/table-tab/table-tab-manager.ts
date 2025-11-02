/**
 * Table tab events for event-based communication between components
 */

export interface OpenTableTabEventDetail {
  database: string;
  table: string;
  engine?: string; // Table engine (e.g., "MergeTree", "SystemLog", etc.)
  tabId?: string; // Optional tabId for multi-tab support
}

/**
 * Type-safe event listener for table tab requests
 */
export type OpenTableTabEventHandler = (event: CustomEvent<OpenTableTabEventDetail>) => void;

/**
 * TableTabManager class for handling table tab events
 */
export class TableTabManager {
  private static readonly OPEN_TABLE_TAB_EVENT = "OPEN_TABLE_TAB";

  /**
   * Emit an open table tab event
   * @param database Database name
   * @param table Table name
   * @param engine Optional table engine
   * @param tabId Optional tab ID to target specific tab (if not provided, all tabs will handle it)
   */
  static sendOpenTableTabRequest(database: string, table: string, engine?: string, tabId?: string): void {
    const event = new CustomEvent<OpenTableTabEventDetail>(TableTabManager.OPEN_TABLE_TAB_EVENT, {
      detail: { database, table, engine, tabId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Add a listener for open table tab events
   */
  static onOpenTableTab(handler: OpenTableTabEventHandler): () => void {
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<OpenTableTabEventDetail>);
    };
    window.addEventListener(TableTabManager.OPEN_TABLE_TAB_EVENT, wrappedHandler);
    return () =>
      window.removeEventListener(TableTabManager.OPEN_TABLE_TAB_EVENT, wrappedHandler);
  }
}


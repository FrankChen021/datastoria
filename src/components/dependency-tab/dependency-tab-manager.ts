/**
 * Dependency tab events for event-based communication between components
 */

export interface OpenDependencyTabEventDetail {
  database: string;
  tabId?: string; // Optional tabId for multi-tab support
}

/**
 * Type-safe event listener for dependency tab requests
 */
export type OpenDependencyTabEventHandler = (event: CustomEvent<OpenDependencyTabEventDetail>) => void;

/**
 * DependencyTabManager class for handling dependency tab events
 */
export class DependencyTabManager {
  private static readonly OPEN_DEPENDENCY_TAB_EVENT = "OPEN_DEPENDENCY_TAB";

  /**
   * Emit an open dependency tab event
   * @param database Database name
   * @param tabId Optional tab ID to target specific tab (if not provided, all tabs will handle it)
   */
  static sendOpenDependencyTabRequest(database: string, tabId?: string): void {
    const event = new CustomEvent<OpenDependencyTabEventDetail>(DependencyTabManager.OPEN_DEPENDENCY_TAB_EVENT, {
      detail: { database, tabId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Add a listener for open dependency tab events
   */
  static onOpenDependencyTab(handler: OpenDependencyTabEventHandler): () => void {
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<OpenDependencyTabEventDetail>);
    };
    window.addEventListener(DependencyTabManager.OPEN_DEPENDENCY_TAB_EVENT, wrappedHandler);
    return () =>
      window.removeEventListener(DependencyTabManager.OPEN_DEPENDENCY_TAB_EVENT, wrappedHandler);
  }
}


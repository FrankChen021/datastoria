/**
 * Unified chat UI events for event-based communication between components
 */

/**
 * Event detail for chat title updates
 */
export interface ChatTitleUpdateEventDetail {
  title: string;
}

/**
 * Type-safe event listener for chat title changes
 */
export type ChatTitleChangeEventHandler = (event: CustomEvent<ChatTitleUpdateEventDetail>) => void;

/**
 * ChatUIContext utility class for handling chat UI events
 */
export class ChatUIContext {
  private static readonly CHAT_TITLE_UPDATE_EVENT = "CHAT_TITLE_UPDATE";

  /**
   * Update the chat title
   * Dispatches an event that ChatTab and ChatPanel will listen to
   */
  static updateTitle(title: string): void {
    const event = new CustomEvent<ChatTitleUpdateEventDetail>(
      ChatUIContext.CHAT_TITLE_UPDATE_EVENT,
      {
        detail: { title },
      }
    );
    window.dispatchEvent(event);
  }

  /**
   * Add a listener for chat title change events
   */
  static onTitleChange(handler: ChatTitleChangeEventHandler): () => void {
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<ChatTitleUpdateEventDetail>);
    };
    window.addEventListener(ChatUIContext.CHAT_TITLE_UPDATE_EVENT, wrappedHandler);
    return () => window.removeEventListener(ChatUIContext.CHAT_TITLE_UPDATE_EVENT, wrappedHandler);
  }
}

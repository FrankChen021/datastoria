import type { LocalStorage } from "@/lib/storage/local-storage-provider";
import { StorageManager } from "@/lib/storage/storage-provider-manager";

const HIDDEN_ACTIONS_STORAGE_KEY = "chat:actions:hidden";

export class ChatActionStorage {
  private readonly storage: LocalStorage;

  constructor() {
    this.storage = StorageManager.getInstance()
      .getStorageProvider()
      .subStorage(HIDDEN_ACTIONS_STORAGE_KEY);
  }

  private getHiddenActionsMap(chatId: string): Record<string, 1> {
    return this.storage.getChildAsJSON<Record<string, 1>>(chatId, () => ({}));
  }

  public isActionHidden(chatId?: string, messageId?: string): boolean {
    if (!chatId || !messageId) return false;
    const hiddenActions = this.getHiddenActionsMap(chatId);
    return hiddenActions[messageId] === 1;
  }

  public markActionHidden(chatId: string, messageId: string): void {
    const hiddenActions = this.getHiddenActionsMap(chatId);
    hiddenActions[messageId] = 1;
    this.storage.setChildJSON(chatId, hiddenActions);
  }

  public clearActionHidden(chatId: string, messageId: string): void {
    const hiddenActions = this.getHiddenActionsMap(chatId);
    const { [messageId]: _, ...remaining } = hiddenActions;
    if (Object.keys(remaining).length === 0) {
      this.storage.removeChild(chatId);
      return;
    }
    this.storage.setChildJSON(chatId, remaining);
  }

  public clearHiddenActionsForChat(chatId: string): void {
    this.storage.removeChild(chatId);
  }

  public clearAllHiddenActions(): void {
    this.storage.clear();
  }
}

export const chatActionStorage = new ChatActionStorage();

import { LocalStorage } from "./local-storage-provider";

/** User id when OAuth is disabled or session is unknown. */
export const DEFAULT_USER_ID = "<default>";

/**
 * Singleton manager for app local storage, keyed by userId (normalized email or sub or DEFAULT_USER_ID).
 */
class StorageManager {
  private static instance: StorageManager;

  private currentUserId = DEFAULT_USER_ID;
  private currentInstance: LocalStorage = new LocalStorage(`datastoria:${DEFAULT_USER_ID}`);
  private storageChangeListeners: Array<() => void> = [];

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  getStorageProvider(): LocalStorage {
    return this.currentInstance;
  }

  /**
   * Set the current app storage by user id. Called by AppStorageProvider when session is ready.
   * Notifies subscribers when the effective user changes (login/logout).
   */
  setStorageProvider(userId: string): void {
    const nextUserId = userId || DEFAULT_USER_ID;
    if (nextUserId === this.currentUserId) return;
    this.currentUserId = nextUserId;
    this.currentInstance = new LocalStorage(`datastoria:${this.currentUserId}`);
    for (const listener of this.storageChangeListeners) {
      listener();
    }
  }

  /**
   * Subscribe to app storage identity changes (e.g. user login/logout).
   * Returns an unsubscribe function.
   */
  subscribeToStorageProviderChange(callback: () => void): () => void {
    this.storageChangeListeners.push(callback);
    return () => {
      const i = this.storageChangeListeners.indexOf(callback);
      if (i >= 0) this.storageChangeListeners.splice(i, 1);
    };
  }
}

export { StorageManager };

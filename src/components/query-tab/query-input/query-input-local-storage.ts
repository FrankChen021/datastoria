import { StorageManager } from "@/lib/storage/storage-provider-manager";

export class QueryInputLocalStorage {
  public static getInput(key: string): string {
    const value = StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("query")
      .getChildAsString(key);
    return value || "";
  }

  public static saveInput(text: string, key: string): void {
    StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("query")
      .setChildAsString(key, text);
  }
}

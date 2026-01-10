import { LocalStorage } from "@/lib/local-storage";

export class QueryInputLocalStorage {
  public static getInput(key: string = "editing-sql"): string {
    const value = LocalStorage.getInstance().getString(key);
    return value || "";
  }

  public static saveInput(text: string, key: string = "editing-sql"): void {
    LocalStorage.getInstance().setString(key, text);
  }
}

import { LocalStorage } from '@/lib/connection/LocalStorage';

export class QueryInputLocalStorage {
  public static getInput(): string {
    const value = LocalStorage.getInstance().getString('editing-sql');
    return value || '';
  }

  public static saveInput(text: string): void {
    LocalStorage.getInstance().setString('editing-sql', text);
  }
}

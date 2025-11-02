class LocalStorage {
  private static instance: LocalStorage;

  public static getInstance(): LocalStorage {
    return this.instance || (this.instance = new this());
  }

  public getAsJSON<T>(key: string, defaultValueFactory: () => T): T {
    try {
      const value = localStorage.getItem(key);
      if (value === null) {
        return defaultValueFactory();
      }
      return JSON.parse(value);
    } catch {
      return defaultValueFactory();
    }
  }

  public setJSON(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  public getString(key: string): string | null {
    return localStorage.getItem(key);
  }

  public setString(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  public getObject(key: string): unknown {
    try {
      const value = localStorage.getItem(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  public remove(key: string): void {
    localStorage.removeItem(key);
  }
}

export { LocalStorage };

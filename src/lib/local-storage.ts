class LocalStorage {
  private static instance: LocalStorage;

  public static getInstance(): LocalStorage {
    return this.instance || (this.instance = new this());
  }

  // Helper to check if localStorage is available (client-side only)
  private isAvailable(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
  }

  public getAsJSON<T>(key: string, defaultValueFactory: () => T): T {
    if (!this.isAvailable()) {
      return defaultValueFactory();
    }
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
    if (!this.isAvailable()) return;
    localStorage.setItem(key, JSON.stringify(value));
  }

  public getString(key: string): string | null {
    if (!this.isAvailable()) return null;
    return localStorage.getItem(key);
  }

  public setString(key: string, value: string): void {
    if (!this.isAvailable()) return;
    localStorage.setItem(key, value);
  }

  public getObject(key: string): unknown {
    if (!this.isAvailable()) return null;
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
    if (!this.isAvailable()) return;
    localStorage.removeItem(key);
  }
}

export { LocalStorage };

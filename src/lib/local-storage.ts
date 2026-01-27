import LZString from "lz-string";

const COMPRESSION_MARKER = "_$_C_^_";
class LocalStorage {
  private readonly key: string;
  private readonly compressionEnabled: boolean;

  constructor(key: string, useCompression = false) {
    this.key = key;
    this.compressionEnabled = useCompression;
  }

  // Helper to check if localStorage is available (client-side only)
  private isAvailable(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
  }

  // Helper to compress a string using lz-string library
  private compressString(data: string): string {
    if (!this.compressionEnabled || data.length < 50) {
      // Don't compress very small strings - overhead not worth it
      return data;
    }

    try {
      const compressed = LZString.compressToBase64(data);

      // Only use compression if it actually reduces size
      // Add a marker prefix to identify compressed data
      if (compressed && compressed.length + COMPRESSION_MARKER.length < data.length) {
        return COMPRESSION_MARKER + compressed;
      }

      // If compression doesn't help, return original
      return data;
    } catch (error) {
      console.error("Compression failed:", error);
      return data;
    }
  }

  // Helper to decompress a string using lz-string library
  private decompressString(compressedData: string): string {
    if (!this.compressionEnabled) {
      return compressedData;
    }

    // Check if it's marked as compressed
    if (compressedData.startsWith(COMPRESSION_MARKER)) {
      try {
        const compressed = compressedData.slice(COMPRESSION_MARKER.length);
        const decompressed = LZString.decompressFromBase64(compressed);

        // If decompression fails, lz-string returns null
        if (decompressed === null) {
          console.warn("Decompression returned null, data may be corrupted");
          // Try to return the data without marker as fallback
          return compressed;
        }

        return decompressed;
      } catch (error) {
        console.error("Decompression failed:", error);
        // If decompression fails, try to return the data without marker
        return compressedData.slice(COMPRESSION_MARKER.length);
      }
    }

    // If not marked, assume it's uncompressed (backward compatibility)
    return compressedData;
  }

  public getAsJSON<T>(defaultValueFactory: () => T): T {
    if (!this.isAvailable()) {
      return defaultValueFactory();
    }
    try {
      const value = localStorage.getItem(this.key);
      if (value === null) {
        return defaultValueFactory();
      }
      const decompressed = this.decompressString(value);
      return JSON.parse(decompressed);
    } catch {
      return defaultValueFactory();
    }
  }

  public setJSON(value: unknown): void {
    if (!this.isAvailable()) return;
    const jsonString = JSON.stringify(value);
    const compressed = this.compressString(jsonString);
    localStorage.setItem(this.key, compressed);
  }

  /**
   * Get a child key's value as JSON without creating a subStorage object
   */
  public getChildAsJSON<T>(childKey: string, defaultValueFactory: () => T): T {
    if (!this.isAvailable()) {
      return defaultValueFactory();
    }
    try {
      const value = localStorage.getItem(`${this.key}:${childKey}`);
      if (value === null) {
        return defaultValueFactory();
      }
      const decompressed = this.decompressString(value);
      return JSON.parse(decompressed);
    } catch {
      return defaultValueFactory();
    }
  }

  public getChildAsString(childKey: string): string | null {
    if (!this.isAvailable()) {
      return null;
    }
    return localStorage.getItem(`${this.key}:${childKey}`);
  }

  /**
   * Set a child key's value as JSON without creating a subStorage object
   */
  public setChildJSON(childKey: string, value: unknown): void {
    if (!this.isAvailable()) return;
    const jsonString = JSON.stringify(value);
    const compressed = this.compressString(jsonString);
    localStorage.setItem(`${this.key}:${childKey}`, compressed);
  }

  public setChildAsString(childKey: string, value: string): void {
    if (!this.isAvailable()) return;
    localStorage.setItem(`${this.key}:${childKey}`, value);
  }

  /**
   * Remove a child key without creating a subStorage object
   */
  public removeChild(childKey: string): void {
    if (!this.isAvailable()) return;
    localStorage.removeItem(`${this.key}:${childKey}`);
  }

  public getString(): string | null {
    if (!this.isAvailable()) return null;
    return localStorage.getItem(this.key);
  }

  public setString(value: string): void {
    if (!this.isAvailable()) return;
    localStorage.setItem(this.key, value);
  }

  public getObject(): unknown {
    if (!this.isAvailable()) return null;
    try {
      const value = localStorage.getItem(this.key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  public remove(): void {
    if (!this.isAvailable()) return;
    localStorage.removeItem(this.key);
  }

  /**
   * Get the number of items in localStorage that start with this key as prefix
   */
  public get length(): number {
    if (!this.isAvailable()) return 0;
    const prefix = this.key + ":";
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all sub-keys that start with this key as prefix (returns keys without the prefix)
   */
  public keys(): string[] {
    if (!this.isAvailable()) return [];
    const prefix = this.key + ":";
    const result: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        result.push(key.slice(prefix.length));
      }
    }
    return result;
  }

  /**
   * Remove all items that start with this key as prefix
   */
  public clear(): void {
    if (!this.isAvailable()) return;
    const prefix = this.key + ":";
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }

  /**
   * Create a sub-storage with a nested key
   * @param subKey - The sub-key for the nested storage
   */
  public subStorage(subKey: string): LocalStorage {
    return new LocalStorage(`${this.key}:${subKey}`, this.compressionEnabled);
  }

  /**
   * Create a new LocalStorage instance with the specified compression setting
   * @param enable - Optional compression flag (defaults to true)
   * @returns A new LocalStorage instance with the same key but different compression setting
   */
  public withCompression(enable = true): LocalStorage {
    return new LocalStorage(this.key, enable);
  }
}

// Default instance with 'datastoria' prefix for the application
const appLocalStorage = new LocalStorage("datastoria");

export { appLocalStorage, LocalStorage };

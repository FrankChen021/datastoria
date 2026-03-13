import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelManager } from "./model-manager";

class MockStorage {
  private readonly values = new Map<string, string>();
  private readonly prefix: string;

  constructor(prefix = "") {
    this.prefix = prefix;
  }

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  public removeItem(key: string): void {
    this.values.delete(key);
  }

  public clear(): void {
    this.values.clear();
  }

  public key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  public get length(): number {
    return this.values.size;
  }

  public subStorage(subKey: string): MockStorageAdapter {
    return new MockStorageAdapter(this, `${this.prefix}:${subKey}`);
  }
}

class MockStorageAdapter {
  constructor(
    private readonly root: MockStorage,
    private readonly key: string
  ) {}

  public getAsJSON<T>(defaultValueFactory: () => T): T {
    const value = this.root.getItem(this.key);
    return value === null ? defaultValueFactory() : (JSON.parse(value) as T);
  }

  public setJSON(value: unknown): void {
    this.root.setItem(this.key, JSON.stringify(value));
  }

  public getString(): string | null {
    return this.root.getItem(this.key);
  }

  public setString(value: string): void {
    this.root.setItem(this.key, value);
  }

  public subStorage(subKey: string): MockStorageAdapter {
    return new MockStorageAdapter(this.root, `${this.key}:${subKey}`);
  }
}

describe("ModelManager.getAvailableModels", () => {
  const rootStorage = new MockStorage("datastoria:test");

  beforeEach(() => {
    rootStorage.clear();
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("localStorage", rootStorage);

    (ModelManager as unknown as { instance?: ModelManager }).instance = undefined;
  });

  it("keeps system models as system when the user has not configured an API key", () => {
    const manager = ModelManager.getInstance();
    manager.setSystemModels(
      [
        {
          provider: "TestProvider",
          modelId: "test-model",
          source: "system",
        },
      ],
      false
    );

    const models = manager.getAvailableModels();

    expect(models).toEqual([
      expect.objectContaining({
        provider: "TestProvider",
        modelId: "test-model",
        source: "system",
      }),
    ]);
  });

  it("marks system models as user when the user configures an API key for that provider", () => {
    const manager = ModelManager.getInstance();
    manager.setSystemModels(
      [
        {
          provider: "TestProvider",
          modelId: "test-model",
          source: "system",
        },
      ],
      false
    );
    manager.updateProviderSetting("TestProvider", { apiKey: "user-key" });

    const models = manager.getAvailableModels();

    expect(models).toEqual([
      expect.objectContaining({
        provider: "TestProvider",
        modelId: "test-model",
        source: "user",
      }),
    ]);
  });
});

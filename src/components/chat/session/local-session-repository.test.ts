import { beforeEach, describe, expect, it, vi } from "vitest";
import { localSessionRepository } from "./local-session-repository";

class MockLocalStorage {
  private readonly values = new Map<string, string>();

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
}

describe("LocalSessionRepository.createSessionFromMessages", () => {
  const storage = new MockLocalStorage();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("localStorage", storage);
  });

  it("preserves metadata-created timestamps when imported messages do not have createdAt", async () => {
    const metadataTimestamp = Date.parse("2026-03-24T12:34:56.000Z");

    const session = await localSessionRepository.createSessionFromMessages({
      connectionId: "conn-1",
      title: "Inline error diagnosis",
      messages: [
        {
          id: "msg-1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
          metadata: { createdAt: metadataTimestamp },
        } as never,
      ],
    });

    const messages = await localSessionRepository.getMessages(session.chatId);

    expect(messages).toHaveLength(1);
    expect(messages[0].createdAt.getTime()).toBe(metadataTimestamp);
  });
});

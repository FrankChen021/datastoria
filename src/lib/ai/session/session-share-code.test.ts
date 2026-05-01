import { describe, expect, it, vi } from "vitest";
import { signSessionShareCode, verifySessionShareCode } from "./session-share-code";
import { SESSION_SHARE_SCOPE_FULL } from "./session-share-constants";

describe("session share codes", () => {
  it("round-trips owner, session, scope, and expiration claims", async () => {
    vi.stubEnv("SESSION_SHARE_SECRET", "test-secret");

    const code = await signSessionShareCode({
      ownerId: "owner@example.com",
      sessionId: "session-1",
      expiresAt: 4102444800,
    });

    await expect(verifySessionShareCode(code)).resolves.toEqual({
      issuer: "owner@example.com",
      sessionId: "session-1",
      scope: SESSION_SHARE_SCOPE_FULL,
      expiresAt: 4102444800,
    });
  });

  it("rejects expired share codes", async () => {
    vi.stubEnv("SESSION_SHARE_SECRET", "test-secret");

    const code = await signSessionShareCode({
      ownerId: "owner@example.com",
      sessionId: "session-1",
      expiresAt: 1,
    });

    await expect(verifySessionShareCode(code)).rejects.toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { PersistedChatSession, ServerSessionRepository } from "./server-session-repository";
import { resolveSessionAccess, SessionAccessError } from "./session-access";
import { signSessionShareCode } from "./session-share-code";

function createSession(userId: string, sessionId: string): PersistedChatSession {
  return {
    user_id: userId,
    session_id: sessionId,
    connection_id: "conn-1",
    title: "Session",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function createRepository(
  sessions: PersistedChatSession[]
): Pick<ServerSessionRepository, "getSession"> {
  return {
    async getSession(userId, sessionId) {
      return (
        sessions.find(
          (session) => session.user_id === userId && session.session_id === sessionId
        ) ?? null
      );
    },
  };
}

describe("resolveSessionAccess", () => {
  it("uses authenticated owner access before share access", async () => {
    vi.stubEnv("SESSION_SHARE_SECRET", "test-secret");
    const repository = createRepository([createSession("owner@example.com", "session-1")]);

    await expect(
      resolveSessionAccess({
        repository: repository as ServerSessionRepository,
        authenticatedUserId: "owner@example.com",
        sessionId: "session-1",
      })
    ).resolves.toMatchObject({
      kind: "owner",
      ownerId: "owner@example.com",
    });
  });

  it("uses a valid share code to resolve the session owner", async () => {
    vi.stubEnv("SESSION_SHARE_SECRET", "test-secret");
    const repository = createRepository([createSession("owner@example.com", "session-1")]);
    const shareCode = await signSessionShareCode({
      ownerId: "owner@example.com",
      sessionId: "session-1",
    });

    await expect(
      resolveSessionAccess({
        repository: repository as ServerSessionRepository,
        authenticatedUserId: "viewer@example.com",
        sessionId: "session-1",
        shareCode,
      })
    ).resolves.toMatchObject({
      kind: "share",
      ownerId: "owner@example.com",
    });
  });

  it("prefers a supplied share code over a colliding viewer-owned session", async () => {
    vi.stubEnv("SESSION_SHARE_SECRET", "test-secret");
    const repository = createRepository([
      createSession("viewer@example.com", "session-1"),
      createSession("owner@example.com", "session-1"),
    ]);
    const shareCode = await signSessionShareCode({
      ownerId: "owner@example.com",
      sessionId: "session-1",
    });

    await expect(
      resolveSessionAccess({
        repository: repository as ServerSessionRepository,
        authenticatedUserId: "viewer@example.com",
        sessionId: "session-1",
        shareCode,
      })
    ).resolves.toMatchObject({
      kind: "share",
      ownerId: "owner@example.com",
    });
  });

  it("rejects a share code for a different session", async () => {
    vi.stubEnv("SESSION_SHARE_SECRET", "test-secret");
    const repository = createRepository([createSession("owner@example.com", "session-1")]);
    const shareCode = await signSessionShareCode({
      ownerId: "owner@example.com",
      sessionId: "session-2",
    });

    await expect(
      resolveSessionAccess({
        repository: repository as ServerSessionRepository,
        authenticatedUserId: "viewer@example.com",
        sessionId: "session-1",
        shareCode,
      })
    ).rejects.toMatchObject(new SessionAccessError("Invalid session share code", 403));
  });
});

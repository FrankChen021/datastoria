import { SESSION_SHARE_CODE_HEADER } from "@/lib/ai/session/session-share-constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteSessionRepository } from "./remote-session-repository";

describe("RemoteSessionRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds the session share code header when loading a shared session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          chatId: "session-1",
          databaseId: "conn-1",
          title: "Session",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const repository = new RemoteSessionRepository();
    await repository.getSession("session-1", { shareCode: "share-token" });

    expect(fetchMock).toHaveBeenCalledWith("/api/ai/chat/sessions/session-1", {
      headers: { [SESSION_SHARE_CODE_HEADER]: "share-token" },
      credentials: "same-origin",
      cache: "no-store",
    });
  });
});

import type {
  PersistedChatSession,
  ServerSessionRepository,
} from "@/lib/ai/session/server-session-repository";
import { verifySessionShareCode } from "./session-share-code";

export type SessionAccess =
  | {
      kind: "owner";
      ownerId: string;
      session: PersistedChatSession;
    }
  | {
      kind: "share";
      ownerId: string;
      session: PersistedChatSession;
    };

export class SessionAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "SessionAccessError";
  }
}

export async function resolveSessionAccess(input: {
  repository: ServerSessionRepository;
  authenticatedUserId: string | undefined;
  sessionId: string;
  shareCode?: string | null;
}): Promise<SessionAccess> {
  if (!input.authenticatedUserId) {
    throw new SessionAccessError("Authentication required", 401);
  }

  if (input.shareCode) {
    let claims: Awaited<ReturnType<typeof verifySessionShareCode>>;
    try {
      claims = await verifySessionShareCode(input.shareCode);
    } catch {
      throw new SessionAccessError("Invalid session share code", 403);
    }

    if (claims.sessionId !== input.sessionId) {
      throw new SessionAccessError("Invalid session share code", 403);
    }

    const sharedSession = await input.repository.getSession(claims.issuer, input.sessionId);
    if (!sharedSession) {
      throw new SessionAccessError("Not found", 404);
    }

    return {
      kind: "share",
      ownerId: claims.issuer,
      session: sharedSession,
    };
  }

  const ownerSession = await input.repository.getSession(
    input.authenticatedUserId,
    input.sessionId
  );
  if (ownerSession) {
    return {
      kind: "owner",
      ownerId: input.authenticatedUserId,
      session: ownerSession,
    };
  }

  throw new SessionAccessError("Not found", 404);
}

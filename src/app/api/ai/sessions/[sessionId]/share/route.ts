import { getAuthenticatedUserEmail } from "@/auth";
import { validateSessionId } from "@/lib/ai/session/remote-chat-request";
import { getServerSessionRepository } from "@/lib/ai/session/server-session-repository-factory";
import { signSessionShareCode } from "@/lib/ai/session/session-share-code";
import {
  SESSION_SHARE_EXPIRES_AT,
  SESSION_SHARE_EXPIRES_AT_SECONDS,
} from "@/lib/ai/session/session-share-constants";
import { BasePath } from "@/lib/base-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  const userId = getAuthenticatedUserEmail(req);
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  const { sessionId } = await context.params;
  if (!validateSessionId(sessionId)) {
    return new Response("Invalid sessionId", { status: 400 });
  }

  const sessionRepository = getServerSessionRepository();
  const session = await sessionRepository.getSession(userId, sessionId);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const code = await signSessionShareCode({
    ownerId: userId,
    sessionId,
    expiresAt: SESSION_SHARE_EXPIRES_AT_SECONDS,
  });
  const url = `${BasePath.getURL(`/session/${encodeURIComponent(sessionId)}`)}?code=${encodeURIComponent(code)}`;

  return Response.json({
    url,
    code,
    expiresAt: SESSION_SHARE_EXPIRES_AT.toISOString(),
  });
}

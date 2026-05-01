import { getAuthenticatedUserEmail } from "@/auth";
import { validateSessionId } from "@/lib/ai/session/remote-chat-request";
import { persistedMessageToDTO } from "@/lib/ai/session/serialization";
import { getServerSessionRepository } from "@/lib/ai/session/server-session-repository-factory";
import { resolveSessionAccess, SessionAccessError } from "@/lib/ai/session/session-access";
import { SESSION_SHARE_CODE_HEADER } from "@/lib/ai/session/session-share-constants";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  const userId = getAuthenticatedUserEmail(req);

  const { sessionId } = await context.params;
  if (!validateSessionId(sessionId)) {
    return new Response("Invalid sessionId", { status: 400 });
  }

  const sessionRepository = getServerSessionRepository();
  let access;
  try {
    access = await resolveSessionAccess({
      repository: sessionRepository,
      authenticatedUserId: userId,
      sessionId,
      shareCode: req.headers.get(SESSION_SHARE_CODE_HEADER),
    });
  } catch (error) {
    if (error instanceof SessionAccessError) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  }

  const messages = await sessionRepository.getMessages(access.ownerId, sessionId);
  return Response.json(messages.map(persistedMessageToDTO));
}

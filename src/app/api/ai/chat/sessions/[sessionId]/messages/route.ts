import { getAuthenticatedUserEmail } from "@/auth";
import { validateSessionId } from "@/lib/ai/session/remote-chat-request";
import { persistedMessageToDTO } from "@/lib/ai/session/serialization";
import { getServerSessionRepository } from "@/lib/ai/session/server-session-repository-factory";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
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

  const messages = await sessionRepository.getMessages(userId, sessionId);
  return Response.json(messages.map(persistedMessageToDTO));
}

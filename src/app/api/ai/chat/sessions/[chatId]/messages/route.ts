import { validateSessionId } from "@/lib/ai/session/remote-chat-request";
import { persistedMessageToDTO } from "@/lib/ai/session/serialization";
import { getServerSessionRepository } from "@/lib/ai/session/server-session-repository-factory";
import { resolveVerifiedUserId } from "@/lib/auth/resolve-user-identity";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  const userId = await resolveVerifiedUserId(req);
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  const { chatId: sessionId } = await context.params;
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

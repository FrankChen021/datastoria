import { persistedSessionToDTO } from "@/lib/ai/session/serialization";
import { getServerSessionRepository } from "@/lib/ai/session/server-session-repository-factory";
import { resolveVerifiedUserId } from "@/lib/auth/resolve-user-identity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await resolveVerifiedUserId(req);
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  const url = new URL(req.url);
  const connectionId = url.searchParams.get("connectionId");
  if (!connectionId) {
    return new Response("Missing connectionId", { status: 400 });
  }

  const sessionRepository = getServerSessionRepository();
  const sessions = await sessionRepository.getSessionsForConnection(userId, connectionId);
  return Response.json(sessions.map(persistedSessionToDTO));
}

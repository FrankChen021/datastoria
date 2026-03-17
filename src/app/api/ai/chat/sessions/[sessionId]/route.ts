import { getAuthenticatedUserEmail } from "@/auth";
import { validateSessionId } from "@/lib/ai/session/remote-chat-request";
import { persistedSessionToDTO } from "@/lib/ai/session/serialization";
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

  return Response.json(persistedSessionToDTO(session));
}

export async function PATCH(req: Request, context: RouteContext) {
  const userId = getAuthenticatedUserEmail(req);
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  const { sessionId } = await context.params;
  if (!validateSessionId(sessionId)) {
    return new Response("Invalid sessionId", { status: 400 });
  }

  let payload: { title?: unknown };
  try {
    payload = (await req.json()) as { title?: unknown };
  } catch {
    return new Response("Invalid JSON in request body", { status: 400 });
  }

  if (typeof payload.title !== "string" || payload.title.trim().length === 0) {
    return new Response("Missing title", { status: 400 });
  }

  const sessionRepository = getServerSessionRepository();
  const session = await sessionRepository.getSession(userId, sessionId);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  await sessionRepository.renameSession(userId, sessionId, payload.title.trim());
  const updated = await sessionRepository.getSession(userId, sessionId);
  if (!updated) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(persistedSessionToDTO(updated));
}

export async function DELETE(req: Request, context: RouteContext) {
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

  await sessionRepository.deleteSession(userId, sessionId);
  return new Response(null, { status: 204 });
}

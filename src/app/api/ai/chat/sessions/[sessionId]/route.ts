import { getAuthenticatedUserEmail } from "@/auth";
import { validateSessionId } from "@/lib/ai/session/remote-chat-request";
import { persistedSessionToDTO } from "@/lib/ai/session/serialization";
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

  return Response.json(persistedSessionToDTO(access.session));
}

export async function PATCH(req: Request, context: RouteContext) {
  const userId = getAuthenticatedUserEmail(req);

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

  await sessionRepository.renameSession(access.ownerId, sessionId, payload.title.trim());
  const updated = await sessionRepository.getSession(access.ownerId, sessionId);
  if (!updated) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(persistedSessionToDTO(updated));
}

export async function DELETE(req: Request, context: RouteContext) {
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

  await sessionRepository.deleteSession(access.ownerId, sessionId);
  return new Response(null, { status: 204 });
}

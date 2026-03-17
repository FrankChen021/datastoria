import { persistedSessionToDTO } from "@/lib/ai/session/serialization";
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

  const { chatId } = await context.params;
  const persistence = getServerSessionRepository();
  const session = await persistence.getSession(userId, chatId);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(persistedSessionToDTO(session));
}

export async function PATCH(req: Request, context: RouteContext) {
  const userId = await resolveVerifiedUserId(req);
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  const { chatId } = await context.params;
  let payload: { title?: unknown };
  try {
    payload = (await req.json()) as { title?: unknown };
  } catch {
    return new Response("Invalid JSON in request body", { status: 400 });
  }

  if (typeof payload.title !== "string" || payload.title.trim().length === 0) {
    return new Response("Missing title", { status: 400 });
  }

  const persistence = getServerSessionRepository();
  const session = await persistence.getSession(userId, chatId);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  await persistence.renameSession(userId, chatId, payload.title.trim());
  const updated = await persistence.getSession(userId, chatId);
  if (!updated) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(persistedSessionToDTO(updated));
}

export async function DELETE(req: Request, context: RouteContext) {
  const userId = await resolveVerifiedUserId(req);
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  const { chatId } = await context.params;
  const persistence = getServerSessionRepository();
  await persistence.deleteSession(userId, chatId);
  return new Response(null, { status: 204 });
}

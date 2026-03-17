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

  const { chatId } = await context.params;
  const persistence = getServerSessionRepository();
  const session = await persistence.getSession(userId, chatId);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const messages = await persistence.getMessages(userId, chatId);
  return Response.json(messages.map(persistedMessageToDTO));
}

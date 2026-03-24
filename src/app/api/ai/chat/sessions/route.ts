import { getAuthenticatedUserEmail } from "@/auth";
import type { AppUIMessage } from "@/lib/ai/chat-types";
import { validateSessionId } from "@/lib/ai/session/remote-chat-request";
import { persistedSessionToDTO } from "@/lib/ai/session/serialization";
import { getServerSessionRepository } from "@/lib/ai/session/server-session-repository-factory";
import { v7 as uuidv7 } from "uuid";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = getAuthenticatedUserEmail(req);
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

type CreateSessionRequest = {
  connectionId?: unknown;
  sessionId?: unknown;
  title?: unknown;
  messages?: unknown;
};

function isValidMessage(value: unknown): value is AppUIMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AppUIMessage>;
  return (
    typeof candidate.id === "string" &&
    validateSessionId(candidate.id) &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    Array.isArray(candidate.parts)
  );
}

export async function POST(req: Request) {
  const userId = getAuthenticatedUserEmail(req);
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  let payload: CreateSessionRequest;
  try {
    payload = (await req.json()) as CreateSessionRequest;
  } catch {
    return new Response("Invalid JSON in request body", { status: 400 });
  }

  if (typeof payload.connectionId !== "string" || !payload.connectionId.trim()) {
    return new Response("Missing connectionId", { status: 400 });
  }

  if (
    payload.sessionId !== undefined &&
    (typeof payload.sessionId !== "string" || !validateSessionId(payload.sessionId))
  ) {
    return new Response("Invalid sessionId", { status: 400 });
  }

  if (
    !Array.isArray(payload.messages) ||
    payload.messages.some((message) => !isValidMessage(message))
  ) {
    return new Response("Invalid messages", { status: 400 });
  }

  const sessionRepository = getServerSessionRepository();
  const sessionId =
    typeof payload.sessionId === "string" && payload.sessionId.trim()
      ? payload.sessionId
      : uuidv7().replace(/-/g, "");

  const existingSession = await sessionRepository.getSession(userId, sessionId);
  if (!existingSession) {
    await sessionRepository.createSession({
      id: sessionId,
      user_id: userId,
      connection_id: payload.connectionId,
      title:
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title.trim()
          : "Inline error diagnosis",
    });
  } else if (existingSession.connection_id !== payload.connectionId) {
    return new Response("Session connectionId mismatch", { status: 409 });
  }

  for (const message of payload.messages) {
    await sessionRepository.upsertMessage({
      session_id: sessionId,
      user_id: userId,
      message,
    });
  }

  const session = await sessionRepository.getSession(userId, sessionId);
  if (!session) {
    return new Response("Session was not created", { status: 500 });
  }

  return Response.json({
    session: persistedSessionToDTO(session),
  });
}

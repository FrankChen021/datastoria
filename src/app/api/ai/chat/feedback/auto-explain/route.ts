import { getAuthenticatedUserEmail } from "@/auth";
import {
  normalizeFeedbackEventForStorage,
  validateUpsertFeedbackEventRequest,
} from "@/lib/ai/session/feedback-events";
import {
  getServerSessionRepository,
  getSessionRepositoryType,
} from "@/lib/ai/session/server-session-repository-factory";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    let payload: unknown;
    try {
      payload = (await req.json()) as unknown;
    } catch {
      return new Response("Invalid JSON in request body", { status: 400 });
    }

    const feedbackRequest = validateUpsertFeedbackEventRequest(payload);
    if (!feedbackRequest) {
      return new Response("Invalid request format", { status: 400 });
    }

    const userEmail = getAuthenticatedUserEmail(req) ?? null;
    if (getSessionRepositoryType(userEmail) !== "remote" || !userEmail) {
      return Response.json({ recorded: false }, { status: 202 });
    }

    const normalized = normalizeFeedbackEventForStorage(feedbackRequest);
    const event = await getServerSessionRepository().upsertFeedbackEvent({
      user_id: userEmail,
      source: normalized.source,
      session_id: normalized.sessionId,
      message_id: normalized.messageId,
      solved: normalized.solved,
      reason_code: normalized.reasonCode,
      payload_text: JSON.stringify(normalized.payload),
      free_text: normalized.freeText,
      recovery_action_taken: normalized.recoveryActionTaken,
    });

    return Response.json({
      recorded: true,
      updatedAt: event.updated_at.toISOString(),
      solved: event.solved,
    });
  } catch (error) {
    console.error("[/api/ai/chat/feedback/auto-explain] Failed to record feedback", error);
    return new Response("Failed to record feedback", { status: 500 });
  }
}

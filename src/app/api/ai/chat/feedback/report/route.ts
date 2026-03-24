import { getAuthenticatedUserEmail } from "@/auth";
import { validateFeedbackReportFilters } from "@/lib/ai/session/feedback-events";
import { buildFeedbackReport } from "@/lib/ai/session/feedback-report";
import { canAccessAIFeedbackReport } from "@/lib/ai/session/feedback-report-auth";
import { getServerSessionRepository } from "@/lib/ai/session/server-session-repository-factory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = getAuthenticatedUserEmail(req);
  if (!userId) {
    return new Response("Authentication required", { status: 401 });
  }

  if (!canAccessAIFeedbackReport(userId)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const filters = validateFeedbackReportFilters(url);
  const createdAfter = filters.days
    ? new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000)
    : undefined;

  const events = await getServerSessionRepository().getFeedbackEvents({
    source: filters.source,
    createdAfter,
  });

  return Response.json({
    filters,
    report: buildFeedbackReport(events),
  });
}

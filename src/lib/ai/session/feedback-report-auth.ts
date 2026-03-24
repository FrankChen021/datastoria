const REPORT_ALLOWLIST_ENV = "AI_FEEDBACK_REPORT_ALLOWED_USERS";

export function canAccessAIFeedbackReport(userId: string): boolean {
  const raw = process.env[REPORT_ALLOWLIST_ENV];
  const allowlist = raw
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!allowlist || allowlist.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  return allowlist.includes(userId.trim().toLowerCase());
}

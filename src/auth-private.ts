/**
 * Returns a next-auth–compatible session built from request headers (ALB/proxy).
 * Stub: returns null. Implement for ALB/proxy header-based session when needed.
 */
export async function getSessionPrivate(): Promise<import("next-auth").Session | null> {
  return null;
}

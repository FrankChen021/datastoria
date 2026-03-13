/**
 * Returns a next-auth–compatible session built from request headers (ALB/proxy).
 * Stub: returns null. Implement when AUTH_VIA_FORWARDED_HEADERS is used.
 */
export async function getSessionPrivate(): Promise<import("next-auth").Session | null> {
  return null;
}

import { auth, getAuthenticatedUserEmail, isAuthEnabled } from "@/auth";

export async function resolveVerifiedUserId(req: Request): Promise<string | null> {
  if (isAuthEnabled()) {
    const session = (await auth()) as { user?: { id?: string | null } } | null;
    const userId = session?.user?.id ?? null;
    if (userId) {
      return userId;
    }

    return process.env.ALLOW_ANONYMOUS_USER === "true" ? "anonymous" : null;
  }

  const email = getAuthenticatedUserEmail(req);
  if (email) {
    return email;
  }

  return process.env.ALLOW_ANONYMOUS_USER === "true" ? "anonymous" : null;
}

import { auth, getAuthenticatedUserEmail, isAuthEnabled } from "@/auth";

export async function resolveVerifiedUserId(req: Request): Promise<string | null> {
  if (isAuthEnabled()) {
    const session = (await auth()) as { user?: { id?: string | null } } | null;
    return session?.user?.id ?? null;
  }

  const email = getAuthenticatedUserEmail(req);
  return email ?? null;
}

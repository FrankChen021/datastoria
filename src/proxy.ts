import { allowAnonymousUser, AUTH_HEADER_USER_EMAIL, getSession } from "@/auth";
import { BasePath } from "@/lib/base-path";
import type { Session } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const basePath = BasePath.getBasePath();
  const pathnameWithoutBasePath = BasePath.startsWithBasePath(pathname)
    ? pathname.slice(basePath.length) || "/"
    : pathname;

  // Allow access to login page and auth API routes without auth check
  if (
    pathnameWithoutBasePath.startsWith("/login") ||
    pathnameWithoutBasePath.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const session = (await getSession()) as Session | null;

  const user = session?.user ?? null;
  if (!user && !allowAnonymousUser()) {
    const loginUrl = new URL(BasePath.getURL("/login"), request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const newHeaders = new Headers(request.headers);
  newHeaders.delete(AUTH_HEADER_USER_EMAIL);

  const email = user?.email;
  if (email) {
    newHeaders.set(AUTH_HEADER_USER_EMAIL, email);
  }
  return NextResponse.next({ request: { headers: newHeaders } });
}

// Configure which routes to run proxy on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

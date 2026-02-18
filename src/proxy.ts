import { allowAnonymousUser, auth, AUTH_HEADER_USER_EMAIL } from "@/auth";
import type { Session } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to login page and auth API routes without auth check
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (allowAnonymousUser()) {
    return NextResponse.next();
  }

  // Require authentication
  const session = (await auth()) as Session;
  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const newHeaders = new Headers(request.headers);
  if (session.user.email) {
    newHeaders.set(AUTH_HEADER_USER_EMAIL, session.user.email);
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

import { handlers, isAuthEnabled } from "@/auth";
import { BasePath } from "@/lib/base-path";
import { NextRequest, NextResponse } from "next/server";

function getFirstForwardedValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);

  return first ?? null;
}

/**
 * Work around NextAuth callback URL handling when deployed under a base path
 * behind reverse proxies that set forwarded host/proto headers.
 */
function rewriteRequestForBasePath(request: NextRequest): NextRequest {
  const basePath = BasePath.getBasePath();
  if (!basePath || BasePath.startsWithBasePath(request.nextUrl.pathname)) {
    return request;
  }

  const forwardedHost = getFirstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = getFirstForwardedValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProto
    ? forwardedProto.endsWith(":")
      ? forwardedProto
      : `${forwardedProto}:`
    : request.nextUrl.protocol;
  const host = forwardedHost ?? request.nextUrl.host;
  const url = new URL(
    `${protocol}//${host}${basePath}${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return new NextRequest(url, request);
}

export async function GET(request: NextRequest) {
  if (isAuthEnabled()) {
    return await handlers.GET(rewriteRequestForBasePath(request));
  }
  return NextResponse.json({ message: "Authentication is not enabled" });
}

export async function POST(request: NextRequest) {
  if (isAuthEnabled()) {
    return await handlers.POST(rewriteRequestForBasePath(request));
  }
  return NextResponse.next();
}

import { auth, isAuthEnabled } from "@/auth";
import type { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID = process.env.GITHUB_COPILOT_CLIENT_ID;

export async function POST(req: NextRequest) {
  const session = isAuthEnabled() ? ((await auth()) as Session) : null;
  if (isAuthEnabled() && !session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  if (!CLIENT_ID) {
    return NextResponse.json({ error: "GitHub Client ID is not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.refresh_token) {
    return NextResponse.json({ error: "refresh_token is required" }, { status: 400 });
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      refresh_token: body.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to refresh access token" },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from "next/server";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.refresh_token || typeof body.refresh_token !== "string") {
    return NextResponse.json({ error: "refresh_token is required" }, { status: 400 });
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CODEX_CLIENT_ID,
      refresh_token: body.refresh_token,
    }),
  });

  const payload = await response.json().catch(async () => ({
    error: await response.text().catch(() => "Failed to refresh Codex token"),
  }));

  if (!response.ok) {
    return NextResponse.json(payload, { status: response.status });
  }

  return NextResponse.json(payload);
}

import { NextRequest, NextResponse } from "next/server";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.code || typeof body.code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (!body?.code_verifier || typeof body.code_verifier !== "string") {
    return NextResponse.json({ error: "code_verifier is required" }, { status: 400 });
  }
  if (!body?.redirect_uri || typeof body.redirect_uri !== "string") {
    return NextResponse.json({ error: "redirect_uri is required" }, { status: 400 });
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CODEX_CLIENT_ID,
      code: body.code,
      code_verifier: body.code_verifier,
      redirect_uri: body.redirect_uri,
    }),
  });

  const payload = await response.json().catch(async () => ({
    error: await response.text().catch(() => "Failed to exchange Codex authorization code"),
  }));

  if (!response.ok) {
    return NextResponse.json(payload, { status: response.status });
  }

  return NextResponse.json(payload);
}

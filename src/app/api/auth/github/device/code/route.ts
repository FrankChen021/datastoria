import { NextResponse } from "next/server";

const CLIENT_ID = process.env.GITHUB_COPILOT_CLIENT_ID;

export async function POST() {
  // Auth is enforced by proxy when ALLOW_ANONYMOUS_USER=false

  if (!CLIENT_ID) {
    return NextResponse.json({ error: "GitHub Client ID is not configured" }, { status: 500 });
  }

  try {
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        scope: "read:user",
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to initiate device authorization" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error initiating device flow:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

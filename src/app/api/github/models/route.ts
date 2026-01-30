import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return NextResponse.json({ error: "Authorization header is required" }, { status: 401 });
  }

  try {
    const response = await fetch("https://api.githubcopilot.com/models", {
      headers: {
        Authorization: authHeader,
        "Editor-Version": "vscode/1.91.1",
        "Editor-Plugin-Version": "copilot-chat/0.17.1",
        "User-Agent": "GitHubCopilotChat/0.17.1",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error proxying GitHub models:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

import { normalizeGitHubCopilotModels } from "@/lib/ai/llm/github-copilot-models";
import { getAvailableSystemModels } from "@/lib/ai/llm/llm-provider-factory";
import { NextRequest, NextResponse } from "next/server";

async function fetchGitHubModels(authorization: string) {
  const response = await fetch("https://api.githubcopilot.com/models", {
    headers: {
      Authorization: authorization,
      "Editor-Version": "vscode/1.91.1",
      "Editor-Plugin-Version": "copilot-chat/0.17.1",
      "User-Agent": "GitHubCopilotChat/0.17.1",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return normalizeGitHubCopilotModels(await response.json());
}

export async function GET(req: NextRequest) {
  const systemModels = getAvailableSystemModels();
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return NextResponse.json({ systemModels, githubModels: [] });
  }

  try {
    const githubModels = await fetchGitHubModels(authHeader);
    return NextResponse.json({ systemModels, githubModels });
  } catch (error) {
    console.error("Error loading GitHub Copilot models for initial bootstrap:", error);
    return NextResponse.json({ systemModels, githubModels: [] });
  }
}

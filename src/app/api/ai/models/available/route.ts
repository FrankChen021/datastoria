import { normalizeGitHubCopilotModels } from "@/lib/ai/llm/github-copilot-models";
import { getAvailableSystemModels } from "@/lib/ai/llm/llm-provider-factory";
import { NextRequest, NextResponse } from "next/server";

interface AvailableModelsRequestBody {
  github?: {
    token?: string;
  };
}

async function fetchGitHubModels(token: string) {
  const response = await fetch("https://api.githubcopilot.com/models", {
    headers: {
      Authorization: `Bearer ${token}`,
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

export async function POST(req: NextRequest) {
  const systemModels = getAvailableSystemModels();
  let body: AvailableModelsRequestBody | undefined;

  try {
    body = (await req.json()) as AvailableModelsRequestBody;
  } catch {
    body = undefined;
  }

  const githubToken = body?.github?.token?.trim();
  if (!githubToken) {
    return NextResponse.json({ systemModels, githubModels: [] });
  }

  try {
    const githubModels = await fetchGitHubModels(githubToken);
    return NextResponse.json({ systemModels, githubModels });
  } catch (error) {
    console.error("Error loading GitHub Copilot models for initial bootstrap:", error);
    return NextResponse.json({ systemModels, githubModels: [] });
  }
}

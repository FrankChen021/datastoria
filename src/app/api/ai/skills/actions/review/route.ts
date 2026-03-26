import { getAuthenticatedUserEmail } from "@/auth";
import {
  LanguageModelProviderFactory,
  resolveModelConfig,
} from "@/lib/ai/llm/llm-provider-factory";
import { SkillPermissionManager } from "@/lib/ai/skills/skill-permission-manager";
import {
  buildSkillFileReviewPrompt,
  normalizeSkillReviewResponse,
  parseSkillReviewTextResponse,
  skillReviewModelOutputSchema,
  skillReviewRequestSchema,
} from "@/lib/ai/skills/skill-review";
import { Output, streamText } from "ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = getAuthenticatedUserEmail(req) ?? null;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!SkillPermissionManager.canUserEditSkill(userId)) {
    return NextResponse.json({ error: "Skill editing is not allowed" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = (await req.json()) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const parsed = skillReviewRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid review request",
      },
      { status: 400 }
    );
  }

  if (parsed.data.scope !== "file") {
    return NextResponse.json({ error: "Only file review is supported right now" }, { status: 400 });
  }

  const reviewedFile = parsed.data.target.files[0];

  try {
    const modelConfig = resolveModelConfig(parsed.data.model);
    const model = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );
    const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);
    const prompt = buildSkillFileReviewPrompt({
      skillId: parsed.data.skillId,
      path: reviewedFile.path,
      content: reviewedFile.content,
    });

    if (LanguageModelProviderFactory.supportsStructuredOutputs(modelConfig.modelId)) {
      const result = streamText({
        model,
        prompt,
        output: Output.object({
          schema: skillReviewModelOutputSchema,
        }),
        temperature,
      });

      return NextResponse.json(normalizeSkillReviewResponse(await result.output));
    }

    const result = streamText({
      model,
      prompt,
      temperature,
    });

    return NextResponse.json(
      normalizeSkillReviewResponse(parseSkillReviewTextResponse(await result.text))
    );
  } catch (error) {
    console.error("[/api/ai/skills/actions/review] Failed to review skill file", error);
    return NextResponse.json({ error: "Failed to review skill file" }, { status: 500 });
  }
}

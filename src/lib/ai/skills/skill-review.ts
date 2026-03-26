import { z } from "zod";

export const skillReviewModelSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  apiKey: z.string().min(1).optional(),
});

export const skillReviewFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const skillReviewRequestSchema = z
  .object({
    scope: z.enum(["file", "bundle"]),
    skillId: z.string().min(1),
    model: skillReviewModelSchema.optional(),
    target: z.object({
      primaryPath: z.string().min(1),
      files: z.array(skillReviewFileSchema).min(1),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "file") {
      if (value.target.files.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["target", "files"],
          message: "File review requires exactly one target file.",
        });
      }

      if (value.target.files[0] && value.target.files[0].path !== value.target.primaryPath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["target", "primaryPath"],
          message: "primaryPath must match the reviewed file path.",
        });
      }
    }
  });

export const skillReviewProposalSchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1),
  updatedContent: z.string(),
});

export const skillReviewModelOutputSchema = z.object({
  findings: z.string().min(1).optional(),
  proposals: z.array(skillReviewProposalSchema).default([]),
});

export const skillReviewResponseSchema = z.object({
  findings: z.string().min(1),
  proposals: z.array(skillReviewProposalSchema),
});

export type SkillReviewRequest = z.infer<typeof skillReviewRequestSchema>;
export type SkillReviewResponse = z.infer<typeof skillReviewResponseSchema>;

function buildFallbackSkillReviewMarkdown(input: {
  proposals: SkillReviewResponse["proposals"];
}): string {
  if (input.proposals.length > 0) {
    const proposalReason = input.proposals[0]?.reason.trim();
    if (proposalReason) {
      return `## Review Notes\n\n${proposalReason}`;
    }
  }

  return "## Review Notes\n\nNo major issues found in this file.";
}

export function normalizeSkillReviewResponse(
  response: z.infer<typeof skillReviewModelOutputSchema>
): SkillReviewResponse {
  const findings =
    response.findings?.trim() ||
    buildFallbackSkillReviewMarkdown({
      proposals: response.proposals,
    });

  return skillReviewResponseSchema.parse({
    findings,
    proposals: response.proposals,
  });
}

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

export function parseSkillReviewTextResponse(
  text: string
): z.infer<typeof skillReviewModelOutputSchema> {
  const normalizedText = stripMarkdownCodeFence(text);
  const parsed = JSON.parse(normalizedText) as unknown;
  return skillReviewModelOutputSchema.parse(parsed);
}

export function buildSkillFileReviewPrompt(input: {
  skillId: string;
  path: string;
  content: string;
}): string {
  return `You are reviewing one file from an AI skill bundle.

Your job:
1. Identify concrete quality issues in the file.
2. Suggest an improved full replacement for the file when useful.

Review rubric:
- clarity
- actionability
- factual precision
- ambiguity reduction
- maintainable structure
- consistency with a reference-style troubleshooting document

Rules:
- Focus only on the provided file.
- Keep findings concrete and file-grounded.
- Do not mention files that were not provided.
- If the current file is already strong, keep findings short and proposals minimal.
- The proposal must be a full replacement for the file, not a patch fragment.
- Preserve the file's intent and keep the revision concise.
- Return valid JSON only. Do not include markdown fences or extra commentary outside the JSON.
- Use this exact JSON shape:
  {
    "findings": "markdown review notes for the user",
    "proposals": [
      {
        "path": "${input.path}",
        "reason": "required string",
        "updatedContent": "full replacement file contents"
      }
    ]
  }
- "findings" should be concise markdown that the UI can render directly.
- Use short sections and bullets when helpful.
- If the file is already strong, say that briefly in markdown.
- "proposals" must be an array. Use [] when empty.

Skill id: ${input.skillId}
File path: ${input.path}

Current file content:
\`\`\`md
${input.content}
\`\`\``;
}

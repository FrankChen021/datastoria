/**
 * Server-Side Tools for the skill-based agent (chat-v2).
 * Tool definitions live here; execution is implemented in the corresponding modules (e.g. skill-tool).
 */
import { tool } from "ai";
import { z } from "zod";
import { SkillTool } from "./skill-tool";

export const ServerTools = {
  skill: tool({
    description: SkillTool.getToolDescription(),
    inputSchema: z.object({
      names: z
        .array(z.string())
        .describe(
          "Skill name(s) to load (e.g. ['optimization'] or ['optimization', 'visualization'])."
        )
        .optional(),
      resources: z
        .array(
          z.object({
            skill: z
              .string()
              .describe(
                "Skill name (frontmatter `name` or folder name), e.g. 'clickhouse-best-practices'."
              ),
            paths: z
              .array(z.string())
              .min(1)
              .describe(
                "Relative paths within that skill, e.g. ['AGENTS.md', 'rules/schema-pk-plan-before-creation.md']."
              ),
          })
        )
        .optional()
        .describe(
          "Optional additional resources to load for specific skills (e.g. AGENTS.md or individual rule files)."
        ),
    }),
    execute: SkillTool.execute,
  }),
};
